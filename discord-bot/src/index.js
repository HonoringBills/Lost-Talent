import { Client, Events, GatewayIntentBits } from 'discord.js'
import { createClient } from '@supabase/supabase-js'

const required = ['DISCORD_TOKEN', 'VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'ORG_GUILD_ID', 'LEAGUE_GUILD_ID']
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const guildIds = {
  org: process.env.ORG_GUILD_ID,
  league: process.env.LEAGUE_GUILD_ID,
}

async function loadProfile(profileId) {
  const { data, error } = await db
    .from('profiles')
    .select('id, discord_user_id, activision_id, verification_status')
    .eq('id', profileId)
    .single()
  if (error) throw error
  if (!data.discord_user_id) throw new Error('Verified profile has no Discord user ID')
  return data
}

async function markJob(jobId, patch) {
  const { error } = await db.from('discord_sync_jobs').update(patch).eq('id', jobId)
  if (error) throw error
}

async function processJob(job) {
  await markJob(job.id, { status: 'processing', attempts: job.attempts + 1, last_error: null })

  try {
    const profile = await loadProfile(job.profile_id)
    const guildId = guildIds[job.guild_scope]
    if (!guildId) throw new Error(`No guild configured for scope ${job.guild_scope}`)

    const guild = await discord.guilds.fetch(guildId)
    const member = await guild.members.fetch(profile.discord_user_id)

    if (job.action === 'add_role') {
      if (!job.discord_role_id) throw new Error('add_role job is missing discord_role_id')
      await member.roles.add(job.discord_role_id, `LTL sync job ${job.id}`)
    } else if (job.action === 'remove_role') {
      if (!job.discord_role_id) throw new Error('remove_role job is missing discord_role_id')
      await member.roles.remove(job.discord_role_id, `LTL sync job ${job.id}`)
    } else if (job.action === 'sync_member') {
      // Reserved for the full desired-state role reconciliation worker.
      // The payload will contain the approved role set when this is enabled.
    } else {
      throw new Error(`Unsupported sync action: ${job.action}`)
    }

    await markJob(job.id, { status: 'complete', completed_at: new Date().toISOString() })
    console.log(`Completed Discord sync job ${job.id}`)
  } catch (error) {
    const delayMinutes = Math.min(60, 2 ** Math.min(job.attempts + 1, 5))
    const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString()
    await markJob(job.id, {
      status: 'failed',
      last_error: String(error?.message || error),
      next_attempt_at: nextAttempt,
    })
    console.error(`Discord sync job ${job.id} failed:`, error)
  }
}

async function pollSyncJobs() {
  const { data: jobs, error } = await db
    .from('discord_sync_jobs')
    .select('id, profile_id, guild_scope, action, discord_role_id, payload, status, attempts, next_attempt_at')
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Unable to load Discord sync jobs:', error)
    return
  }

  for (const job of jobs ?? []) await processJob(job)
}

discord.once(Events.ClientReady, (client) => {
  console.log(`Lost Talent bot ready as ${client.user.tag}`)
  pollSyncJobs().catch(console.error)
  setInterval(() => pollSyncJobs().catch(console.error), 15_000)
})

discord.login(process.env.DISCORD_TOKEN)
