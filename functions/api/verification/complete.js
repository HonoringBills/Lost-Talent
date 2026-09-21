import {
  alertDuplicate,
  clientIp,
  consumeToken,
  db,
  encryptIp,
  ensureEntitlement,
  escapeHtml,
  getToken,
  html,
  networkFingerprint,
  normalizeActivision,
  queueRoleJob,
  required,
  roleForUnverified,
  roleForVerified,
  sha256Base64Url,
} from '../../_lib/verification.js'

function result(ok, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lost Talent Verification</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 80% 10%,#d4aa3e18,transparent 28%),#050505;color:#fff;font-family:system-ui;padding:24px}.c{width:min(650px,100%);padding:32px;border:1px solid #4a3b17;background:#10100d;text-align:center;box-shadow:0 30px 90px #000b}h1{color:${ok?'#ffd66b':'#ef7d7d'}}p{color:#b5afa2;line-height:1.65}</style></head><body><main class="c"><h1>${ok?'Ready to compete':'Verification review required'}</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

async function first(env, path) {
  const rows = await db(env, path)
  return rows?.[0] || null
}

async function createIdentityFlag(env, guildScope, currentId, matchedId, fingerprint, reason) {
  const [discordId, matchedDiscordId] = [String(currentId), String(matchedId)].sort()
  const rows = await db(env, 'alt_detection_flags?on_conflict=guild_scope,discord_user_id,matched_discord_user_id,ip_fingerprint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      guild_scope: guildScope,
      discord_user_id: discordId,
      matched_discord_user_id: matchedDiscordId,
      ip_fingerprint: fingerprint || null,
      reason,
      detected_at: new Date().toISOString(),
      resolved_at: null,
      resolution_note: null,
    }),
  })
  return rows?.[0] || null
}

