import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { getCurrentSession, onAuthStateChange, signInWithDiscord, signOut } from './supabase.js'

const DEFAULT_CONTENT = {
  brand: {
    tagline: 'Built for the ones overlooked.',
    subline: 'Compete. Prove. Climb.',
    footer: 'Lost Talent Esports',
  },
  home: {
    hero_body: 'Lost Talent gives overlooked competitors a place to prove themselves through teams, league play, tournaments and 8s.',
    organization_title: 'Represent Lost Talent.',
    organization_body: 'Follow our competitive teams, creators and community as we build something worth remembering.',
    competition_title: 'Earn it where it counts.',
    competition_body: 'Compete through Lost Talent League seasons, tournaments and 8s with verified rosters and tracked results.',
    announcement: '',
  },
  about: {
    headline: 'One name. One standard.',
    body: 'Lost Talent was built for competitors and community members who are ready to earn their place. Lost Talent League gives that competition a stage through organized seasons, tournaments and 8s.',
  },
  links: { discord_url: '', merch_url: '', x_url: '', tiktok_url: '', twitch_url: '' },
  registration: { enabled: false, message: 'Team registration is currently closed.' },
}

function mergeContent(content = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_CONTENT).map(([key, value]) => [key, { ...value, ...(content?.[key] || {}) }]),
  )
}

