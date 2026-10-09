import { db, json, normalizeActivision } from './verification.js'

function bearerToken(request) {
  return String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || ''
}

function supabaseSecret(env) {
  return String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
}

export async function getAuthUser(request, env) {
  const accessToken = bearerToken(request)
  const secret = supabaseSecret(env)
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '')
  if (!accessToken || !secret || !base) return null

  const response = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: secret,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) return null
  return response.json()
}

function discordIdentity(user) {
  const discord = Array.isArray(user?.identities)
    ? user.identities.find((identity) => identity?.provider === 'discord')
    : null
  const data = discord?.identity_data || {}
  return String(
    data.provider_id
      || data.sub
      || user?.user_metadata?.provider_id
      || user?.user_metadata?.sub
      || '',
  ).trim()
}

export async function requireStaff(request, env, roles = null) {
  const user = await getAuthUser(request, env)
  if (!user?.id) return { error: json({ error: 'Sign in required.' }, 401) }

  const discordUserId = discordIdentity(user)
  if (!/^\d{15,22}$/.test(discordUserId)) {
    return { error: json({ error: 'Discord identity is required for staff access.' }, 403) }
  }

  const profiles = await db(
    env,
    `profiles?select=id,auth_user_id,discord_user_id,discord_username&discord_user_id=eq.${encodeURIComponent(discordUserId)}&limit=1`,
  )
  const profile = profiles?.[0] || null
  if (!profile) return { error: json({ error: 'This Discord account is not on the staff allowlist.' }, 403) }

  if (profile.auth_user_id && profile.auth_user_id !== user.id) {
    return { error: json({ error: 'This staff identity is already linked to another login.' }, 403) }
  }

  if (!profile.auth_user_id) {
    await db(env, `profiles?id=eq.${encodeURIComponent(profile.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        auth_user_id: user.id,
        discord_username: user?.user_metadata?.full_name || user?.user_metadata?.name || profile.discord_username || null,
        updated_at: new Date().toISOString(),
      }),
    })
  }

  const staffRows = await db(
    env,
    `staff_members?select=profile_id,role,active&profile_id=eq.${encodeURIComponent(profile.id)}&active=eq.true&limit=1`,
  )
  const staff = staffRows?.[0] || null
  if (!staff) return { error: json({ error: 'Staff access is not active for this account.' }, 403) }
  if (roles && !roles.includes(staff.role)) {
    return { error: json({ error: 'Your staff role cannot perform this action.' }, 403) }
  }

  return {
    user,
    profile: { ...profile, auth_user_id: user.id },
    staff,
    discordUserId,
  }
}

export async function audit(env, actorProfileId, entityType, entityId, action, beforeData = null, afterData = null) {
  await db(env, 'audit_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_profile_id: actorProfileId,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      action,
      before_data: beforeData,
      after_data: afterData,
    }),
  })
}

export async function contentMap(env) {
  const rows = await db(env, 'site_content?select=key,value,updated_at&order=key.asc')
  return Object.fromEntries((rows || []).map((row) => [row.key, row.value]))
}

export async function resolveActivisionProfile(env, activisionId) {
  const normalized = normalizeActivision(activisionId)
  if (!normalized.display) return { ...normalized, profile: null }
  const rows = await db(
    env,
    `profiles?select=id,activision_id,activision_key,display_name,discord_username&activision_key=eq.${encodeURIComponent(normalized.key)}&limit=1`,
  )
  return { ...normalized, profile: rows?.[0] || null }
}

export const ADMIN_ROLES = ['owner', 'org_admin', 'commissioner', 'deputy_commissioner']
