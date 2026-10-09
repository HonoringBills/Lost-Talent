import { db, json, normalizeActivision } from '../_lib/verification.js'
import { ADMIN_ROLES, audit, requireStaff, resolveActivisionProfile } from '../_lib/site.js'

const ENTRY_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn']

async function getTournament(env, id) {
  const rows = await db(env, `tournaments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows?.[0] || null
}

async function tournamentEntries(env, tournamentId, publicOnly = false) {
  return await db(
    env,
    `tournament_entries?select=*&tournament_id=eq.${encodeURIComponent(tournamentId)}${publicOnly ? '&approval_status=eq.approved' : ''}&order=seed.asc.nullslast,created_at.asc`,
  ) || []
}

async function decorateTournamentMatches(env, tournamentId, entries) {
  const matches = await db(
    env,
    `matches?select=*&competition_scope=eq.tournament&tournament_id=eq.${encodeURIComponent(tournamentId)}&order=scheduled_at.asc.nullslast,created_at.asc&limit=250`,
  ) || []
  const entryMap = Object.fromEntries((entries || []).map((row) => [row.id, row]))
  return matches.map((match) => ({
    ...match,
    team_a: entryMap[match.tournament_entry_a_id] || null,
    team_b: entryMap[match.tournament_entry_b_id] || null,
  }))
}

export async function onPublicTournament({ request, env }) {
  try {
    const url = new URL(request.url)
    const id = String(url.searchParams.get('id') || '').trim()
    if (!id) return json({ error: 'Tournament ID is required.' }, 400)
    const tournament = await getTournament(env, id)
    if (!tournament || ['draft', 'archived'].includes(tournament.status)) return json({ error: 'Tournament not found.' }, 404)
    const entries = await tournamentEntries(env, id, true)
    const allEntries = await tournamentEntries(env, id, false)
    const reservedCount = allEntries.filter((entry) => !['rejected', 'withdrawn'].includes(entry.approval_status)).length
    return json({
      ok: true,
      tournament,
      entries,
      matches: await decorateTournamentMatches(env, id, entries),
      registration: {
        open: tournament.status === 'registration'
          && (!tournament.registration_close_at || new Date(tournament.registration_close_at).getTime() > Date.now())
          && (!tournament.capacity || reservedCount < tournament.capacity),
        reservedCount,
        capacity: tournament.capacity,
      },
    })
  } catch (error) {
    console.error('Public tournament state failed', error)
    return json({ error: 'Tournament data is temporarily unavailable.' }, 503)
  }
}

export async function onRegisterTournament({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  try {
    const body = await request.json().catch(() => ({}))
    const tournamentId = String(body.tournamentId || '').trim()
    const teamName = String(body.teamName || '').trim()
    const tag = String(body.tag || '').trim().slice(0, 12)
    const captainActivisionId = String(body.captainActivisionId || '').trim()
    const players = Array.isArray(body.players)
      ? body.players.map((value) => String(value || '').trim()).filter(Boolean)
      : []

    if (!tournamentId) return json({ error: 'Tournament is required.' }, 400)
    const tournament = await getTournament(env, tournamentId)
    if (!tournament || tournament.status !== 'registration') return json({ error: 'Tournament registration is not open.' }, 409)
    if (tournament.registration_close_at && new Date(tournament.registration_close_at).getTime() <= Date.now()) return json({ error: 'Tournament registration has closed.' }, 409)
    if (teamName.length < 2 || teamName.length > 60) return json({ error: 'Enter a valid team name.' }, 400)
    if (!captainActivisionId) return json({ error: 'Captain Activision ID is required.' }, 400)
    if (players.length < 4 || players.length > 7) return json({ error: 'Enter 4 to 7 rostered players.' }, 400)

    const normalized = players.map((value) => normalizeActivision(value))
    if (normalized.some((row) => !row.display || !row.key)) return json({ error: 'Every roster slot needs a valid Activision ID.' }, 400)
    if (new Set(normalized.map((row) => row.key)).size !== normalized.length) return json({ error: 'The same Activision ID cannot appear twice.' }, 400)
    if (!new Set(normalized.map((row) => row.key)).has(normalizeActivision(captainActivisionId).key)) return json({ error: 'The captain must also appear in the roster list.' }, 400)

    const existingEntries = await tournamentEntries(env, tournamentId, false)
    const reservedCount = existingEntries.filter((entry) => !['rejected', 'withdrawn'].includes(entry.approval_status)).length
    if (tournament.capacity && reservedCount >= tournament.capacity) return json({ error: 'This tournament has reached capacity.' }, 409)
    if (existingEntries.some((entry) => entry.team_name.toLowerCase() === teamName.toLowerCase())) return json({ error: 'That team name is already registered for this tournament.' }, 409)

    const captain = await resolveActivisionProfile(env, captainActivisionId)
    const created = await db(env, 'tournament_entries', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        tournament_id: tournamentId,
        team_name: teamName,
        team_tag: tag || null,
        captain_profile_id: captain.profile?.id || null,
        approval_status: 'pending',
      }),
    })
    const entry = created?.[0]
    if (!entry) return json({ error: 'Tournament entry could not be created.' }, 500)

    const slots = []
    for (let index = 0; index < normalized.length; index += 1) {
      const player = normalized[index]
      const resolved = await resolveActivisionProfile(env, player.display)
      slots.push({
        scope: 'tournament',
        tournament_entry_id: entry.id,
        activision_id: player.display,
        activision_key: player.key,
        profile_id: resolved.profile?.id || null,
        roster_role: index < 4 ? 'starter' : 'substitute',
        resolution_status: resolved.profile ? 'linked' : 'pending_identity',
        approval_status: 'pending',
      })
    }
    await db(env, 'roster_registration_slots', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(slots),
    })

    return json({ ok: true, entryId: entry.id, message: `${teamName} was submitted for ${tournament.name}.` }, 201)
  } catch (error) {
    console.error('Tournament registration failed', error)
    return json({ error: 'Tournament registration could not be submitted.' }, 500)
  }
}

export async function onAdminTournamentState({ request, env }) {
  try {
    const auth = await requireStaff(request, env)
    if (auth.error) return auth.error
    const tournaments = await db(env, 'tournaments?select=*&order=created_at.desc&limit=100') || []
    const entries = await db(env, 'tournament_entries?select=*&order=created_at.desc&limit=1000') || []
    const matches = await db(env, 'matches?select=*&competition_scope=eq.tournament&order=scheduled_at.asc.nullslast,created_at.asc&limit=1000') || []
    return json({ ok: true, tournaments, entries, matches })
  } catch (error) {
    console.error('Admin tournament state failed', error)
    return json({ error: 'Tournament operations data could not be loaded.' }, 500)
  }
}

export async function onAdminTournamentEntry({ request, env }) {
  if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const approvalStatus = String(body.approvalStatus || '').trim()
    if (!id || !ENTRY_STATUSES.includes(approvalStatus)) return json({ error: 'Entry ID and valid approval status are required.' }, 400)
    const before = (await db(env, `tournament_entries?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
    if (!before) return json({ error: 'Tournament entry not found.' }, 404)

    const seed = body.seed === '' || body.seed === null || body.seed === undefined ? null : Number(body.seed)
    if (seed !== null && (!Number.isInteger(seed) || seed < 1)) return json({ error: 'Seed must be a positive whole number.' }, 400)
    const payload = {
      approval_status: approvalStatus,
      seed,
      checked_in_at: body.checkedIn === true ? (before.checked_in_at || new Date().toISOString()) : null,
      ...(body.teamName ? { team_name: String(body.teamName).trim() } : {}),
      ...(body.teamTag !== undefined ? { team_tag: String(body.teamTag || '').trim() || null } : {}),
    }
    const rows = await db(env, `tournament_entries?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    const entry = rows?.[0] || null
    await audit(env, auth.profile.id, 'tournament_entry', id, 'update', before, entry)
    return json({ ok: true, entry })
  } catch (error) {
    console.error('Tournament entry update failed', error)
    return json({ error: 'Tournament entry could not be saved.' }, 500)
  }
}