function usePublicState() {
  const [state, setState] = useState({
    content: DEFAULT_CONTENT,
    orgTeams: [],
    season: null,
    leagueTeams: [],
    tournaments: [],
    eights: [],
  })
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const response = await fetch('/api/public/state', { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('Public data unavailable')
      const data = await response.json()
      setState({ ...data, content: mergeContent(data.content) })
    } catch (error) {
      console.error(error)
      setState((current) => ({ ...current, content: mergeContent(current.content) }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])
  return { state, loading, refresh }
}

function LeagueMark({ className = '' }) {
  return <img className={`league-mark ${className}`} src="/ltl-logo.webp" alt="Lost Talent League" />
}

function BrandMark({ small = false }) {
  return <div className={small ? 'brand-mark brand-mark-small brand-image-mark' : 'brand-mark brand-image-mark'}><LeagueMark /></div>
}

function Layout({ children, content }) {
  const nav = [
    ['/', 'Home'], ['/teams', 'Teams'], ['/league', 'League'], ['/tournaments', 'Tournaments'],
    ['/stats', 'Stats'], ['/eights', '8s'], ['/merch', 'Merch'], ['/about', 'About'],
  ]
  const links = content.links || {}

  return <div className="app-shell">
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" to="/"><BrandMark /><span><b>LOST TALENT</b><small>ESPORTS + LOST TALENT LEAGUE</small></span></Link>
        <nav className="main-nav">{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <div className="header-actions"><Link className="button gold" to="/register">Register</Link></div>
      </div>
    </header>
    <main>{children}</main>
    <footer>
      <div className="shell footer-grid">
        <div className="footer-brand"><BrandMark small /><div><b>Lost Talent</b><span>{content.brand?.footer || 'Lost Talent Esports'}</span></div></div>
        <div><b>Competition</b><Link to="/league">Lost Talent League</Link><Link to="/tournaments">Tournaments</Link><Link to="/eights">8s</Link></div>
        <div><b>Community</b><Link to="/teams">Teams</Link><Link to="/merch">Merch</Link><Link to="/about">About</Link></div>
        <div><b>Connect</b>{links.discord_url && <a href={links.discord_url} target="_blank" rel="noreferrer">Discord</a>}<Link to="/verify">Player Verification</Link><Link to="/staff">Staff Login</Link></div>
      </div>
    </footer>
  </div>
}

function SectionHeader({ kicker, title, copy, action }) {
  return <div className="section-header"><div><span className="kicker">{kicker}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>
}

function EmptyState({ title, copy }) {
  return <div className="card empty-state"><h3>{title}</h3><p>{copy}</p></div>
}

function Home({ state }) {
  const content = state.content
  const season = state.season
  const announcement = content.home?.announcement
  return <>
    <section className="hero">
      <div className="hero-atmosphere" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} />)}</div>
      <div className="shell hero-grid">
        <div className="hero-copy">
          <span className="eyebrow-badge">LOST TALENT ESPORTS // {content.brand?.subline?.toUpperCase()}</span>
          <h1>{content.brand?.tagline?.toUpperCase()}</h1>
          <p>{content.home?.hero_body}</p>
          <div className="hero-actions"><Link className="button gold hero-primary" to="/league">Enter the League</Link><Link className="button ghost" to="/teams">Meet Lost Talent</Link></div>
          {announcement && <div className="notice home-announcement"><b>Latest:</b> {announcement}</div>}
        </div>
        <div className="hero-visual">
          <div className="hero-logo-stage"><div className="logo-aura" /><LeagueMark className="hero-ltl-logo" /><div className="hero-logo-caption"><span>LOST TALENT</span><b>COMPETE • PROVE • CLIMB</b></div></div>
          <div className="feature-panel hero-match-card gold-edge">
            <div className="panel-top"><span>CURRENT SEASON</span><b><i /> {season?.status?.toUpperCase() || 'COMING SOON'}</b></div>
            <div className="season-feature"><h3>{season?.name || 'Next LTL season'}</h3><p>{season ? 'Follow teams, events and results throughout the season.' : 'Season details will be announced by Lost Talent staff.'}</p></div>
          </div>
        </div>
      </div>
    </section>

    <section className="shell identity-strip">
      <div><span>ORG</span><b>Lost Talent</b><small>Teams • Content • Community</small></div>
      <div><span>LEAGUE</span><b>Lost Talent League</b><small>Seasons • Stats • Verification</small></div>
      <div><span>EVENTS</span><b>LTL Competition</b><small>Tournaments • 8s • Championships</small></div>
    </section>

    <section className="section dark-section"><div className="shell">
      <SectionHeader kicker="THE ORGANIZATION" title={content.home?.organization_title} copy={content.home?.organization_body} action={<Link className="text-link" to="/teams">View teams →</Link>} />
      {state.orgTeams.length ? <div className="card-grid three">{state.orgTeams.slice(0, 3).map((team) => <TeamCard key={team.id} team={team} />)}</div> : <EmptyState title="Roster announcements coming soon" copy="Lost Talent teams will appear here as staff publishes them." />}
    </div></section>

    <section className="section"><div className="shell">
      <SectionHeader kicker="COMPETITION" title={content.home?.competition_title} copy={content.home?.competition_body} action={<Link className="text-link" to="/league">League center →</Link>} />
      <div className="card-grid three">
        <div className="card feature-card"><span className="number">01</span><h3>Lost Talent League</h3><p>Season competition with verified rosters, scheduled matches and playoffs.</p></div>
        <div className="card feature-card"><span className="number">02</span><h3>LTL Tournaments</h3><p>Standalone events for teams ready to prove themselves outside the regular season.</p></div>
        <div className="card feature-card"><span className="number">03</span><h3>8s</h3><p>Competitive ladders for players who want reps, rankings and a path to recognition.</p></div>
      </div>
    </div></section>

    <section className="shell battle-cta"><div className="battle-cta-mark"><LeagueMark /></div><div className="battle-cta-copy"><span className="kicker">NO NAME CARRIES YOU HERE</span><h2>PROVE YOU BELONG.</h2><p>Build your history through league play, tournaments and 8s.</p></div><div className="battle-cta-actions"><Link className="button gold" to="/verify">Player Verification</Link><Link className="button ghost" to="/register">Register Team</Link></div></section>
  </>
}

function TeamCard({ team }) {
  return <article className="team-card card"><div className="team-card-head">{team.logo_url ? <img className="team-logo" src={team.logo_url} alt="" /> : <BrandMark />}<span className="pill">{team.division_label || 'Lost Talent'}</span></div><h3>{team.name}</h3><p>{team.game_title || 'Call of Duty'}{team.tag ? ` • ${team.tag}` : ''}</p></article>
}

function Teams({ state }) {
  return <Page title="Lost Talent Teams" kicker="THE ORGANIZATION" copy="The competitors and creators representing Lost Talent.">
    {state.orgTeams.length ? <div className="card-grid three">{state.orgTeams.map((team) => <TeamCard key={team.id} team={team} />)}</div> : <EmptyState title="No public rosters yet" copy="Official Lost Talent rosters will appear here when announced." />}
  </Page>
}