async function resolveApprovedRegistrationSlots(env, profile, activisionKey) {
  const slots = await db(
    env,
    `roster_registration_slots?select=*&activision_key=eq.${encodeURIComponent(activisionKey)}&approval_status=eq.approved&resolution_status=neq.removed`,
  ) || []

  let queuedRoles = 0

  for (const slot of slots) {
    await db(env, `roster_registration_slots?id=eq.${encodeURIComponent(slot.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        profile_id: profile.id,
        resolution_status: 'linked',
      }),
    })

    let bindingType = ''
    let entityId = ''
    let guildScope = 'league'

    if (slot.scope === 'league') {
      bindingType = 'league_team'
      entityId = slot.league_team_id
    } else if (slot.scope === 'tournament') {
      bindingType = 'tournament_entry'
      entityId = slot.tournament_entry_id
    } else if (slot.scope === 'org') {
      bindingType = 'org_team'
      entityId = slot.org_team_id
      guildScope = 'org'
    }

    if (!bindingType || !entityId) continue

    const binding = await first(
      env,
      `discord_role_bindings?select=discord_role_id&guild_scope=eq.${guildScope}&binding_type=eq.${bindingType}&entity_id=eq.${encodeURIComponent(entityId)}&active=eq.true&limit=1`,
    )

    if (!binding?.discord_role_id) continue

    await ensureEntitlement(
      env,
      profile.id,
      guildScope,
      binding.discord_role_id,
      `approved_${slot.scope}_registration`,
      slot.id,
    )
    await queueRoleJob(
      env,
      profile.id,
      guildScope,
      'add_role',
      binding.discord_role_id,
      { registration_slot_id: slot.id },
    )
    queuedRoles += 1
  }

  return { slotsResolved: slots.length, queuedRoles }
}

export async function onRequestPost({ request, env }) {
  required(env, ['LTL_FINGERPRINT_SECRET', 'LTL_IP_ENCRYPTION_SECRET'])

  const form = await request.formData().catch(() => null)
  const rawToken = String(form?.get('token') || '')
  const token = rawToken ? await getToken(env, rawToken) : null

  if (!token) {
    return html(result(false, 'This link is invalid, expired, or already used. Return to Discord and request a new verification link.'), 400)
  }

  const ack = String(form?.get('security_ack') || '')
  if (ack !== 'yes') {
    return html(result(false, 'The security notice must be acknowledged to complete verification.'), 400)
  }

  const { display: activisionId, key: activisionKey } = normalizeActivision(form?.get('activision_id'))
  const intent = String(form?.get('intent') || '').trim()

  if (!activisionId || !activisionId.includes('#') || activisionId.length < 4) {
    return html(result(false, 'Enter your full Activision ID including the #numbers.'), 400)
  }

  const ip = clientIp(request)
  if (!ip) {
    return html(result(false, 'The security service could not read the network information required for this verification. Please try again from a normal browser connection.'), 400)
  }

  const fingerprint = await networkFingerprint(ip, env.LTL_FINGERPRINT_SECRET)
  const encrypted = await encryptIp(ip, env.LTL_IP_ENCRYPTION_SECRET)
  const userAgentHash = await sha256Base64Url(request.headers.get('User-Agent') || '')
  const now = new Date().toISOString()

  const activisionProfile = await first(
    env,
    `profiles?select=*&activision_key=eq.${encodeURIComponent(activisionKey)}&limit=1`,
  )
  const discordProfile = await first(
    env,
    `profiles?select=*&discord_user_id=eq.${encodeURIComponent(token.discord_user_id)}&limit=1`,
  )

  if (activisionProfile?.discord_user_id && activisionProfile.discord_user_id !== token.discord_user_id) {
    await createIdentityFlag(
      env,
      token.guild_scope,
      token.discord_user_id,
      activisionProfile.discord_user_id,
      fingerprint,
      'activision_identity_conflict',
    )
    await alertDuplicate(
      env,
      token.guild_scope,
      token.discord_user_id,
      activisionProfile.discord_user_id,
      fingerprint,
      'activision_identity_conflict',
    )
    await consumeToken(env, token.id)
    return html(result(false, 'That Activision ID is already linked to a different Discord account. Staff has been asked to review the identity conflict; the existing link was not overwritten.'), 409)
  }

  if (discordProfile?.activision_key && discordProfile.activision_key !== activisionKey) {
    await createIdentityFlag(
      env,
      token.guild_scope,
      token.discord_user_id,
      token.discord_user_id,
      fingerprint,
      'discord_identity_change',
    )
    await consumeToken(env, token.id)
    return html(result(false, 'Your Discord account is already linked to a different Activision ID. Staff review is required before changing a verified identity.'), 409)
  }

  let profile = discordProfile || activisionProfile

  if (!profile) {
    const created = await db(env, 'profiles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        discord_user_id: token.discord_user_id,
        activision_id: activisionId,
        activision_key: activisionKey,
        primary_intent: intent || null,
        verification_status: 'verified',
        verified_at: now,
        created_at: now,
        updated_at: now,
      }),
    })
    profile = created?.[0]
  } else {
    const updated = await db(env, `profiles?id=eq.${encodeURIComponent(profile.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        discord_user_id: token.discord_user_id,
        activision_id: activisionId,
        activision_key: activisionKey,
        primary_intent: intent || profile.primary_intent || null,
        verification_status: 'verified',
        verified_at: now,
        updated_at: now,
      }),
    })
    profile = updated?.[0] || profile
  }

  if (!profile?.id) {
    return html(result(false, 'The player profile could not be created. Please return to Discord and try again.'), 500)
  }

  await db(env, 'activision_aliases?on_conflict=profile_id,activision_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      profile_id: profile.id,
      activision_id: activisionId,
      activision_key: activisionKey,
      first_seen_at: now,
      last_seen_at: null,
    }),
  })

  const matches = await db(
    env,
    `network_verifications?select=discord_user_id,verified_at,last_seen_at&guild_scope=eq.${token.guild_scope}&ip_fingerprint=eq.${encodeURIComponent(fingerprint)}&discord_user_id=neq.${encodeURIComponent(token.discord_user_id)}&order=last_seen_at.desc&limit=100`,
  ) || []

  await db(env, 'network_verifications', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      profile_id: profile.id,
      guild_scope: token.guild_scope,
      discord_user_id: token.discord_user_id,
      activision_key: activisionKey,
      intent: intent || null,
      ip_fingerprint: fingerprint,
      ip_ciphertext: encrypted.ciphertext,
      ip_iv: encrypted.iv,
      ip_key_version: encrypted.keyVersion,
      user_agent_hash: userAgentHash,
      verified_at: now,
      last_seen_at: now,
      active_in_guild: true,
      left_at: null,
    }),
  })

  const verifiedRole = roleForVerified(env, token.guild_scope)
  const unverifiedRole = roleForUnverified(env, token.guild_scope)

  if (verifiedRole) {
    await ensureEntitlement(env, profile.id, token.guild_scope, verifiedRole, 'verified_player', '')
    await queueRoleJob(env, profile.id, token.guild_scope, 'add_role', verifiedRole, { source: 'intent_verification' })
  }
  if (unverifiedRole) {
    await queueRoleJob(env, profile.id, token.guild_scope, 'remove_role', unverifiedRole, { source: 'intent_verification' })
  }

  const registration = await resolveApprovedRegistrationSlots(env, profile, activisionKey)

  const distinctMatchedIds = [...new Set(matches.map((item) => String(item.discord_user_id)).filter(Boolean))]
  for (const matchedId of distinctMatchedIds) {
    const flag = await createIdentityFlag(
      env,
      token.guild_scope,
      token.discord_user_id,
      matchedId,
      fingerprint,
      'shared_network_fingerprint',
    )
    if (flag) {
      const message = await alertDuplicate(
        env,
        token.guild_scope,
        token.discord_user_id,
        matchedId,
        fingerprint,
        'shared_network_fingerprint',
      )
      if (message?.id) {
        await db(env, `alt_detection_flags?id=eq.${encodeURIComponent(flag.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ alert_message_id: message.id }),
        }).catch(() => null)
      }
    }
  }

  await consumeToken(env, token.id)

  const roleMessage = registration.queuedRoles
    ? ` ${registration.queuedRoles} approved roster role${registration.queuedRoles === 1 ? '' : 's'} were also queued automatically.`
    : ''

  return html(result(
    true,
    `Your Discord account is now linked to ${activisionId}.${roleMessage} You can return to Discord; role synchronization normally completes within a few seconds.`,
  ))
}
