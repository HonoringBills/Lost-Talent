import { db, json, normalizeActivision } from '../_lib/verification.js'
import { ADMIN_ROLES, audit, contentMap, requireStaff, resolveActivisionProfile } from '../_lib/site.js'

const SEASON_STATUSES = ['draft', 'registration', 'active', 'playoffs', 'complete', 'archived']
const TEAM_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn']
const TOURNAMENT_STATUSES = ['draft', 'registration', 'check_in', 'active', 'complete', 'archived']
const CONTENT_KEYS = ['brand', 'home', 'about', 'links', 'registration']

async function latestSeason(env) {
  const rows = await db(env, 'league_seasons?select=*&order=created_at.desc&limit=1')
  return rows?.[0] || null
}

async function profilesForIds(env, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!unique.length) return {}
  const filter = unique.map((id) => encodeURIComponent(id)).join(',')
  const rows = await db(env, `profiles?select=id,display_name,discord_username,activision_id&id=in.(${filter})`)
  return Object.fromEntries((rows || []).map((row) => [row.id, row]))
}

async function publicState(env, includePrivate = false) {
  const [content, orgTeams, seasons, tournaments, ladders, ratings] = await Promise.all([
    contentMap(env),
    db(env, `org_teams?select=*&${includePrivate ? '' : 'active=eq.true&'}order=display_order.asc,name.asc`),
    db(env, 'league_seasons?select=*&order=created_at.desc&limit=10'),
    db(env, 'tournaments?select=*&order=starts_at.asc.nullslast,created_at.desc'),
    db(env, 'eight_ladders?select=*&order=name.asc'),
    db(env, 'eight_ratings?select=ladder_id,profile_id,elo,wins,losses,streak&order=elo.desc&limit=200'),
  ])

  const season = (seasons || []).find((row) => !['archived'].includes(row.status)) || seasons?.[0] || null
  const leagueTeams = season
    ? await db(
      env,
      `league_teams?select=*&season_id=eq.${encodeURIComponent(season.id)}${includePrivate ? '' : '&approval_status=eq.approved'}&order=seed.asc.nullslast,name.asc`,
    )
    : []

  const profileMap = await profilesForIds(env, (ratings || []).map((row) => row.profile_id))
  const eights = (ladders || []).map((ladder) => ({
    ...ladder,
    ratings: (ratings || [])
      .filter((row) => row.ladder_id === ladder.id)
      .slice(0, 25)
      .map((row) => ({ ...row, profile: profileMap[row.profile_id] || null })),
  }))

  return {
    content,
    orgTeams: orgTeams || [],
    seasons: includePrivate ? (seasons || []) : undefined,
    season,
    leagueTeams: leagueTeams || [],
    tournaments: (tournaments || []).filter((row) => includePrivate || !['draft', 'archived'].includes(row.status)),
    eights,
  }
}

export async function onPublicState({ env }) {
  try {
    return json({ ok: true, ...(await publicState(env, false)) })
  } catch (error) {
    console.error('Public site state failed', error)
    return json({ error: 'Public league data is temporarily unavailable.' }, 503)
  }
}