function League({ state }) {
  const season = state.season
  return <Page title="Lost Talent League" kicker={season ? `LTL • ${season.name}` : 'LTL'} copy="Verified competition for teams ready to earn their place.">
    <div className="league-brand-hero"><LeagueMark className="league-brand-logo" /><div><span className="kicker">OFFICIAL LEAGUE</span><h2>{season?.name || 'Next season coming soon'}</h2><p>{season ? `Season status: ${season.status}.` : 'Registration and season dates will be announced here.'}</p></div></div>
    {state.leagueTeams.length ? <div className="card-grid three">{state.leagueTeams.map((team) => <article className="card" key={team.id}><span className="pill">{team.seed ? `Seed #${team.seed}` : 'Approved'}</span><h3>{team.name}</h3><p>{team.tag || 'Lost Talent League'}</p></article>)}</div> : <EmptyState title={season?.status === 'registration' ? 'Registration is open' : 'Teams will appear here'} copy={season?.status === 'registration' ? 'Approved teams will populate this page as registrations are reviewed.' : 'No approved teams have been published for the current season.'} />}
    <div className="card-grid two inner-section"><div className="card"><span className="kicker">REGISTRATION</span><h3>{state.content.registration?.enabled ? 'Open' : 'Closed'}</h3><p>{state.content.registration?.message}</p>{state.content.registration?.enabled && <Link className="button gold full" to="/register">Register Team</Link>}</div><div className="card"><span className="kicker">ROSTER LOCK</span><h3>{formatDate(season?.roster_lock_at)}</h3><p>Roster deadlines are controlled by league staff and shown here when set.</p></div></div>
  </Page>
}

function Tournaments({ state }) {
  return <Page title="LTL Tournaments" kicker="EVENTS" copy="Standalone events built for teams ready to compete.">
    {state.tournaments.length ? <div className="card-grid three">{state.tournaments.map((tournament) => <article className="card tournament-card" key={tournament.id}><div className="date-box"><b>{shortDate(tournament.starts_at)}</b></div><div><span className="pill gold-pill">{tournament.status}</span><h3>{tournament.name}</h3><p>{pretty(tournament.format)} • {tournament.series_format}</p><div className="metric-row"><span>Capacity <b>{tournament.capacity || 'Open'}</b></span></div></div></article>)}</div> : <EmptyState title="No tournaments announced" copy="Upcoming Lost Talent tournaments will appear here when registration opens." />}
  </Page>
}

function Stats() {
  return <Page title="Player Statistics" kicker="DATA CENTER" copy="Official statistics are published from completed Lost Talent League and tournament matches."><EmptyState title="Stats populate from reported matches" copy="Once official match reports are recorded, player leaderboards will appear here automatically." /></Page>
}

function Eights({ state }) {
  return <Page title="8s Hub" kicker="COMPETITIVE LADDERS" copy="Ranked 8s for the Lost Talent community and Lost Talent League.">
    {state.eights.length ? <div className="card-grid two">{state.eights.map((ladder) => <Leaderboard key={ladder.id} ladder={ladder} />)}</div> : <EmptyState title="8s ladders coming soon" copy="Staff can publish community and league ladders when 8s competition opens." />}
  </Page>
}

