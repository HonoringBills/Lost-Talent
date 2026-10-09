import { useEffect, useMemo, useState } from 'react'

async function opsRequest(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Request failed.')
  return body
}

function SectionHead({ kicker, title, copy }) {
  return <div className="section-header"><div><span className="kicker">{kicker}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div></div>
}

function isoInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

function blankMatch() {
  return { id: '', teamAId: '', teamBId: '', scheduledAt: '', seriesFormat: 'BO5', resultStatus: 'scheduled', scoreA: '', scoreB: '' }
}

export default function StaffOps({ token, admin, setError, onBaseRefresh }) {
  const [ops, setOps] = useState({ matches: [], registrationSlots: [], staffMembers: [], profiles: [], ladders: [] })
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      setOps(await opsRequest('/api/admin/ops-state', token))
      setError('')
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function changed() {
    await Promise.all([refresh(), onBaseRefresh?.()])
  }

  useEffect(() => { refresh() }, [token])

  if (loading) return <section className="inner-section"><div className="card empty-state"><p>Loading league operations…</p></div></section>

  return <>
    <MatchManager token={token} admin={admin} ops={ops} setError={setError} onChanged={changed} />
    <RosterReview token={token} admin={admin} slots={ops.registrationSlots || []} setError={setError} onChanged={changed} />
    <EightsManager token={token} ladders={ops.ladders || []} setError={setError} onChanged={changed} />
    {admin.staff?.role === 'owner' && <StaffManager token={token} staffMembers={ops.staffMembers || []} setError={setError} onChanged={changed} />}
  </>
}

