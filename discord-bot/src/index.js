import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
} from 'discord.js'
import { createClient } from '@supabase/supabase-js'

const required = [
  'DISCORD_TOKEN',
  'VITE_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'ORG_GUILD_ID',
  'LEAGUE_GUILD_ID',
  'LTL_API_URL',
  'LTL_EVENT_SECRET',
]
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

function scopeForGuild(guildId) {
  if (String(guildId) === String(guildIds.org)) return 'org'
  if (String(guildId) === String(guildIds.league)) return 'league'
  return null
}

function unverifiedRole(scope) {
  return String(
    scope === 'org'
      ? process.env.ROLE_ORG_UNVERIFIED || process.env.ROLE_UNVERIFIED || ''
      : process.env.ROLE_LEAGUE_UNVERIFIED || process.env.ROLE_UNVERIFIED || '',
  ).trim()
}

function verifiedRole(scope) {
  return String(
    scope === 'org'
      ? process.env.ROLE_ORG_VERIFIED_PLAYER || process.env.ROLE_VERIFIED_PLAYER || ''
      : process.env.ROLE_LEAGUE_VERIFIED_PLAYER || process.env.ROLE_VERIFIED_PLAYER || '',
  ).trim()
}

async function api(path, body) {
  const response = await fetch(`${String(process.env.LTL_API_URL).replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LTL_EVENT_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { /* raw */ }
  if (!response.ok) throw new Error(payload?.error || text || `LTL API ${response.status}`)
  return payload
}

async function loadProfile(profileId) {
  const { data, error } = await db
    .from('profiles')
    .select('id, discord_user_id, activision_id, activision_key, verification_status')
    .eq('id', profileId)
    .single()
  if (error) throw error
  if (!data.discord_user_id) throw new Error('Verified profile has no Discord user ID')
  return data
}

async function loadProfileByDiscord(discordUserId) {
  const { data, error } = await db
    .from('profiles')
    .select('id, discord_user_id, activision_id, activision_key, verification_status')
    .eq('discord_user_id', String(discordUserId))
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function loadEntitlements(profileId, scope) {
  const { data, error } = await db
    .from('discord_role_entitlements')
    .select('discord_role_id, source_type, source_id')
    .eq('profile_id', profileId)
    .eq('guild_scope', scope)
    .eq('active', true)
  if (error) throw error
  return data || []
}

async function markJob(jobId, patch) {
  const { error } = await db.from('discord_sync_jobs').update(patch).eq('id', jobId)
  if (error) throw error
}

async function requeueWaitingJobs(profileId, scope) {
  const { error } = await db
    .from('discord_sync_jobs')
    .update({
      status: 'queued',
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('profile_id', profileId)
    .eq('guild_scope', scope)
    .eq('status', 'waiting_for_member')
  if (error) throw error
}

async function reconcileMember(member, profile, scope) {
  const entitlements = await loadEntitlements(profile.id, scope)
  const desiredRoleIds = new Set(entitlements.map((item) => String(item.discord_role_id)).filter(Boolean))

  const fallbackVerified = verifiedRole(scope)
  if (profile.verification_status === 'verified' && fallbackVerified) {
    desiredRoleIds.add(fallbackVerified)
  }

  for (const roleId of desiredRoleIds) {
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, 'Lost Talent verified entitlement reconciliation')
    }
  }

  const pendingRole = unverifiedRole(scope)
  if (profile.verification_status === 'verified' && pendingRole && member.roles.cache.has(pendingRole)) {
    await member.roles.remove(pendingRole, 'Lost Talent player verification complete')
  }

  await requeueWaitingJobs(profile.id, scope)
  return desiredRoleIds.size
}

async function sendIntentVerification(member, scope) {
  const pendingRole = unverifiedRole(scope)
  if (pendingRole && !member.roles.cache.has(pendingRole)) {
    await member.roles.add(pendingRole, 'Lost Talent player onboarding').catch(() => null)
  }

  const payload = await api('/api/verification/start', {
    guildScope: scope,
    guildId: member.guild.id,
    discordId: member.id,
  })

  const embed = new EmbedBuilder()
    .setColor(0xd4aa3e)
    .setTitle('LOST TALENT // PLAYER INTENT')
    .setDescription([
      'Welcome to Lost Talent.',
      '',
      'Before the server unlocks your player access, complete the one-time intent form below.',
      '',
      '**You will be asked for:**',
      '• Your Activision ID',
      '• What you are joining for (League / Tournaments / 8s / Org)',
      '',
      'Once your Activision ID is linked, captains can register you using that ID and the bot can automatically apply approved roster roles — even if the registration existed before you joined.',
      '',
      'The verification page also performs the same privacy-conscious duplicate-account security check used for league integrity. A network match is a staff-review signal only, not automatic proof of an alt.',
    ].join('\n'))
    .setFooter({ text: 'The verification link expires in 15 minutes and can be used once.' })

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Start Player Verification')
      .setStyle(ButtonStyle.Link)
      .setURL(payload.verifyUrl),
  )

  await member.send({ embeds: [embed], components: [row] })
  return payload
}

async function processJob(job) {
  await markJob(job.id, {
    status: 'processing',
    attempts: job.attempts + 1,
    last_error: null,
  })

  try {
    const profile = await loadProfile(job.profile_id)
    const guildId = guildIds[job.guild_scope]
    if (!guildId) throw new Error(`No guild configured for scope ${job.guild_scope}`)

    const guild = await discord.guilds.fetch(guildId)
    const member = await guild.members.fetch(profile.discord_user_id)

    if (job.action === 'add_role') {
      if (!job.discord_role_id) throw new Error('add_role job is missing discord_role_id')
      if (!member.roles.cache.has(job.discord_role_id)) {
        await member.roles.add(job.discord_role_id, `LTL sync job ${job.id}`)
      }
    } else if (job.action === 'remove_role') {
      if (!job.discord_role_id) throw new Error('remove_role job is missing discord_role_id')
      if (member.roles.cache.has(job.discord_role_id)) {
        await member.roles.remove(job.discord_role_id, `LTL sync job ${job.id}`)
      }
    } else if (job.action === 'sync_member') {
      await reconcileMember(member, profile, job.guild_scope)
    } else {
      throw new Error(`Unsupported sync action: ${job.action}`)
    }

    await markJob(job.id, {
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    console.log(`Completed Discord sync job ${job.id}`)
  } catch (error) {
    const isMissingMember = error?.code === 10007 || /unknown member/i.test(String(error?.message || ''))

    if (isMissingMember) {
      await markJob(job.id, {
        status: 'waiting_for_member',
        last_error: 'Discord member is not currently in the target guild. Will retry on join.',
      })
      return
    }

    const attempts = job.attempts + 1
    const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5))
    const exhausted = attempts >= 8

    await markJob(job.id, {
      status: exhausted ? 'failed' : 'queued',
      last_error: String(error?.message || error),
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
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
    .limit(20)

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

discord.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return
  const scope = scopeForGuild(member.guild.id)
  if (!scope) return

  try {
    const profile = await loadProfileByDiscord(member.id)

    if (profile?.verification_status === 'verified') {
      const restored = await reconcileMember(member, profile, scope)
      console.log(`Restored ${restored} Lost Talent role entitlement(s) for ${member.user.tag}`)
      return
    }

    await sendIntentVerification(member, scope)
    console.log(`Sent Lost Talent intent verification to ${member.user.tag}`)
  } catch (error) {
    console.error(`Unable to onboard ${member.user.tag}:`, error)
  }
})

discord.on(Events.GuildMemberRemove, async (member) => {
  if (member.user?.bot) return
  const scope = scopeForGuild(member.guild.id)
  if (!scope) return

  await api('/api/verification/member-leave', {
    guildScope: scope,
    guildId: member.guild.id,
    discordId: member.id,
  }).catch((error) => {
    console.error('Unable to record Lost Talent member leave:', error)
  })
})

discord.login(process.env.DISCORD_TOKEN)