function Leaderboard({ ladder }) {
  return <div className="card leaderboard"><div className="panel-top"><div><span className="kicker">{ladder.scope === 'org_community' ? 'Main Discord' : 'League Discord'}</span><h3>{ladder.name}</h3></div><span className="pill">ELO</span></div>{ladder.ratings?.length ? ladder.ratings.map((row, index) => <div className="leader-row" key={row.profile_id}><b>#{index + 1}</b><span>{row.profile?.display_name || row.profile?.discord_username || row.profile?.activision_id || 'Verified Player'}</span><strong>{row.elo}</strong></div>) : <p className="muted">No ranked players yet.</p>}</div>
}

function Verify() {
  return <Page title="Player Verification" kicker="DISCORD IDENTITY" copy="One verified player identity follows you through Lost Talent competition.">
    <div className="verification-brand"><LeagueMark className="verification-logo" /><span>Lost Talent League verification</span></div>
    <div className="verification-flow"><div className="verify-step card"><span>01</span><h3>Join Discord</h3><p>The Lost Talent bot checks for an existing verified profile and restores eligible roles for returning players.</p></div><div className="connector-line">→</div><div className="verify-step card"><span>02</span><h3>Verify your Activision ID</h3><p>New players receive a one-time Discord DM link tied to the account that requested verification.</p></div><div className="connector-line">→</div><div className="verify-step card"><span>03</span><h3>Compete</h3><p>Once verified, eligible roster and competition roles can be resolved to your Discord account.</p></div></div>
    <div className="card architecture-note"><b>Didn't receive the DM?</b><p>Enable DMs from server members or contact Lost Talent staff to resend your verification link.</p></div>
  </Page>
}

function Register({ state }) {
  const [form, setForm] = useState({ teamName: '', tag: '', captainActivisionId: '', players: ['', '', '', '', ''] })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const open = state.content.registration?.enabled === true && state.season?.status === 'registration'

  function updatePlayer(index, value) {
    setForm((current) => ({ ...current, players: current.players.map((player, i) => i === index ? value : player) }))
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/registration/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Registration failed.')
      setMessage(data.message)
      setForm({ teamName: '', tag: '', captainActivisionId: '', players: ['', '', '', '', ''] })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <Page title="Team Registration" kicker="LTL ROSTERS" copy={state.content.registration?.message || 'Register your roster for Lost Talent League.'}>
    {!open ? <EmptyState title="Registration is closed" copy={state.content.registration?.message || 'Staff will announce the next registration window.'} /> : <form className="registration-form card" onSubmit={submit}>
      <div className="form-grid"><label>Team Name<input required value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} placeholder="Team name" /></label><label>Team Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="LTL" /></label><label>Captain Activision ID<input required value={form.captainActivisionId} onChange={(e) => setForm({ ...form, captainActivisionId: e.target.value })} placeholder="Captain#1234567" /></label><label>Season<input value={state.season?.name || ''} disabled /></label></div>
      <h3>Roster</h3><p className="muted">Enter four starters and an optional substitute. The captain must also appear below.</p>
      <div className="roster-inputs">{form.players.map((player, index) => <label key={index}><span>{index < 4 ? `Starter ${index + 1}` : 'Substitute'}</span><input required={index < 4} value={player} onChange={(e) => updatePlayer(index, e.target.value)} placeholder="Player#1234567" /></label>)}</div>
      <button className="button gold" disabled={submitting} type="submit">{submitting ? 'Submitting…' : 'Submit Registration'}</button>{message && <div className="notice">{message}</div>}
    </form>}
  </Page>
}

function Merch({ content }) {
  const url = content.links?.merch_url
  return <Page title="Lost Talent Merch" kicker="STORE" copy="Rep Lost Talent on game day and everywhere after.">{url ? <div className="card store-cta"><h2>Official Lost Talent Store</h2><p>Browse the current merch collection.</p><a className="button gold" href={url} target="_blank" rel="noreferrer">Shop Merch</a></div> : <EmptyState title="Merch drop coming soon" copy="The official store link will appear here when the next collection goes live." />}</Page>
}

function About({ content }) {
  return <Page title="About Lost Talent" kicker="THE BRAND" copy={content.about?.body}><div className="about-grid"><div className="big-logo"><LeagueMark /></div><div className="card"><span className="kicker">LOST TALENT</span><h2>{content.about?.headline}</h2><p>{content.about?.body}</p></div></div></Page>
}

async function adminRequest(path, token, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data
}

function Staff() {
  const [session, setSession] = useState(null)
  const [admin, setAdmin] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getCurrentSession().then(({ data }) => setSession(data.session || null))
    const { data } = onAuthStateChange((_event, nextSession) => setSession(nextSession || null))
    return () => data.subscription.unsubscribe()
  }, [])

  async function loadAdmin(targetSession = session) {
    if (!targetSession?.access_token) return
    setBusy(true); setError('')
    try { setAdmin(await adminRequest('/api/admin/me', targetSession.access_token)) }
    catch (err) { setError(err.message); setAdmin(null) }
    finally { setBusy(false) }
  }

  useEffect(() => { if (session?.access_token) loadAdmin(session); else setAdmin(null) }, [session?.access_token])

  if (!session) return <Page title="Staff Command" kicker="AUTHORIZED STAFF" copy="Sign in with the Discord account approved for Lost Talent staff access."><div className="card staff-login"><LeagueMark className="verification-logo" /><h2>Lost Talent Staff</h2><p>Staff permissions are tied to your Discord identity.</p><button className="button gold" onClick={() => signInWithDiscord('/#/staff')}>Sign in with Discord</button></div></Page>
  if (busy && !admin) return <Page title="Staff Command" kicker="LOADING" copy="Checking your Lost Talent staff permissions…"><div className="card">Loading staff access…</div></Page>
  if (!admin) return <Page title="Staff Command" kicker="ACCESS" copy="This login does not currently have Lost Talent staff access."><div className="card"><p>{error || 'Access denied.'}</p><button className="button ghost" onClick={() => signOut()}>Sign out</button></div></Page>

  return <Page title="Staff Command" kicker={`${admin.staff.role.toUpperCase()} • ${admin.staff.displayName}`} copy="Manage Lost Talent content, competition and registrations.">
    <div className="admin-toolbar"><span>Signed in as <b>{admin.staff.displayName}</b></span><div><button className="button ghost" onClick={() => loadAdmin()}>Refresh</button><button className="button ghost" onClick={() => signOut()}>Sign out</button></div></div>
    {error && <div className="notice">{error}</div>}
    <ContentEditor admin={admin} token={session.access_token} onSaved={loadAdmin} setError={setError} />
    <SeasonEditor season={admin.season} token={session.access_token} onSaved={loadAdmin} setError={setError} />
    <section className="inner-section"><SectionHeader kicker="ORG TEAMS" title="Lost Talent rosters" copy="Create or update teams shown on the public Teams page." /><div className="admin-grid">{admin.orgTeams.map((team) => <OrgTeamEditor key={team.id} team={team} token={session.access_token} onSaved={loadAdmin} setError={setError} />)}<OrgTeamEditor token={session.access_token} onSaved={loadAdmin} setError={setError} /></div></section>
    <section className="inner-section"><SectionHeader kicker="LEAGUE TEAMS" title="Registration review" copy="Approve, reject, seed or rename registered teams." />{admin.leagueTeams?.length ? <div className="admin-grid">{admin.leagueTeams.map((team) => <LeagueTeamEditor key={team.id} team={team} token={session.access_token} onSaved={loadAdmin} setError={setError} />)}</div> : <EmptyState title="No registrations yet" copy="Pending team registrations will appear here." />}</section>
    <section className="inner-section"><SectionHeader kicker="TOURNAMENTS" title="Event management" copy="Create and update Lost Talent tournament listings." /><div className="admin-grid">{admin.tournaments.map((tournament) => <TournamentEditor key={tournament.id} tournament={tournament} token={session.access_token} onSaved={loadAdmin} setError={setError} />)}<TournamentEditor token={session.access_token} onSaved={loadAdmin} setError={setError} /></div></section>
  </Page>
}

