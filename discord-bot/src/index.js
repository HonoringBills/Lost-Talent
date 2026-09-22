import 'dotenv/config'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_GUILD_ID = '1537667566502154381'
const primaryGuildId = String(
  process.env.PRIMARY_GUILD_ID
  || process.env.LEAGUE_GUILD_ID
  || process.env.ORG_GUILD_ID
  || DEFAULT_GUILD_ID,
).trim()

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ''
const db = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing environment variable: DISCORD_TOKEN')
  process.exit(1)
}

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

const guildIds = {
  org: process.env.ORG_GUILD_ID || primaryGuildId,
  league: process.env.LEAGUE_GUILD_ID || primaryGuildId,
}

function scopeForGuild(guildId) {
  const id = String(guildId)
  if (id === primaryGuildId) return 'league'
  if (id === String(guildIds.league)) return 'league'
  if (id === String(guildIds.org)) return 'org'
  return null
}

function apiConfigured() {
  return Boolean(process.env.LTL_API_URL && process.env.LTL_EVENT_SECRET)
}

async function hydrateGuildConfigFromDatabase() {
  if (!db) return false

  const { data, error } = await db
    .from('discord_guild_configs')
    .select('verified_role_id,unverified_role_id,free_agent_role_id,captain_role_id,staff_role_id,security_alert_channel_id')
    .eq('guild_id', primaryGuildId)
    .maybeSingle()

  if (error) throw error
  if (!data) return false

  if (data.verified_role_id) process.env.ROLE_VERIFIED_PLAYER = String(data.verified_role_id)
  if (data.unverified_role_id) process.env.ROLE_UNVERIFIED = String(data.unverified_role_id)
  if (data.free_agent_role_id) process.env.ROLE_FREE_AGENT = String(data.free_agent_role_id)
  if (data.captain_role_id) process.env.ROLE_CAPTAIN = String(data.captain_role_id)
  if (data.staff_role_id) process.env.DISCORD_STAFF_ROLE_ID = String(data.staff_role_id)
  if (data.security_alert_channel_id) {
    process.env.DISCORD_SECURITY_ALERT_CHANNEL_ID = String(data.security_alert_channel_id)
  }

  return true
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
  if (!apiConfigured()) throw new Error('LTL_API_URL / LTL_EVENT_SECRET are not configured yet.')
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


function inviteUrl(clientId) {
  const permissions = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
  ]).bitfield.toString()

  const query = new URLSearchParams({
    client_id: String(clientId),
    scope: 'bot applications.commands',
    permissions,
    guild_id: primaryGuildId,
    disable_guild_select: 'true',
  })

  return 'https://discord.com/oauth2/authorize?' + query.toString()
}

async function findOrCreateRole(guild, name, color, options = {}) {
  await guild.roles.fetch()
  let role = guild.roles.cache.find((candidate) => candidate.name === name)

  if (!role) {
    role = await guild.roles.create({
      name,
      color,
      hoist: Boolean(options.hoist),
      mentionable: Boolean(options.mentionable),
      reason: 'Lost Talent automated server setup',
    })
  }

  return role
}

async function findOrCreateCategory(guild, name) {
  await guild.channels.fetch()
  let category = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === name,
  )

  if (!category) {
    category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      reason: 'Lost Talent automated server setup',
    })
  }

  return category
}

async function findOrCreateTextChannel(guild, name, parentId, permissionOverwrites) {
  await guild.channels.fetch()
  let channel = guild.channels.cache.find(
    (candidate) => candidate.type === ChannelType.GuildText && candidate.name === name,
  )

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites,
      reason: 'Lost Talent automated server setup',
    })
  } else {
    if (channel.parentId !== parentId) {
      await channel.setParent(parentId, {
        lockPermissions: false,
        reason: 'Lost Talent automated server setup',
      })
    }

    await channel.permissionOverwrites.set(
      permissionOverwrites,
      'Lost Talent automated permission sync',
    )
  }

  return channel
}

function privateStaffOverwrites(guild, staffRoleId) {
  return [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: staffRoleId,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: discord.user.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ]
}

function verifyChannelOverwrites(guild, staffRoleId) {
  return [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    },
    {
      id: staffRoleId,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: discord.user.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ]
}

async function postVerificationInstructions(channel) {
  const embed = new EmbedBuilder()
    .setColor(0xd4aa3e)
    .setTitle('LOST TALENT // PLAYER VERIFICATION')
    .setDescription([
      'Player verification is handled automatically by the Lost Talent bot.',
      '',
      'When you join, the bot DMs a one-time **Player Intent** link that connects your Discord ID to your Activision ID.',
      '',
      '**What this enables**',
      '• Captains register players by Activision ID only.',
      '• Approved roster roles apply automatically.',
      '• Returning verified players can have active roles restored on rejoin.',
      '• Duplicate-account signals go to staff review, never automatic punishment.',
      '',
      'If you did not receive the DM, contact LTL Staff.',
    ].join('\n'))
    .setFooter({ text: 'Lost Talent League // Identity + Competition' })

  const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null)
  const existing = recent?.find(
    (message) =>
      message.author.id === discord.user.id
      && message.embeds?.[0]?.title === 'LOST TALENT // PLAYER VERIFICATION',
  )

  if (existing) return existing.edit({ embeds: [embed] })
  return channel.send({ embeds: [embed] })
}