function MatchManager({ token, admin, ops, setError, onChanged }) {
  const [form, setForm] = useState(blankMatch())
  const [saving, setSaving] = useState(false)
  const [mapForm, setMapForm] = useState({ matchId: '', mapNumber: '1', mode: 'Hardpoint', mapName: '', scoreA: '', scoreB: '', playerStats: '' })
  const teams = admin.leagueTeams || []

  function editMatch(match) {
    setForm({
      id: match.id,
      teamAId: match.league_team_a_id || '',
      teamBId: match.league_team_b_id || '',
      scheduledAt: isoInput(match.scheduled_at),
      seriesFormat: match.series_format || 'BO5',
      resultStatus: match.result_status || 'scheduled',
      scoreA: match.score_a ?? '',
      scoreB: match.score_b ?? '',
    })
  }

  async function saveMatch(event) {
    event.preventDefault()
    if (!admin.season?.id) return setError('Create a league season before scheduling matches.')
    setSaving(true); setError('')
    try {
      await opsRequest('/api/admin/match', token, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          competitionScope: 'league',
          seasonId: admin.season.id,
          scheduledAt: toIso(form.scheduledAt),
        }),
      })
      setForm(blankMatch())
      await onChanged()
    } catch (error) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  function parsePlayerStats(text) {
    return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [activisionId, kills, deaths, assists, score, spm] = line.split(',').map((value) => value.trim())
      return { activisionId, kills, deaths, assists, score, spm }
    }).filter((row) => row.activisionId)
  }

  async function saveMap(event) {
    event.preventDefault()
    setError('')
    try {
      await opsRequest('/api/admin/map-report', token, {
        method: 'PUT',
        body: JSON.stringify({ ...mapForm, playerStats: parsePlayerStats(mapForm.playerStats) }),
      })
      setMapForm((current) => ({ ...current, mapNumber: String(Number(current.mapNumber || 0) + 1), mapName: '', scoreA: '', scoreB: '', playerStats: '' }))
      await onChanged()
    } catch (error) {
      setError(error.message)
    }
  }

  const matchLabel = (match) => `${match.team_a?.name || 'TBD'} vs ${match.team_b?.name || 'TBD'}`

  return <section className="inner-section">
    <SectionHead kicker="MATCH CENTER" title="Schedule and report matches" copy="Create matchups, update scores and record official map stats." />
    <div className="ops-split">
      <form className="card admin-editor" onSubmit={saveMatch}>
        <span className="kicker">{form.id ? 'EDIT MATCH' : 'NEW MATCH'}</span>
        <div className="admin-form-grid">
          <label>Team A<select required value={form.teamAId} onChange={(e) => setForm({ ...form, teamAId: e.target.value })}><option value="">Select team</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
          <label>Team B<select required value={form.teamBId} onChange={(e) => setForm({ ...form, teamBId: e.target.value })}><option value="">Select team</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
          <label>Scheduled<input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></label>
          <label>Series<input value={form.seriesFormat} onChange={(e) => setForm({ ...form, seriesFormat: e.target.value })} /></label>
          <label>Status<select value={form.resultStatus} onChange={(e) => setForm({ ...form, resultStatus: e.target.value })}>{['scheduled','reported','confirmed','disputed','complete','forfeit'].map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Score A<input type="number" min="0" value={form.scoreA} onChange={(e) => setForm({ ...form, scoreA: e.target.value })} /></label>
          <label>Score B<input type="number" min="0" value={form.scoreB} onChange={(e) => setForm({ ...form, scoreB: e.target.value })} /></label>
        </div>
        <div className="admin-actions"><button className="button gold" disabled={saving || teams.length < 2}>{saving ? 'Saving…' : 'Save Match'}</button>{form.id && <button type="button" className="button ghost" onClick={() => setForm(blankMatch())}>Cancel edit</button>}</div>
      </form>

      <div className="card admin-editor">
        <span className="kicker">SEASON MATCHES</span>
        <div className="ops-list">{ops.matches?.length ? ops.matches.map((match) => <button type="button" className="ops-row" key={match.id} onClick={() => editMatch(match)}><span><b>{matchLabel(match)}</b><small>{match.scheduled_at ? new Date(match.scheduled_at).toLocaleString() : 'TBA'}</small></span><strong>{match.score_a ?? '-'} : {match.score_b ?? '-'}</strong><em>{match.result_status}</em></button>) : <p className="muted">No matches scheduled yet.</p>}</div>
      </div>
    </div>

    <form className="card admin-editor inner-section" onSubmit={saveMap}>
      <span className="kicker">OFFICIAL MAP REPORT</span>
      <div className="admin-form-grid">
        <label>Match<select required value={mapForm.matchId} onChange={(e) => setMapForm({ ...mapForm, matchId: e.target.value })}><option value="">Select match</option>{ops.matches?.map((match) => <option key={match.id} value={match.id}>{matchLabel(match)}</option>)}</select></label>
        <label>Map #<input required type="number" min="1" value={mapForm.mapNumber} onChange={(e) => setMapForm({ ...mapForm, mapNumber: e.target.value })} /></label>
        <label>Mode<input required value={mapForm.mode} onChange={(e) => setMapForm({ ...mapForm, mode: e.target.value })} /></label>
        <label>Map<input required value={mapForm.mapName} onChange={(e) => setMapForm({ ...mapForm, mapName: e.target.value })} placeholder="Map name" /></label>
        <label>Map Score A<input type="number" min="0" value={mapForm.scoreA} onChange={(e) => setMapForm({ ...mapForm, scoreA: e.target.value })} /></label>
        <label>Map Score B<input type="number" min="0" value={mapForm.scoreB} onChange={(e) => setMapForm({ ...mapForm, scoreB: e.target.value })} /></label>
        <label className="wide">Player stats<textarea value={mapForm.playerStats} onChange={(e) => setMapForm({ ...mapForm, playerStats: e.target.value })} placeholder={'One player per line:\nActivisionID,kills,deaths,assists,score,spm'} /></label>
      </div>
      <button className="button gold" disabled={!ops.matches?.length}>Save Map Report</button>
    </form>
  </section>
}