function ContentEditor({ admin, token, onSaved, setError }) {
  const [content, setContent] = useState(() => mergeContent(admin.content))
  const [saving, setSaving] = useState(false)
  useEffect(() => setContent(mergeContent(admin.content)), [admin.content])
  const setField = (section, field, value) => setContent((current) => ({ ...current, [section]: { ...current[section], [field]: value } }))

  async function save() {
    setSaving(true); setError('')
    try { await adminRequest('/api/admin/content', token, { method: 'PUT', body: JSON.stringify({ content }) }); await onSaved() }
    catch (error) { setError(error.message) }
    finally { setSaving(false) }
  }

  return <section className="inner-section"><SectionHeader kicker="SITE CONTENT" title="Public website editor" copy="Edit the words, links and registration switch shown on the public site." /><div className="card admin-editor"><div className="admin-form-grid"><label>Brand tagline<input value={content.brand.tagline} onChange={(e) => setField('brand', 'tagline', e.target.value)} /></label><label>Brand subline<input value={content.brand.subline} onChange={(e) => setField('brand', 'subline', e.target.value)} /></label><label className="wide">Homepage intro<textarea value={content.home.hero_body} onChange={(e) => setField('home', 'hero_body', e.target.value)} /></label><label>Organization heading<input value={content.home.organization_title} onChange={(e) => setField('home', 'organization_title', e.target.value)} /></label><label>Competition heading<input value={content.home.competition_title} onChange={(e) => setField('home', 'competition_title', e.target.value)} /></label><label className="wide">Latest announcement<textarea value={content.home.announcement} onChange={(e) => setField('home', 'announcement', e.target.value)} /></label><label className="wide">About text<textarea value={content.about.body} onChange={(e) => setField('about', 'body', e.target.value)} /></label><label>Discord URL<input value={content.links.discord_url} onChange={(e) => setField('links', 'discord_url', e.target.value)} /></label><label>Merch URL<input value={content.links.merch_url} onChange={(e) => setField('links', 'merch_url', e.target.value)} /></label><label>Registration message<input value={content.registration.message} onChange={(e) => setField('registration', 'message', e.target.value)} /></label><label className="toggle-label"><input type="checkbox" checked={content.registration.enabled} onChange={(e) => setField('registration', 'enabled', e.target.checked)} /> Team registration enabled</label></div><button className="button gold" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Website'}</button></div></section>
}

