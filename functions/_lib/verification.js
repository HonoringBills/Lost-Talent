const DISCORD_API = 'https://discord.com/api/v10'
const TOKEN_TTL_MS = 15 * 60 * 1000

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    },
  })
}

export function required(env, names) {
  const missing = names.filter((name) => !String(env[name] || '').trim())
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`)
}

export function safeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left.length !== right.length) return false
  let result = 0
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return result === 0
}

export function relayAuthorized(request, env) {
  const token = String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || ''
  return Boolean(env.LTL_EVENT_SECRET) && safeEqual(token, env.LTL_EVENT_SECRET)
}

export async function db(env, path, options = {}) {
  required(env, ['SUPABASE_URL'])
  const supabaseSecret = String(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
  ).trim()
  if (!supabaseSecret) {
    throw new Error('Missing configuration: SUPABASE_SECRET_KEY')
  }

  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseSecret,
      Authorization: `Bearer ${supabaseSecret}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = response.status === 204 ? '' : await response.text()
  if (!response.ok) throw new Error(text || `Database request failed (${response.status}).`)
  return text ? JSON.parse(text) : null
}

export async function discord(env, path, options = {}) {
  required(env, ['DISCORD_BOT_TOKEN'])
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = response.status === 204 ? '' : await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { /* raw response */ }
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${payload?.message || text || 'request failed'}`)
  return payload
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)))
  return bytesToBase64Url(new Uint8Array(digest))
}

export async function networkFingerprint(ip, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`ltl-network-fingerprint-v1\u0000${ip}`),
  )
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function encryptIp(ip, secret) {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`ltl-ip-encryption-v1\u0000${String(secret)}`),
  )
  const key = await crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(ip))
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
    keyVersion: 1,
  }
}

export function clientIp(request) {
  const cf = String(request.headers.get('CF-Connecting-IP') || '').trim()
  if (cf) return cf
  return String(request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || null
}

export function normalizeActivision(value) {
  const display = String(value || '').trim()
  return { display, key: display.toLowerCase().replace(/\s+/g, ' ') }
}

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

export async function getToken(env, rawToken) {
  const tokenHash = await sha256Base64Url(rawToken)
  const rows = await db(env, `verification_tokens?select=*&token_hash=eq.${encodeURIComponent(tokenHash)}&used_at=is.null&limit=1`)
  const row = rows?.[0] || null
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null
  return row
}

export async function consumeToken(env, tokenId) {
  await db(env, `verification_tokens?id=eq.${encodeURIComponent(tokenId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ used_at: new Date().toISOString() }),
  })
}

export async function createVerificationToken(env, guildScope, discordUserId) {
  const rawToken = randomToken()
  const tokenHash = await sha256Base64Url(rawToken)
  const now = new Date()
  await db(env, 'verification_tokens', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      guild_scope: guildScope,
      discord_user_id: discordUserId,
      token_hash: tokenHash,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    }),
  })
  return { rawToken, expiresInSeconds: TOKEN_TTL_MS / 1000 }
}

export function guildIdForScope(env, guildScope) {
  const primary = String(env.PRIMARY_GUILD_ID || '1537667566502154381').trim()
  if (guildScope === 'org') return String(env.ORG_GUILD_ID || primary).trim()
  return String(env.LEAGUE_GUILD_ID || primary).trim()
}

export async function getGuildConfig(env, guildScope) {
  const guildId = guildIdForScope(env, guildScope)
  const rows = await db(
    env,
    `discord_guild_configs?select=*&guild_id=eq.${encodeURIComponent(guildId)}&limit=1`,
  )
  return rows?.[0] || null
}

export async function verificationRoleIds(env, guildScope) {
  const config = await getGuildConfig(env, guildScope).catch(() => null)

  const verified = String(
    config?.verified_role_id
      || (guildScope === 'org'
        ? (env.ROLE_ORG_VERIFIED_PLAYER || env.ROLE_VERIFIED_PLAYER || '')
        : (env.ROLE_LEAGUE_VERIFIED_PLAYER || env.ROLE_VERIFIED_PLAYER || '')),
  ).trim()

  const unverified = String(
    config?.unverified_role_id
      || (guildScope === 'org'
        ? (env.ROLE_ORG_UNVERIFIED || env.ROLE_UNVERIFIED || '')
        : (env.ROLE_LEAGUE_UNVERIFIED || env.ROLE_UNVERIFIED || '')),
  ).trim()

  return { verified, unverified, config }
}

export async function queueRoleJob(env, profileId, guildScope, action, roleId, payload = {}) {
  if (!roleId) return null
  const rows = await db(env, 'discord_sync_jobs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      profile_id: profileId,
      guild_scope: guildScope,
      action,
      discord_role_id: roleId,
      payload,
      status: 'queued',
      next_attempt_at: new Date().toISOString(),
    }),
  })
  return rows?.[0] || null
}

export async function ensureEntitlement(env, profileId, guildScope, roleId, sourceType, sourceId = '') {
  if (!roleId) return null
  const rows = await db(env, 'discord_role_entitlements?on_conflict=profile_id,guild_scope,discord_role_id,source_type,source_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      profile_id: profileId,
      guild_scope: guildScope,
      discord_role_id: roleId,
      source_type: sourceType,
      source_id: String(sourceId || ''),
      active: true,
      revoked_at: null,
    }),
  })
  return rows?.[0] || null
}

export async function alertDuplicate(env, guildScope, currentId, matchedId, fingerprint, reason = 'shared_network_fingerprint') {
  const config = await getGuildConfig(env, guildScope).catch(() => null)
  const channelId = String(
    config?.security_alert_channel_id || env.DISCORD_SECURITY_ALERT_CHANNEL_ID || '',
  ).trim()
  if (!channelId) return null
  const staffRole = String(config?.staff_role_id || env.DISCORD_STAFF_ROLE_ID || '').trim()
  const reasonText = reason === 'activision_identity_conflict'
    ? 'The submitted Activision ID is already linked to a different Discord account.'
    : 'The same privacy-preserving network fingerprint was observed on two Discord accounts during verification.'
  return discord(env, `/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: staffRole ? `<@&${staffRole}> player identity review required.` : undefined,
      allowed_mentions: { parse: [], roles: staffRole ? [staffRole] : [] },
      embeds: [{
        title: reason === 'activision_identity_conflict'
          ? '⚠️ ACTIVISION IDENTITY CONFLICT'
          : '⚠️ POSSIBLE ALT / SHARED NETWORK',
        description: `${reasonText}\n\nThis is a staff-review signal only. Do not automatically discipline a player from this signal alone.`,
        color: 0xd4aa3e,
        fields: [
          { name: 'Account verifying now', value: `<@${currentId}> (\`${currentId}\`)` },
          { name: 'Matched account', value: `<@${matchedId}> (\`${matchedId}\`)` },
          ...(fingerprint ? [{ name: 'Fingerprint', value: `\`${fingerprint.slice(0, 14)}…\`` }] : []),
          { name: 'Why review is required', value: reason === 'activision_identity_conflict'
            ? 'An Activision ID can only be automatically linked to one Discord identity.'
            : 'Households, VPNs, schools, workplaces, carriers and NAT can legitimately share a public network.' },
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch(() => null)
}