export async function onRegisterTeam({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const content = await contentMap(env)
    if (content?.registration?.enabled !== true) {
      return json({ error: content?.registration?.message || 'Team registration is currently closed.' }, 403)
    }

    const seasonRows = await db(env, 'league_seasons?select=*&status=eq.registration&order=created_at.desc&limit=1')
    const season = seasonRows?.[0] || null
    if (!season) return json({ error: 'League registration is not open for an active season.' }, 409)

    const body = await request.json().catch(() => ({}))
    const teamName = String(body.teamName || '').trim()
    const tag = String(body.tag || '').trim().slice(0, 12)
    const captainActivisionId = String(body.captainActivisionId || '').trim()
    const players = Array.isArray(body.players)
      ? body.players.map((value) => String(value || '').trim()).filter(Boolean)
      : []

    if (teamName.length < 2 || teamName.length > 60) return json({ error: 'Enter a valid team name.' }, 400)
    if (!captainActivisionId) return json({ error: 'Captain Activision ID is required.' }, 400)
    if (players.length < 4 || players.length > 7) return json({ error: 'Enter 4 to 7 rostered players.' }, 400)

    const normalized = players.map((value) => normalizeActivision(value))
    const uniqueKeys = new Set(normalized.map((row) => row.key))
    if (uniqueKeys.size !== normalized.length) return json({ error: 'The same Activision ID cannot appear twice.' }, 400)

    const captainKey = normalizeActivision(captainActivisionId).key
    if (!uniqueKeys.has(captainKey)) {
      return json({ error: 'The captain must also be included in the roster list.' }, 400)
    }

    const captain = await resolveActivisionProfile(env, captainActivisionId)
    let createdTeam
    try {
      const rows = await db(env, 'league_teams', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          season_id: season.id,
          name: teamName,
          tag: tag || null,
          captain_profile_id: captain.profile?.id || null,
          approval_status: 'pending',
        }),
      })
      createdTeam = rows?.[0]
    } catch (error) {
      if (String(error?.message || '').includes('league_teams_season_id_name_key')) {
        return json({ error: 'A team with that name is already registered for this season.' }, 409)
      }
      throw error
    }

    const slots = []
    for (let index = 0; index < normalized.length; index += 1) {
      const player = normalized[index]
      const resolved = await resolveActivisionProfile(env, player.display)
      slots.push({
        scope: 'league',
        league_team_id: createdTeam.id,
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

    return json({
      ok: true,
      teamId: createdTeam.id,
      message: `${teamName} was submitted for staff review.`,
    }, 201)
  } catch (error) {
    console.error('Team registration failed', error)
    return json({ error: 'Registration could not be submitted. Please try again or contact Lost Talent staff.' }, 500)
  }
}

export async function onAdminMe({ request, env }) {
  try {
    const auth = await requireStaff(request, env)
    if (auth.error) return auth.error
    const state = await publicState(env, true)
    return json({
      ok: true,
      staff: {
        role: auth.staff.role,
        profileId: auth.profile.id,
        discordUserId: auth.discordUserId,
        displayName: auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.profile.discord_username || 'Staff',
      },
      ...state,
    })
  } catch (error) {
    console.error('Admin state failed', error)
    return json({ error: 'Staff data could not be loaded.' }, 500)
  }
}

export async function onAdminContent({ request, env }) {
  if (!['PUT', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const updates = body.content && typeof body.content === 'object' ? body.content : {}
    const entries = Object.entries(updates).filter(([key, value]) => CONTENT_KEYS.includes(key) && value && typeof value === 'object')
    if (!entries.length) return json({ error: 'No editable content was provided.' }, 400)

    const before = await contentMap(env)
    const now = new Date().toISOString()
    const rows = entries.map(([key, value]) => ({
      key,
      value,
      updated_by: auth.profile.id,
      updated_at: now,
    }))
    await db(env, 'site_content?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    })
    await audit(env, auth.profile.id, 'site_content', 'site', 'update', before, updates)
    return json({ ok: true, content: await contentMap(env) })
  } catch (error) {
    console.error('Content update failed', error)
    return json({ error: 'Site content could not be saved.' }, 500)
  }
}

export async function onAdminSeason({ request, env }) {
  if (!['PUT', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const name = String(body.name || '').trim()
    const status = String(body.status || 'draft').trim()
    if (!name || !SEASON_STATUSES.includes(status)) return json({ error: 'Season name and status are required.' }, 400)

    const payload = {
      name,
      game_title: String(body.gameTitle || 'Call of Duty').trim() || 'Call of Duty',
      status,
      registration_open_at: body.registrationOpenAt || null,
      registration_close_at: body.registrationCloseAt || null,
      roster_lock_at: body.rosterLockAt || null,
      ruleset: body.ruleset && typeof body.ruleset === 'object' ? body.ruleset : {},
    }

    let result
    let before = null
    if (id) {
      const rows = await db(env, `league_seasons?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
      before = rows?.[0] || null
      const updated = await db(env, `league_seasons?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      })
      result = updated?.[0] || null
    } else {
      const created = await db(env, 'league_seasons', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      })
      result = created?.[0] || null
    }

    await audit(env, auth.profile.id, 'league_season', result?.id || id, id ? 'update' : 'create', before, result)
    return json({ ok: true, season: result })
  } catch (error) {
    console.error('Season update failed', error)
    return json({ error: 'Season settings could not be saved.' }, 500)
  }
}

export async function onAdminOrgTeam({ request, env }) {
  if (!['PUT', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ['owner', 'org_admin'])
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const name = String(body.name || '').trim()
    if (!name) return json({ error: 'Team name is required.' }, 400)

    const payload = {
      name,
      tag: String(body.tag || '').trim() || null,
      game_title: String(body.gameTitle || 'Call of Duty').trim() || 'Call of Duty',
      division_label: String(body.divisionLabel || '').trim() || null,
      logo_url: String(body.logoUrl || '').trim() || null,
      active: body.active !== false,
      display_order: Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
    }

    let result
    let before = null
    if (id) {
      before = (await db(env, `org_teams?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
      result = (await db(env, `org_teams?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
      }))?.[0] || null
    } else {
      result = (await db(env, 'org_teams', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
      }))?.[0] || null
    }
    await audit(env, auth.profile.id, 'org_team', result?.id || id, id ? 'update' : 'create', before, result)
    return json({ ok: true, team: result })
  } catch (error) {
    console.error('Org team update failed', error)
    return json({ error: 'Organization team could not be saved.' }, 500)
  }
}