function SeasonEditor({ season, token, onSaved, setError }) {
  const [form, setForm] = useState(() => seasonForm(season))
  useEffect(() => setForm(seasonForm(season)), [season?.id, season?.updated_at])
  async function save() {
    try { await adminRequest('/api/admin/season', token, { method: 'PUT', body: JSON.stringify({ ...form, registrationOpenAt: toIso(form.registrationOpenAt), registrationCloseAt: toIso(form.registrationCloseAt), rosterLockAt: toIso(form.rosterLockAt) }) }); await onSaved() }
    catch (error) { setError(error.message) }
  }
  return <section className="inner-section"><SectionHeader kicker="SEASON" title={season ? 'Current league season' : 'Create the first season'} copy="Control registration status and league deadlines." /><div className="card admin-editor"><div className="admin-form-grid"><label>Season name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Season 1" /></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['draft','registration','active','playoffs','complete','archived'].map((status) => <option key={status}>{status}</option>)}</select></label><label>Registration opens<input type="datetime-local" value={form.registrationOpenAt} onChange={(e) => setForm({ ...form, registrationOpenAt: e.target.value })} /></label><label>Registration closes<input type="datetime-local" value={form.registrationCloseAt} onChange={(e) => setForm({ ...form, registrationCloseAt: e.target.value })} /></label><label>Roster lock<input type="datetime-local" value={form.rosterLockAt} onChange={(e) => setForm({ ...form, rosterLockAt: e.target.value })} /></label></div><button className="button gold" onClick={save}>Save Season</button></div></section>
}

function OrgTeamEditor({ team, token, onSaved, setError }) {
  const [form, setForm] = useState({ id: team?.id || '', name: team?.name || '', tag: team?.tag || '', gameTitle: team?.game_title || 'Call of Duty', divisionLabel: team?.division_label || '', logoUrl: team?.logo_url || '', active: team?.active !== false, displayOrder: team?.display_order || 0 })
  async function save() { try { await adminRequest('/api/admin/org-team', token, { method: 'PUT', body: JSON.stringify(form) }); if (!team) setForm({ id: '', name: '', tag: '', gameTitle: 'Call of Duty', divisionLabel: '', logoUrl: '', active: true, displayOrder: 0 }); await onSaved() } catch (error) { setError(error.message) } }
  return <div className="card admin-mini"><span className="kicker">{team ? 'EDIT TEAM' : 'ADD TEAM'}</span><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></label><label>Division / label<input value={form.divisionLabel} onChange={(e) => setForm({ ...form, divisionLabel: e.target.value })} /></label><label>Logo URL<input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></label><label className="toggle-label"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Public</label><button className="button gold full" onClick={save}>Save Team</button></div>
}

