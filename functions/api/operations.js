import { db, json } from '../_lib/verification.js'
import { ADMIN_ROLES, audit, requireStaff, resolveActivisionProfile } from '../_lib/site.js'

const MATCH_ROLES = [...ADMIN_ROLES, 'stats', 'tournament_admin']
const STAFF_ROLES = ['owner', 'org_admin', 'commissioner', 'deputy_commissioner', 'stats', 'verifier', 'tournament_admin', 'caster_admin']
const RESULT_STATUSES = ['scheduled', 'reported', 'confirmed', 'disputed', 'complete', 'forfeit']
const SLOT_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn']
const ELIGIBILITY_STATUSES = ['pending', 'eligible', 'ineligible', 'review']

function uuidList(values) {
  return [...new Set((values || []).filter(Boolean))]
}

async function profilesByIds(env, ids) {
  const unique = uuidList(ids)
  if (!unique.length) return {}
  const rows = await db(env, `profiles?select=id,display_name,discord_username,discord_user_id,activision_id&id=in.(${unique.map(encodeURIComponent).join(',')})`)
  return Object.fromEntries((rows || []).map((row) => [row.id, row]))
}

async function currentSeason(env) {
  const rows = await db(env, 'league_seasons?select=*&status=neq.archived&order=created_at.desc&limit=1')
  return rows?.[0] || null
}

async function decorateMatches(env, matches = []) {
  const leagueIds = uuidList(matches.flatMap((row) => [row.league_team_a_id, row.league_team_b_id]))
  const entryIds = uuidList(matches.flatMap((row) => [row.tournament_entry_a_id, row.tournament_entry_b_id]))
  const [leagueTeams, entries] = await Promise.all([
    leagueIds.length ? db(env, `league_teams?select=id,name,tag,logo_url&id=in.(${leagueIds.map(encodeURIComponent).join(',')})`) : [],
    entryIds.length ? db(env, `tournament_entries?select=id,team_name,team_tag,logo_url&id=in.(${entryIds.map(encodeURIComponent).join(',')})`) : [],
  ])
  const leagueMap = Object.fromEntries((leagueTeams || []).map((row) => [row.id, row]))
  const entryMap = Object.fromEntries((entries || []).map((row) => [row.id, row]))

  return matches.map((match) => {
    const a = match.competition_scope === 'tournament' ? entryMap[match.tournament_entry_a_id] : leagueMap[match.league_team_a_id]
    const b = match.competition_scope === 'tournament' ? entryMap[match.tournament_entry_b_id] : leagueMap[match.league_team_b_id]
    return {
      ...match,
      team_a: a ? { id: a.id, name: a.name || a.team_name, tag: a.tag || a.team_tag, logo_url: a.logo_url } : null,
      team_b: b ? { id: b.id, name: b.name || b.team_name, tag: b.tag || b.team_tag, logo_url: b.logo_url } : null,
    }
  })
}

async function buildStats(env, matches = []) {
  const statMatches = matches.filter((row) => ['reported', 'confirmed', 'complete', 'forfeit'].includes(row.result_status))
  if (!statMatches.length) return []
  const maps = await db(env, `match_maps?select=id,match_id&match_id=in.(${statMatches.map((row) => encodeURIComponent(row.id)).join(',')})&limit=1000`)
  if (!maps?.length) return []
  const stats = await db(env, `player_map_stats?select=profile_id,map_id,kills,deaths,assists,score,spm&map_id=in.(${maps.map((row) => encodeURIComponent(row.id)).join(',')})&limit=10000`)
  if (!stats?.length) return []

  const profileMap = await profilesByIds(env, stats.map((row) => row.profile_id))
  const totals = new Map()
  for (const row of stats) {
    const item = totals.get(row.profile_id) || { profile_id: row.profile_id, maps: 0, kills: 0, deaths: 0, assists: 0, score: 0, spm_total: 0, spm_count: 0 }
    item.maps += 1
    item.kills += Number(row.kills || 0)
    item.deaths += Number(row.deaths || 0)
    item.assists += Number(row.assists || 0)
    item.score += Number(row.score || 0)
    if (row.spm !== null && row.spm !== undefined) {
      item.spm_total += Number(row.spm || 0)
      item.spm_count += 1
    }
    totals.set(row.profile_id, item)
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      kd: item.deaths > 0 ? Number((item.kills / item.deaths).toFixed(2)) : item.kills,
      spm: item.spm_count ? Number((item.spm_total / item.spm_count).toFixed(2)) : 0,
      profile: profileMap[item.profile_id] || null,
    }))
    .sort((a, b) => (b.kd - a.kd) || (b.kills - a.kills))
    .slice(0, 100)
}

