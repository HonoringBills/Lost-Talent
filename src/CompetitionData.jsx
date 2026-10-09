import { useEffect, useState } from 'react'

function useCompetition() {
  const [data, setData] = useState({ season: null, matches: [], stats: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/public/competition', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Competition data unavailable.')
        if (active) setData(body)
      })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return { data, loading, error }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'TBA'
}

function MatchRow({ match }) {
  const scored = match.score_a !== null && match.score_a !== undefined && match.score_b !== null && match.score_b !== undefined
  return <div className="competition-match-row">
    <div className="competition-match-time"><span>{formatDate(match.scheduled_at)}</span><small>{String(match.result_status || 'scheduled').replaceAll('_', ' ')}</small></div>
    <div className="competition-team"><b>{match.team_a?.name || 'TBD'}</b><span>{match.team_a?.tag || ''}</span></div>
    <strong className="competition-score">{scored ? `${match.score_a} - ${match.score_b}` : 'vs'}</strong>
    <div className="competition-team right"><b>{match.team_b?.name || 'TBD'}</b><span>{match.team_b?.tag || ''}</span></div>
  </div>
}

export function LeagueMatches() {
  const { data, loading, error } = useCompetition()
  if (loading) return <div className="card empty-state"><p>Loading schedule…</p></div>
  if (error) return <div className="card empty-state"><h3>Schedule unavailable</h3><p>{error}</p></div>
  if (!data.matches?.length) return <div className="card empty-state"><h3>No matches scheduled yet</h3><p>League staff will publish matchups here when the season schedule is ready.</p></div>

  return <div className="card competition-list">
    <div className="panel-top"><span>SEASON SCHEDULE</span><b>{data.season?.name || 'Lost Talent League'}</b></div>
    {data.matches.map((match) => <MatchRow key={match.id} match={match} />)}
  </div>
}

export function StatsBoard() {
  const { data, loading, error } = useCompetition()
  if (loading) return <div className="card empty-state"><p>Loading stats…</p></div>
  if (error) return <div className="card empty-state"><h3>Stats unavailable</h3><p>{error}</p></div>
  if (!data.stats?.length) return <div className="card empty-state"><h3>Stats populate from reported maps</h3><p>Player rankings will appear automatically after staff submits official map reports.</p></div>

  return <div className="card stats-board">
    <div className="stats-header stats-line"><span>#</span><span>Player</span><span>Maps</span><span>K/D</span><span>Kills</span><span>Deaths</span><span>SPM</span></div>
    {data.stats.map((row, index) => <div className="stats-line" key={row.profile_id}>
      <b>#{index + 1}</b>
      <strong>{row.profile?.display_name || row.profile?.activision_id || row.profile?.discord_username || 'Verified Player'}</strong>
      <span>{row.maps}</span><span>{row.kd}</span><span>{row.kills}</span><span>{row.deaths}</span><span>{row.spm}</span>
    </div>)}
  </div>
}