function LeagueTeamEditor({ team, token, onSaved, setError }) {
  const [form, setForm] = useState({ id: team.id, name: team.name, tag: team.tag || '', approvalStatus: team.approval_status, seed: team.seed || '' })
  async function save() { try { await adminRequest('/api/admin/league-team', token, { method: 'PUT', body: JSON.stringify(form) }); await onSaved() } catch (error) { setError(error.message) } }
  return <div className="card admin-mini"><span className="kicker">REGISTRATION</span><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Status<select value={form.approvalStatus} onChange={(e) => setForm({ ...form, approvalStatus: e.target.value })}>{['pending','approved','rejected','withdrawn'].map((status) => <option key={status}>{status}</option>)}</select></label><label>Seed<input type="number" min="1" value={form.seed} onChange={(e) => setForm({ ...form, seed: e.target.value })} /></label><button className="button gold full" onClick={save}>Save Registration</button></div>
}

function TournamentEditor({ tournament, token, onSaved, setError }) {
  const [form, setForm] = useState({ id: tournament?.id || '', name: tournament?.name || '', status: tournament?.status || 'draft', format: tournament?.format || 'double_elimination', seriesFormat: tournament?.series_format || 'BO5', startsAt: isoInput(tournament?.starts_at), registrationCloseAt: isoInput(tournament?.registration_close_at), capacity: tournament?.capacity || '' })
  async function save() { try { await adminRequest('/api/admin/tournament', token, { method: 'PUT', body: JSON.stringify({ ...form, startsAt: toIso(form.startsAt), registrationCloseAt: toIso(form.registrationCloseAt) }) }); if (!tournament) setForm({ id: '', name: '', status: 'draft', format: 'double_elimination', seriesFormat: 'BO5', startsAt: '', registrationCloseAt: '', capacity: '' }); await onSaved() } catch (error) { setError(error.message) } }
  return <div className="card admin-mini"><span className="kicker">{tournament ? 'EDIT EVENT' : 'ADD EVENT'}</span><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['draft','registration','check_in','active','complete','archived'].map((status) => <option key={status}>{status}</option>)}</select></label><label>Format<input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} /></label><label>Series<input value={form.seriesFormat} onChange={(e) => setForm({ ...form, seriesFormat: e.target.value })} /></label><label>Starts<input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label><label>Capacity<input type="number" min="2" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label><button className="button gold full" onClick={save}>Save Tournament</button></div>
}

function Page({ title, kicker, copy, children }) { return <section className="page"><div className="shell"><div className="page-head"><span className="kicker">{kicker}</span><h1>{title}</h1>{copy && <p>{copy}</p>}</div>{children}</div></section> }
function pretty(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function formatDate(value) { return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not announced' }
function shortDate(value) { return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : 'TBA' }
function isoInput(value) { if (!value) return ''; const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16) }
function toIso(value) { return value ? new Date(value).toISOString() : null }
function seasonForm(season) { return { id: season?.id || '', name: season?.name || '', status: season?.status || 'draft', gameTitle: season?.game_title || 'Call of Duty', registrationOpenAt: isoInput(season?.registration_open_at), registrationCloseAt: isoInput(season?.registration_close_at), rosterLockAt: isoInput(season?.roster_lock_at), ruleset: season?.ruleset || {} } }

function App() {
  const { state, loading } = usePublicState()
  return <Layout content={state.content}><Routes>
    <Route path="/" element={<Home state={state} loading={loading} />} />
    <Route path="/teams" element={<Teams state={state} />} />
    <Route path="/league" element={<League state={state} />} />
    <Route path="/tournaments" element={<Tournaments state={state} />} />
    <Route path="/stats" element={<Stats />} />
    <Route path="/eights" element={<Eights state={state} />} />
    <Route path="/verify" element={<Verify />} />
    <Route path="/register" element={<Register state={state} />} />
    <Route path="/merch" element={<Merch content={state.content} />} />
    <Route path="/about" element={<About content={state.content} />} />
    <Route path="/staff" element={<Staff />} />
    <Route path="*" element={<Home state={state} />} />
  </Routes></Layout>
}

export default App
