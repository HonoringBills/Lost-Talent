import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function dateTime(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'TBA'
}

export default function TournamentRegistration() {
  const { id } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ teamName: '', tag: '', captainActivisionId: '', players: ['', '', '', '', ''] })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch(`/api/public/tournament?id=${encodeURIComponent(id)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Tournament could not be loaded.')
      setState(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  function updatePlayer(index, value) {
    setForm((current) => ({ ...current, players: current.players.map((player, i) => i === index ? value : player) }))
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      const response = await fetch('/api/registration/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: id, ...form }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Registration failed.')
      setMessage(data.message)
      setForm({ teamName: '', tag: '', captainActivisionId: '', players: ['', '', '', '', ''] })
      await load()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const approvedNames = useMemo(() => (state?.entries || []).map((entry) => entry.team_name), [state?.entries])

  if (loading) return <section className="page"><div className="shell"><div className="card empty-state"><p>Loading tournament…</p></div></div></section>
  if (error || !state) return <section className="page"><div className="shell"><div className="card empty-state"><h2>Tournament unavailable</h2><p>{error || 'Tournament not found.'}</p><Link className="button ghost" to="/tournaments">Back to Tournaments</Link></div></div></section>

  const { tournament, registration, matches = [] } = state
  return <section className="page"><div className="shell">
    <div className="page-head"><span className="kicker">LTL TOURNAMENT</span><h1>{tournament.name}</h1><p>{tournament.series_format} • {String(tournament.format || '').replaceAll('_', ' ')} • {dateTime(tournament.starts_at)}</p></div>

    <div className="card-grid three tournament-summary-grid">
      <div className="card"><span className="kicker">STATUS</span><h3>{tournament.status}</h3><p>Registration closes {dateTime(tournament.registration_close_at)}.</p></div>
      <div className="card"><span className="kicker">CAPACITY</span><h3>{registration.capacity ? `${registration.reservedCount}/${registration.capacity}` : `${registration.reservedCount} entered`}</h3><p>Pending and approved teams reserve a tournament slot.</p></div>
      <div className="card"><span className="kicker">APPROVED TEAMS</span><h3>{approvedNames.length}</h3><p>{approvedNames.length ? approvedNames.join(' • ') : 'No teams approved yet.'}</p></div>
    </div>

    <div className="inner-section">
      <div className="section-header"><div><span className="kicker">MATCHES</span><h2>Tournament schedule</h2><p>Approved matchups and reported results.</p></div></div>
      {matches.length ? <div className="card competition-list">{matches.map((match) => <div className="competition-match-row" key={match.id}><div className="competition-match-time"><span>{dateTime(match.scheduled_at)}</span><small>{match.result_status}</small></div><div className="competition-team"><b>{match.team_a?.team_name || 'TBD'}</b><span>{match.team_a?.team_tag || ''}</span></div><strong className="competition-score">{match.score_a ?? '-'} : {match.score_b ?? '-'}</strong><div className="competition-team right"><b>{match.team_b?.team_name || 'TBD'}</b><span>{match.team_b?.team_tag || ''}</span></div></div>)}</div> : <div className="card empty-state"><h3>No matches posted yet</h3><p>Matchups will appear here after staff seeds the field.</p></div>}
    </div>

    <div className="inner-section">
      <div className="section-header"><div><span className="kicker">REGISTRATION</span><h2>{registration.open ? 'Enter your team' : 'Registration closed'}</h2><p>{registration.open ? 'Submit the roster staff should review for this tournament.' : 'This event is not accepting additional teams.'}</p></div></div>
      {registration.open ? <form className="registration-form card" onSubmit={submit}>
        <div className="form-grid"><label>Team Name<input required value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} /></label><label>Team Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></label><label>Captain Activision ID<input required value={form.captainActivisionId} onChange={(e) => setForm({ ...form, captainActivisionId: e.target.value })} placeholder="Captain#1234567" /></label><label>Tournament<input value={tournament.name} disabled /></label></div>
        <h3>Roster</h3><p className="muted">Enter four starters and an optional substitute. The captain must also be listed.</p>
        <div className="roster-inputs">{form.players.map((player, index) => <label key={index}><span>{index < 4 ? `Starter ${index + 1}` : 'Substitute'}</span><input required={index < 4} value={player} onChange={(e) => updatePlayer(index, e.target.value)} placeholder="Player#1234567" /></label>)}</div>
        <button className="button gold" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Tournament Entry'}</button>
        {message && <div className="notice">{message}</div>}
      </form> : <div className="card empty-state"><p>Follow Lost Talent announcements for the next open event.</p></div>}
    </div>
  </div></section>
}