export async function onPublicCompetition({ env }) {
  try {
    const season = await currentSeason(env)
    const matches = season
      ? await db(env, `matches?select=*&league_season_id=eq.${encodeURIComponent(season.id)}&order=scheduled_at.asc.nullslast,created_at.asc&limit=250`)
      : []
    const decorated = await decorateMatches(env, matches || [])
    return json({ ok: true, season, matches: decorated, stats: await buildStats(env, matches || []) })
  } catch (error) {
    console.error('Public competition state failed', error)
    return json({ error: 'Competition data is temporarily unavailable.' }, 503)
  }
}

export async function onAdminOpsState({ request, env }) {
  try {
    const auth = await requireStaff(request, env)
    if (auth.error) return auth.error
    const season = await currentSeason(env)
    const [matches, slots, staffRows, profiles, ladders] = await Promise.all([
      season ? db(env, `matches?select=*&league_season_id=eq.${encodeURIComponent(season.id)}&order=scheduled_at.asc.nullslast,created_at.asc&limit=500`) : [],
      db(env, 'roster_registration_slots?select=*&order=created_at.desc&limit=1000'),
      db(env, 'staff_members?select=profile_id,role,active,created_at&order=created_at.asc'),
      db(env, 'profiles?select=id,display_name,discord_username,discord_user_id,activision_id,verified_at&order=created_at.asc&limit=5000'),
      db(env, 'eight_ladders?select=*&order=created_at.asc'),
    ])
    const profileMap = Object.fromEntries((profiles || []).map((row) => [row.id, row]))
    return json({
      ok: true,
      matches: await decorateMatches(env, matches || []),
      registrationSlots: (slots || []).map((row) => ({ ...row, profile: row.profile_id ? profileMap[row.profile_id] || null : null })),
      staffMembers: (staffRows || []).map((row) => ({ ...row, profile: profileMap[row.profile_id] || null })),
      profiles: profiles || [],
      ladders: ladders || [],
    })
  } catch (error) {
    console.error('Admin operations state failed', error)
    return json({ error: 'League operations data could not be loaded.' }, 500)
  }
}

export async function onAdminMatch({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, MATCH_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const scope = String(body.competitionScope || 'league').trim()
    const resultStatus = String(body.resultStatus || 'scheduled').trim()
    if (!['league', 'tournament'].includes(scope)) return json({ error: 'Match scope must be league or tournament.' }, 400)
    if (!RESULT_STATUSES.includes(resultStatus)) return json({ error: 'Invalid match status.' }, 400)

    const scoreA = body.scoreA === '' || body.scoreA === null || body.scoreA === undefined ? null : Math.max(0, Number(body.scoreA))
    const scoreB = body.scoreB === '' || body.scoreB === null || body.scoreB === undefined ? null : Math.max(0, Number(body.scoreB))
    if ((scoreA !== null && !Number.isFinite(scoreA)) || (scoreB !== null && !Number.isFinite(scoreB))) return json({ error: 'Scores must be valid numbers.' }, 400)

    let payload
    if (scope === 'league') {
      const seasonId = String(body.seasonId || '').trim()
      const teamA = String(body.teamAId || '').trim()
      const teamB = String(body.teamBId || '').trim()
      if (!seasonId || !teamA || !teamB || teamA === teamB) return json({ error: 'Choose two different league teams and a season.' }, 400)
      const teamRows = await db(env, `league_teams?select=id,season_id&id=in.(${encodeURIComponent(teamA)},${encodeURIComponent(teamB)})`)
      if (teamRows?.length !== 2 || teamRows.some((row) => row.season_id !== seasonId)) return json({ error: 'Both teams must belong to the selected season.' }, 400)
      payload = {
        competition_scope: 'league', league_season_id: seasonId, tournament_id: null,
        league_team_a_id: teamA, league_team_b_id: teamB, tournament_entry_a_id: null, tournament_entry_b_id: null,
      }
    } else {
      const tournamentId = String(body.tournamentId || '').trim()
      const teamA = String(body.teamAId || '').trim()
      const teamB = String(body.teamBId || '').trim()
      if (!tournamentId || !teamA || !teamB || teamA === teamB) return json({ error: 'Choose two different tournament entries.' }, 400)
      const entryRows = await db(env, `tournament_entries?select=id,tournament_id&id=in.(${encodeURIComponent(teamA)},${encodeURIComponent(teamB)})`)
      if (entryRows?.length !== 2 || entryRows.some((row) => row.tournament_id !== tournamentId)) return json({ error: 'Both entries must belong to the selected tournament.' }, 400)
      payload = {
        competition_scope: 'tournament', league_season_id: null, tournament_id: tournamentId,
        league_team_a_id: null, league_team_b_id: null, tournament_entry_a_id: teamA, tournament_entry_b_id: teamB,
      }
    }

    const teamARef = scope === 'league' ? payload.league_team_a_id : payload.tournament_entry_a_id
    const teamBRef = scope === 'league' ? payload.league_team_b_id : payload.tournament_entry_b_id
    let winnerRef = body.winnerRef ? String(body.winnerRef) : null
    if (!winnerRef && scoreA !== null && scoreB !== null && scoreA !== scoreB && ['reported', 'confirmed', 'complete', 'forfeit'].includes(resultStatus)) {
      winnerRef = scoreA > scoreB ? teamARef : teamBRef
    }
    if (winnerRef && ![teamARef, teamBRef].includes(winnerRef)) return json({ error: 'Winner must be one of the selected teams.' }, 400)

    payload = {
      ...payload,
      scheduled_at: body.scheduledAt || null,
      series_format: String(body.seriesFormat || 'BO5').trim() || 'BO5',
      result_status: resultStatus,
      score_a: scoreA,
      score_b: scoreB,
      winner_ref: winnerRef,
    }

    let before = null
    let result
    if (id) {
      before = (await db(env, `matches?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
      if (!before) return json({ error: 'Match not found.' }, 404)
      result = (await db(env, `matches?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }))?.[0] || null
    } else {
      result = (await db(env, 'matches', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }))?.[0] || null
    }
    await audit(env, auth.profile.id, 'match', result?.id || id, id ? 'update' : 'create', before, result)
    return json({ ok: true, match: result })
  } catch (error) {
    console.error('Match update failed', error)
    return json({ error: 'Match could not be saved.' }, 500)
  }
}

