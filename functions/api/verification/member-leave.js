import { db, json, relayAuthorized } from '../../_lib/verification.js'

export async function onRequestPost({ request, env }) {
  if (!relayAuthorized(request, env)) return json({ error: 'Unauthorized.' }, 401)

  const body = await request.json().catch(() => ({}))
  const discordId = String(body.discordId || '').trim()
  const guildScope = body.guildScope === 'org' ? 'org' : 'league'

  if (!discordId) return json({ error: 'Missing Discord ID.' }, 400)

  await db(
    env,
    `network_verifications?guild_scope=eq.${guildScope}&discord_user_id=eq.${encodeURIComponent(discordId)}&active_in_guild=eq.true`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        active_in_guild: false,
        left_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }),
    },
  )

  return json({ ok: true })
}