function RosterReview({ token, admin, slots, setError, onChanged }) {
  const teams = useMemo(() => Object.fromEntries((admin.leagueTeams || []).map((team) => [team.id, team])), [admin.leagueTeams])
  const currentTeamIds = new Set((admin.leagueTeams || []).map((team) => team.id))
  const visible = slots.filter((slot) => slot.scope === 'league' && currentTeamIds.has(slot.league_team_id))

  async function decide(slot, approvalStatus) {
    setError('')
    try {
      await opsRequest('/api/admin/roster-slot', token, { method: 'PUT', body: JSON.stringify({ id: slot.id, approvalStatus, eligibilityStatus: 'eligible' }) })
      await onChanged()
    } catch (error) { setError(error.message) }
  }

  return <section className="inner-section">
    <SectionHead kicker="ROSTER REVIEW" title="Player registration slots" copy="Review each submitted Activision ID. Verified players are linked into the active roster when approved." />
    {visible.length ? <div className="ops-roster-grid">{visible.map((slot) => <div className="card roster-review-card" key={slot.id}>
      <span className="pill">{teams[slot.league_team_id]?.name || 'League Team'}</span>
      <h3>{slot.activision_id}</h3>
      <p>{slot.roster_role} • {slot.resolution_status === 'linked' ? 'Verified identity linked' : 'Waiting for player verification'}</p>
      <div className="status-line"><span>Decision</span><b>{slot.approval_status}</b></div>
      <div className="admin-actions"><button className="button gold" onClick={() => decide(slot, 'approved')}>Approve</button><button className="button ghost" onClick={() => decide(slot, 'rejected')}>Reject</button></div>
    </div>)}</div> : <div className="card empty-state"><h3>No roster submissions</h3><p>Player registration slots will appear here when teams register.</p></div>}
  </section>
}