async function persistGuildConfig(config) {
  if (!db) return false

  const { error } = await db
    .from('discord_guild_configs')
    .upsert(config, { onConflict: 'guild_id' })

  if (error) throw error
  return true
}

async function setupGuild(guild, configuredByDiscordId) {
  if (String(guild.id) !== primaryGuildId) {
    throw new Error('This bot is currently locked to Lost Talent server ' + primaryGuildId + '.')
  }

  const me = guild.members.me || await guild.members.fetch(discord.user.id)
  const requiredPermissions = [
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
  ]

  const missing = requiredPermissions.filter((permission) => !me.permissions.has(permission))
  if (missing.length) {
    throw new Error('The bot is missing required setup permissions. Re-invite it using the generated install URL.')
  }

  const staffRole = await findOrCreateRole(guild, 'LTL Staff', 0xd4aa3e, {
    hoist: true,
    mentionable: true,
  })
  const verifiedRole = await findOrCreateRole(guild, 'LTL Verified', 0xc9a53d)
  const unverifiedRole = await findOrCreateRole(guild, 'LTL Unverified', 0x5b5b5b)
  const freeAgentRole = await findOrCreateRole(guild, 'LTL Free Agent', 0x9a7a33)
  const captainRole = await findOrCreateRole(guild, 'LTL Captain', 0xe0b94d)
  const leaguePlayerRole = await findOrCreateRole(guild, 'LTL League Player', 0xb88a27)
  const tournamentPlayerRole = await findOrCreateRole(guild, 'LTL Tournament Player', 0xa67820)
  const eightsRole = await findOrCreateRole(guild, 'LTL 8s', 0x8d6f2a)

  const category = await findOrCreateCategory(guild, 'LTL SYSTEM')

  const verifyChannel = await findOrCreateTextChannel(
    guild,
    'ltl-verify',
    category.id,
    verifyChannelOverwrites(guild, staffRole.id),
  )

  const securityChannel = await findOrCreateTextChannel(
    guild,
    'ltl-security-alerts',
    category.id,
    privateStaffOverwrites(guild, staffRole.id),
  )

  const logsChannel = await findOrCreateTextChannel(
    guild,
    'ltl-bot-logs',
    category.id,
    privateStaffOverwrites(guild, staffRole.id),
  )

  await postVerificationInstructions(verifyChannel)

  process.env.ROLE_VERIFIED_PLAYER = verifiedRole.id
  process.env.ROLE_UNVERIFIED = unverifiedRole.id
  process.env.ROLE_FREE_AGENT = freeAgentRole.id
  process.env.ROLE_CAPTAIN = captainRole.id

  const config = {
    guild_id: guild.id,
    guild_name: guild.name,
    combined_org_league: true,
    system_category_id: category.id,
    verify_channel_id: verifyChannel.id,
    security_alert_channel_id: securityChannel.id,
    bot_logs_channel_id: logsChannel.id,
    staff_role_id: staffRole.id,
    verified_role_id: verifiedRole.id,
    unverified_role_id: unverifiedRole.id,
    free_agent_role_id: freeAgentRole.id,
    captain_role_id: captainRole.id,
    league_player_role_id: leaguePlayerRole.id,
    tournament_player_role_id: tournamentPlayerRole.id,
    eights_role_id: eightsRole.id,
    configured_by_discord_id: String(configuredByDiscordId || ''),
    configured_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const persisted = await persistGuildConfig(config)

  const summary = new EmbedBuilder()
    .setColor(0xd4aa3e)
    .setTitle('LTL SERVER SETUP COMPLETE')
    .setDescription(
      persisted
        ? 'Roles/channels were created or reused and their IDs were saved automatically.'
        : 'Roles/channels were created or reused. Supabase is not connected yet, so rerun /ltl-setup after database setup to persist these IDs automatically.',
    )
    .addFields(
      { name: 'Verified', value: '<@&' + verifiedRole.id + '> · ' + verifiedRole.id, inline: true },
      { name: 'Unverified', value: '<@&' + unverifiedRole.id + '> · ' + unverifiedRole.id, inline: true },
      { name: 'Free Agent', value: '<@&' + freeAgentRole.id + '> · ' + freeAgentRole.id, inline: true },
      { name: 'Captain', value: '<@&' + captainRole.id + '> · ' + captainRole.id, inline: true },
      { name: 'League Player', value: '<@&' + leaguePlayerRole.id + '> · ' + leaguePlayerRole.id, inline: true },
      { name: 'Tournament Player', value: '<@&' + tournamentPlayerRole.id + '> · ' + tournamentPlayerRole.id, inline: true },
      { name: '8s', value: '<@&' + eightsRole.id + '> · ' + eightsRole.id, inline: true },
      { name: 'Staff', value: '<@&' + staffRole.id + '> · ' + staffRole.id, inline: true },
      { name: 'Verify Channel', value: '<#' + verifyChannel.id + '> · ' + verifyChannel.id, inline: false },
      { name: 'Security Alerts', value: '<#' + securityChannel.id + '> · ' + securityChannel.id, inline: false },
      { name: 'Bot Logs', value: '<#' + logsChannel.id + '> · ' + logsChannel.id, inline: false },
    )
    .setTimestamp()

  await logsChannel.send({ embeds: [summary] })

  return { persisted }
}

async function registerGuildCommands(guild) {
  await guild.commands.set([
    {
      name: 'ltl-setup',
      description: 'Create or repair Lost Talent League system roles and channels.',
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
    },
    {
      name: 'ltl-status',
      description: 'Show Lost Talent bot/server integration status.',
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      dm_permission: false,
    },
    {
      name: 'verify',
      description: 'DM yourself a one-time Lost Talent player verification link.',
      dm_permission: false,
    },
  ])
}

async function loadProfile(profileId) {
  if (!db) throw new Error('Supabase is not configured.')
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
  if (!db) return null
  const { data, error } = await db
    .from('profiles')
    .select('id, discord_user_id, activision_id, activision_key, verification_status')
    .eq('discord_user_id', String(discordUserId))
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function loadEntitlements(profileId, scope) {
  if (!db) return []
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
  if (!db) return
  const { error } = await db.from('discord_sync_jobs').update(patch).eq('id', jobId)
  if (error) throw error
}

async function requeueWaitingJobs(profileId, scope) {
  if (!db) return
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
  if (!apiConfigured()) {
    console.warn('Verification API is not configured yet; onboarding DM skipped.')
    return null
  }

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
  if (!db) return
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

discord.once(Events.ClientReady, async (client) => {
  console.log(`Lost Talent bot ready as ${client.user.tag}`)
  console.log('Install URL: ' + inviteUrl(client.user.id))

  const guild = await client.guilds.fetch(primaryGuildId).catch(() => null)
  if (guild) {
    await hydrateGuildConfigFromDatabase()
      .then((loaded) => {
        if (loaded) console.log('Loaded Lost Talent Discord role/channel configuration from Supabase')
      })
      .catch((error) => {
        console.error('Unable to load persisted LTL guild configuration:', error)
      })

    await registerGuildCommands(guild).catch((error) => {
      console.error('Unable to register LTL commands:', error)
    })
  }

  pollSyncJobs().catch(console.error)
  setInterval(() => pollSyncJobs().catch(console.error), 15_000)
})

discord.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return
  if (!interaction.guild || String(interaction.guild.id) !== primaryGuildId) return

  if (interaction.commandName === 'ltl-setup') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Administrator permission is required to run LTL setup.',
        ephemeral: true,
      })
      return
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const result = await setupGuild(interaction.guild, interaction.user.id)
      await interaction.editReply(
        result.persisted
          ? 'LTL setup is complete. Roles/channels were created or reused and their IDs were saved automatically. Check #ltl-bot-logs.'
          : 'LTL setup is complete. Roles/channels were created or reused. Supabase is not connected yet; the IDs are in #ltl-bot-logs and will persist automatically after rerunning /ltl-setup once the database is connected.',
      )
    } catch (error) {
      console.error('LTL setup failed:', error)
      await interaction.editReply('LTL setup failed: ' + String(error?.message || error))
    }
    return
  }

  if (interaction.commandName === 'ltl-status') {
    await interaction.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(db && apiConfigured() ? 0x57f287 : 0xfee75c)
          .setTitle('LTL INTEGRATION STATUS')
          .setDescription([
            'Server: **' + interaction.guild.name + '** (\`' + interaction.guild.id + '\`)',
            'Bot: **online**',
            'Supabase: **' + (db ? 'connected' : 'not connected') + '**',
            'Verification API: **' + (apiConfigured() ? 'configured' : 'not configured') + '**',
          ].join('\n')),
      ],
    })
    return
  }

  if (interaction.commandName === 'verify') {
    await interaction.deferReply({ ephemeral: true })

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id)
      const scope = scopeForGuild(interaction.guild.id)
      if (!scope) throw new Error('This server is not configured for Lost Talent verification.')

      const profile = await loadProfileByDiscord(interaction.user.id)
      if (profile?.verification_status === 'verified') {
        const restored = await reconcileMember(member, profile, scope)
        await interaction.editReply(
          `You are already verified. I also reconciled ${restored} active Lost Talent role entitlement(s).`,
        )
        return
      }

      await sendIntentVerification(member, scope)
      await interaction.editReply(
        'I sent your one-time Lost Talent verification link by DM. The link expires in 15 minutes.',
      )
    } catch (error) {
      console.error(`Unable to send verification link to ${interaction.user.tag}:`, error)
      const message = String(error?.message || error)
      const authFailure = /unauthorized/i.test(message)

      await interaction.editReply(
        authFailure
          ? 'The Lost Talent verification service rejected the bot authentication. Staff needs to repair the verification service secret before you can continue.'
          : 'I could not send the verification link: ' + message
            + ' Make sure your DMs from this server are enabled and try again.',
      )
    }
  }
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
  if (member.user?.bot || !apiConfigured()) return
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