export async function onAdminMapReport({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, MATCH_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const matchId = String(body.matchId || '').trim()
    const mapNumber = Number(body.mapNumber)
    const mode = String(body.mode || '').trim()
    const mapName = String(body.mapName || '').trim()
    if (!matchId || !Number.isInteger(mapNumber) || mapNumber < 1 || !mode || !mapName) return json({ error: 'Match, map number, mode and map name are required.' }, 400)
    const match = (await db(env, `matches?select=id&id=eq.${encodeURIComponent(matchId)}&limit=1`))?.[0]
    if (!match) return json({ error: 'Match not found.' }, 404)

    const mapRows = await db(env, 'match_maps?on_conflict=match_id,map_number', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        match_id: matchId,
        map_number: mapNumber,
        mode,
        map_name: mapName,
        score_a: body.scoreA === '' || body.scoreA === undefined ? null : Number(body.scoreA),
        score_b: body.scoreB === '' || body.scoreB === undefined ? null : Number(body.scoreB),
        screenshot_url: String(body.screenshotUrl || '').trim() || null,
      }),
    })
    const map = mapRows?.[0]
    if (!map) return json({ error: 'Map could not be saved.' }, 500)

    const stats = Array.isArray(body.playerStats) ? body.playerStats : []
    for (const stat of stats) {
      const activisionId = String(stat.activisionId || '').trim()
      if (!activisionId) continue
      const resolved = await resolveActivisionProfile(env, activisionId)
      if (!resolved.profile) return json({ error: `${activisionId} must verify before player stats can be saved.` }, 409)
      await db(env, 'player_map_stats?on_conflict=map_id,profile_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          map_id: map.id,
          profile_id: resolved.profile.id,
          kills: stat.kills === '' || stat.kills === undefined ? null : Number(stat.kills),
          deaths: stat.deaths === '' || stat.deaths === undefined ? null : Number(stat.deaths),
          assists: stat.assists === '' || stat.assists === undefined ? null : Number(stat.assists),
          score: stat.score === '' || stat.score === undefined ? null : Number(stat.score),
          spm: stat.spm === '' || stat.spm === undefined ? null : Number(stat.spm),
          objective: stat.objective && typeof stat.objective === 'object' ? stat.objective : {},
          source: 'manual',
          corrected_at: new Date().toISOString(),
        }),
      })
    }

    await audit(env, auth.profile.id, 'match_map', map.id, 'report', null, { ...map, playerStats: stats.length })
    return json({ ok: true, map })
  } catch (error) {
    console.error('Map report failed', error)
    return json({ error: 'Map report could not be saved.' }, 500)
  }
}

