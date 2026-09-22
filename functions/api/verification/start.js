import { createVerificationToken, json, relayAuthorized } from '../../_lib/verification.js'

export async function onRequestPost({ request, env }) {
  if (!relayAuthorized(request, env)) return json({ error: 'Unauthorized.' }, 401)

  const body = await request.json().catch(() => ({}))
  const guildScope = body.guildScope === 'org' ? 'org' : 'league'
  const discordUserId = String(body.discordId || '').trim()

  if (!/^\d{15,22}$/.test(discordUserId)) {
    return json({ error: 'Invalid Discord user ID.' }, 400)
  }

  const primaryGuild = String(env.PRIMARY_GUILD_ID || '1537667566502154381').trim()
  const expectedGuild = String(
    guildScope === 'org'
      ? (env.ORG_GUILD_ID || primaryGuild)
      : (env.LEAGUE_GUILD_ID || primaryGuild),
  ).trim()

  if (expectedGuild && String(body.guildId || '') !== expectedGuild) {
    return json({ error: 'Guild mismatch.' }, 400)
  }

  const token = await createVerificationToken(env, guildScope, discordUserId)
  const origin = String(env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '')

  return json({
    ok: true,
    verifyUrl: `${origin}/verify?token=${encodeURIComponent(token.rawToken)}`,
    expiresInSeconds: token.expiresInSeconds,
  })
}