function EightsManager({ token, ladders, setError, onChanged }) {
  const [ladder, setLadder] = useState({ id: '', name: '', scope: 'org_community', discordGuildId: '', active: true })
  const [rating, setRating] = useState({ ladderId: '', activisionId: '', elo: '1500', wins: '0', losses: '0', streak: '0' })

  function editLadder(item) {
    setLadder({ id: item.id, name: item.name, scope: item.scope, discordGuildId: item.discord_guild_id || '', active: item.active !== false })
  }

  async function saveLadder(event) {
    event.preventDefault(); setError('')
    try {
      await opsRequest('/api/admin/eights-ladder', token, { method: 'PUT', body: JSON.stringify(ladder) })
      setLadder({ id: '', name: '', scope: 'org_community', discordGuildId: '', active: true })
      await onChanged()
    } catch (error) { setError(error.message) }
  }

  async function saveRating(event) {
    event.preventDefault(); setError('')
    try {
      await opsRequest('/api/admin/eights-rating', token, { method: 'PUT', body: JSON.stringify(rating) })
      setRating((current) => ({ ...current, activisionId: '', elo: '1500', wins: '0', losses: '0', streak: '0' }))
      await onChanged()
    } catch (error) { setError(error.message) }
  }

  return <section className="inner-section">
    <SectionHead kicker="8s CONTROL" title="Ladders and ELO" copy="Create the community and league ladders, then add or correct verified player ratings." />
    <div className="ops-split">
      <form className="card admin-editor" onSubmit={saveLadder}><span className="kicker">{ladder.id ? 'EDIT LADDER' : 'NEW LADDER'}</span><div className="admin-form-grid"><label>Name<input required value={ladder.name} onChange={(e) => setLadder({ ...ladder, name: e.target.value })} /></label><label>Scope<select value={ladder.scope} onChange={(e) => setLadder({ ...ladder, scope: e.target.value })}><option value="org_community">Main Community</option><option value="league">LTL</option></select></label><label>Discord Guild ID<input value={ladder.discordGuildId} onChange={(e) => setLadder({ ...ladder, discordGuildId: e.target.value })} /></label><label className="toggle-label"><input type="checkbox" checked={ladder.active} onChange={(e) => setLadder({ ...ladder, active: e.target.checked })} /> Active</label></div><div className="admin-actions"><button className="button gold">Save Ladder</button>{ladder.id && <button type="button" className="button ghost" onClick={() => setLadder({ id: '', name: '', scope: 'org_community', discordGuildId: '', active: true })}>Cancel</button>}</div><div className="ops-list compact">{ladders.map((item) => <button type="button" className="ops-row" onClick={() => editLadder(item)} key={item.id}><span><b>{item.name}</b><small>{item.scope}</small></span><em>{item.active ? 'active' : 'hidden'}</em></button>)}</div></form>
      <form className="card admin-editor" onSubmit={saveRating}><span className="kicker">PLAYER ELO</span><div className="admin-form-grid"><label>Ladder<select required value={rating.ladderId} onChange={(e) => setRating({ ...rating, ladderId: e.target.value })}><option value="">Select ladder</option>{ladders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Activision ID<input required value={rating.activisionId} onChange={(e) => setRating({ ...rating, activisionId: e.target.value })} /></label><label>ELO<input type="number" value={rating.elo} onChange={(e) => setRating({ ...rating, elo: e.target.value })} /></label><label>Wins<input type="number" min="0" value={rating.wins} onChange={(e) => setRating({ ...rating, wins: e.target.value })} /></label><label>Losses<input type="number" min="0" value={rating.losses} onChange={(e) => setRating({ ...rating, losses: e.target.value })} /></label><label>Streak<input type="number" value={rating.streak} onChange={(e) => setRating({ ...rating, streak: e.target.value })} /></label></div><button className="button gold" disabled={!ladders.length}>Save Player ELO</button></form>
    </div>
  </section>
}

function StaffManager({ token, staffMembers, setError, onChanged }) {
  const [form, setForm] = useState({ discordUserId: '', discordUsername: '', role: 'commissioner', active: true })
  const roles = ['owner','org_admin','commissioner','deputy_commissioner','stats','verifier','tournament_admin','caster_admin']

  async function save(event) {
    event.preventDefault(); setError('')
    try {
      await opsRequest('/api/admin/staff', token, { method: 'PUT', body: JSON.stringify(form) })
      setForm({ discordUserId: '', discordUsername: '', role: 'commissioner', active: true })
      await onChanged()
    } catch (error) { setError(error.message) }
  }

  async function toggle(member) {
    const profile = member.profile || {}
    setError('')
    try {
      await opsRequest('/api/admin/staff', token, { method: 'PUT', body: JSON.stringify({ discordUserId: profile.discord_user_id, discordUsername: profile.discord_username || '', role: member.role, active: !member.active }) })
      await onChanged()
    } catch (error) { setError(error.message) }
  }

  return <section className="inner-section">
    <SectionHead kicker="ACCESS CONTROL" title="Staff permissions" copy="Owner-only controls for who can manage Lost Talent." />
    <div className="ops-split"><form className="card admin-editor" onSubmit={save}><div className="admin-form-grid"><label>Discord User ID<input required pattern="[0-9]{15,22}" value={form.discordUserId} onChange={(e) => setForm({ ...form, discordUserId: e.target.value })} /></label><label>Discord Name<input value={form.discordUsername} onChange={(e) => setForm({ ...form, discordUsername: e.target.value })} /></label><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="toggle-label"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label></div><button className="button gold">Save Staff Member</button></form><div className="card admin-editor"><span className="kicker">CURRENT STAFF</span><div className="ops-list">{staffMembers.map((member) => <div className="ops-row static" key={member.profile_id}><span><b>{member.profile?.discord_username || member.profile?.discord_user_id || 'Staff'}</b><small>{member.role}</small></span><button className="button ghost mini" onClick={() => toggle(member)}>{member.active ? 'Disable' : 'Enable'}</button></div>)}</div></div></div>
  </section>
}