export async function onAdminRosterSlot({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const approvalStatus = String(body.approvalStatus || '').trim()
    const eligibilityStatus = String(body.eligibilityStatus || 'eligible').trim()
    if (!id || !SLOT_STATUSES.includes(approvalStatus) || !ELIGIBILITY_STATUSES.includes(eligibilityStatus)) return json({ error: 'A valid roster slot decision is required.' }, 400)

    const slot = (await db(env, `roster_registration_slots?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
    if (!slot) return json({ error: 'Roster slot not found.' }, 404)
    const now = new Date().toISOString()
    const updated = (await db(env, `roster_registration_slots?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ approval_status: approvalStatus, approved_at: approvalStatus === 'approved' ? now : null }),
    }))?.[0] || null

    if (slot.profile_id && approvalStatus === 'approved') {
      if (slot.scope === 'league') {
        await db(env, 'league_roster_members?on_conflict=league_team_id,profile_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ league_team_id: slot.league_team_id, profile_id: slot.profile_id, roster_role: slot.roster_role, eligibility_status: eligibilityStatus, approved_at: now, left_at: null }),
        })
      } else if (slot.scope === 'tournament') {
        await db(env, 'tournament_roster_members?on_conflict=tournament_entry_id,profile_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ tournament_entry_id: slot.tournament_entry_id, profile_id: slot.profile_id, roster_role: slot.roster_role, eligibility_status: eligibilityStatus }),
        })
      }
    }
    await audit(env, auth.profile.id, 'roster_registration_slot', id, approvalStatus, slot, updated)
    return json({ ok: true, slot: updated })
  } catch (error) {
    console.error('Roster slot update failed', error)
    return json({ error: 'Roster decision could not be saved.' }, 500)
  }
}

export async function onAdminEightLadder({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const name = String(body.name || '').trim()
    const scope = String(body.scope || '').trim()
    if (!name || !['org_community', 'league'].includes(scope)) return json({ error: 'Ladder name and scope are required.' }, 400)
    const payload = { name, scope, discord_guild_id: String(body.discordGuildId || '').trim() || null, active: body.active !== false }
    let before = null
    let result
    if (id) {
      before = (await db(env, `eight_ladders?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
      result = (await db(env, `eight_ladders?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }))?.[0] || null
    } else {
      result = (await db(env, 'eight_ladders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }))?.[0] || null
    }
    await audit(env, auth.profile.id, 'eight_ladder', result?.id || id, id ? 'update' : 'create', before, result)
    return json({ ok: true, ladder: result })
  } catch (error) {
    console.error('8s ladder update failed', error)
    return json({ error: '8s ladder could not be saved.' }, 500)
  }
}

export async function onAdminEightRating({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const ladderId = String(body.ladderId || '').trim()
    const activisionId = String(body.activisionId || '').trim()
    if (!ladderId || !activisionId) return json({ error: 'Ladder and Activision ID are required.' }, 400)
    const ladder = (await db(env, `eight_ladders?select=id&id=eq.${encodeURIComponent(ladderId)}&limit=1`))?.[0]
    if (!ladder) return json({ error: '8s ladder not found.' }, 404)
    const resolved = await resolveActivisionProfile(env, activisionId)
    if (!resolved.profile) return json({ error: 'Player must verify before being added to an 8s ladder.' }, 409)
    const payload = {
      ladder_id: ladderId,
      profile_id: resolved.profile.id,
      elo: Number.isFinite(Number(body.elo)) ? Number(body.elo) : 1500,
      wins: Math.max(0, Number(body.wins || 0)),
      losses: Math.max(0, Number(body.losses || 0)),
      streak: Number(body.streak || 0),
    }
    await db(env, 'eight_ratings?on_conflict=ladder_id,profile_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(payload) })
    await audit(env, auth.profile.id, 'eight_rating', `${ladderId}:${resolved.profile.id}`, 'upsert', null, payload)
    return json({ ok: true, rating: payload })
  } catch (error) {
    console.error('8s rating update failed', error)
    return json({ error: '8s rating could not be saved.' }, 500)
  }
}

export async function onAdminStaff({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ['owner'])
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const discordUserId = String(body.discordUserId || '').trim()
    const discordUsername = String(body.discordUsername || '').trim() || null
    const role = String(body.role || '').trim()
    const active = body.active !== false
    if (!/^\d{15,22}$/.test(discordUserId) || !STAFF_ROLES.includes(role)) return json({ error: 'Valid Discord ID and staff role are required.' }, 400)

    const profiles = await db(env, 'profiles?on_conflict=discord_user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ discord_user_id: discordUserId, ...(discordUsername ? { discord_username: discordUsername } : {}) }),
    })
    const profile = profiles?.[0]
    if (!profile) return json({ error: 'Staff profile could not be created.' }, 500)

    const existing = (await db(env, `staff_members?select=*&profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`))?.[0] || null
    if (existing?.role === 'owner' && !active) {
      const activeOwners = await db(env, 'staff_members?select=profile_id&role=eq.owner&active=eq.true')
      if ((activeOwners || []).length <= 1) return json({ error: 'The last active owner cannot be disabled.' }, 409)
    }

    await db(env, 'staff_members?on_conflict=profile_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ profile_id: profile.id, role, active }),
    })
    await audit(env, auth.profile.id, 'staff_member', profile.id, existing ? 'update' : 'create', existing, { role, active, discordUserId })
    return json({ ok: true, staff: { profile, role, active } })
  } catch (error) {
    console.error('Staff update failed', error)
    return json({ error: 'Staff access could not be saved.' }, 500)
  }
}