export async function onAdminLeagueTeam({ request, env }) {
  if (!['PUT', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    if (!id) return json({ error: 'Team ID is required.' }, 400)
    const approvalStatus = String(body.approvalStatus || '').trim()
    if (approvalStatus && !TEAM_STATUSES.includes(approvalStatus)) return json({ error: 'Invalid team status.' }, 400)

    const before = (await db(env, `league_teams?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
    if (!before) return json({ error: 'League team was not found.' }, 404)

    const payload = {
      ...(approvalStatus ? { approval_status: approvalStatus } : {}),
      ...(body.seed === '' || body.seed === null || body.seed === undefined ? {} : { seed: Number(body.seed) || null }),
      ...(body.name ? { name: String(body.name).trim() } : {}),
      ...(body.tag !== undefined ? { tag: String(body.tag || '').trim() || null } : {}),
      ...(body.logoUrl !== undefined ? { logo_url: String(body.logoUrl || '').trim() || null } : {}),
    }
    const updated = await db(env, `league_teams?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
    })
    const result = updated?.[0] || null
    await audit(env, auth.profile.id, 'league_team', id, 'update', before, result)
    return json({ ok: true, team: result })
  } catch (error) {
    console.error('League team update failed', error)
    return json({ error: 'League team could not be saved.' }, 500)
  }
}

export async function onAdminTournament({ request, env }) {
  if (!['PUT', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  try {
    const auth = await requireStaff(request, env, ADMIN_ROLES)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const name = String(body.name || '').trim()
    const status = String(body.status || 'draft').trim()
    if (!name || !TOURNAMENT_STATUSES.includes(status)) return json({ error: 'Tournament name and status are required.' }, 400)

    const payload = {
      name,
      game_title: String(body.gameTitle || 'Call of Duty').trim() || 'Call of Duty',
      format: String(body.format || 'double_elimination').trim() || 'double_elimination',
      series_format: String(body.seriesFormat || 'BO5').trim() || 'BO5',
      status,
      starts_at: body.startsAt || null,
      registration_close_at: body.registrationCloseAt || null,
      capacity: body.capacity ? Number(body.capacity) : null,
      ruleset: body.ruleset && typeof body.ruleset === 'object' ? body.ruleset : {},
    }

    let result
    let before = null
    if (id) {
      before = (await db(env, `tournaments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null
      result = (await db(env, `tournaments?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
      }))?.[0] || null
    } else {
      result = (await db(env, 'tournaments', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
      }))?.[0] || null
    }
    await audit(env, auth.profile.id, 'tournament', result?.id || id, id ? 'update' : 'create', before, result)
    return json({ ok: true, tournament: result })
  } catch (error) {
    console.error('Tournament update failed', error)
    return json({ error: 'Tournament could not be saved.' }, 500)
  }
}
