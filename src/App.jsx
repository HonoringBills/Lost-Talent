import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import {
  getCurrentSession,
  signInWithDiscord,
  submitActivisionVerification,
  supabaseConfigured,
} from './supabase.js'

const orgTeams = [
  { name: 'Lost Talent COD', game: 'Call of Duty', record: '12-4', status: 'Primary Roster', players: ['Player One', 'Player Two', 'Player Three', 'Player Four'] },
  { name: 'Lost Talent Academy', game: 'Call of Duty', record: '8-6', status: 'Development', players: ['Academy One', 'Academy Two', 'Academy Three', 'Academy Four'] },
  { name: 'Lost Talent Creators', game: 'Content', record: '—', status: 'Creator Team', players: ['Creator One', 'Creator Two', 'Creator Three'] },
]

const leagueStandings = [
  ['1', 'Northstar', '6-1', '20-8', '+12'],
  ['2', 'Vanta', '5-2', '18-11', '+7'],
  ['3', 'Aftermath', '5-2', '17-12', '+5'],
  ['4', 'Rogue Signal', '4-3', '15-14', '+1'],
  ['5', 'Low Orbit', '3-4', '13-16', '-3'],
  ['6', 'Break Point', '3-4', '12-16', '-4'],
]

const tournaments = [
  { name: 'LTL Friday Night Open', date: 'SEP 25', format: '4v4 • Double Elim', status: 'Registration Open', teams: '12 / 16', scope: 'Tournament' },
  { name: 'Lost Talent SnD Classic', date: 'OCT 02', format: '4v4 • SnD Only', status: 'Upcoming', teams: '8 / 16', scope: 'Tournament' },
  { name: 'LTL Championship Series', date: 'OCT 16', format: '4v4 • BO5', status: 'Invitational', teams: '8 / 8', scope: 'Tournament' },
]

const statRows = {
  league: [
    ['1', 'Karma', '1.28', '91.2', '58', '9'],
    ['2', 'Frost', '1.23', '88.7', '56', '7'],
    ['3', 'Hollow', '1.18', '86.9', '61', '6'],
    ['4', 'Riot', '1.15', '84.4', '52', '5'],
  ],
  tournament: [
    ['1', 'Riot', '1.34', '94.6', '28', '4'],
    ['2', 'Karma', '1.29', '92.1', '31', '3'],
    ['3', 'Slate', '1.22', '89.4', '24', '2'],
    ['4', 'Frost', '1.18', '87.9', '26', '2'],
  ],
  combined: [
    ['1', 'Karma', '1.28', '91.5', '89', '12'],
    ['2', 'Riot', '1.22', '88.0', '80', '9'],
    ['3', 'Frost', '1.21', '88.4', '82', '9'],
    ['4', 'Hollow', '1.17', '86.3', '77', '7'],
  ],
}

function BrandMark({ small = false }) {
  return <div className={small ? 'brand-mark brand-mark-small' : 'brand-mark'}>LT</div>
}

function Layout({ children }) {
  const nav = [
    ['/', 'Home'],
    ['/teams', 'Teams'],
    ['/league', 'League'],
    ['/tournaments', 'Tournaments'],
    ['/stats', 'Stats'],
    ['/eights', '8s'],
    ['/merch', 'Merch'],
    ['/about', 'About'],
  ]

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="shell header-inner">
          <Link className="brand" to="/">
            <BrandMark />
            <span><b>LOST TALENT</b><small>ESPORTS + LOST TALENT LEAGUE</small></span>
          </Link>
          <nav className="main-nav">
            {nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
          </nav>
          <div className="header-actions">
            <Link className="button ghost" to="/verify">Verify</Link>
            <Link className="button gold" to="/register">Register</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div className="shell footer-grid">
          <div className="footer-brand"><BrandMark small /><div><b>Lost Talent</b><span>Organization + competitive ecosystem</span></div></div>
          <div><b>Platform</b><Link to="/league">Lost Talent League</Link><Link to="/tournaments">Tournaments</Link><Link to="/eights">8s</Link></div>
          <div><b>Community</b><Link to="/teams">Teams</Link><Link to="/merch">Merch</Link><Link to="/about">About</Link></div>
          <div><b>Players</b><Link to="/verify">Verification</Link><Link to="/register">Team Registration</Link><Link to="/stats">Stats</Link></div>
        </div>
      </footer>
    </div>
  )
}

function SectionHeader({ kicker, title, copy, action }) {
  return <div className="section-header"><div><span className="kicker">{kicker}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>
}

function Home() {
  return <>
    <section className="hero">
      <div className="shell hero-grid">
        <div>
          <span className="kicker">LOST TALENT ESPORTS</span>
          <h1>BUILT FOR THE<br/><em>ONES OVERLOOKED.</em></h1>
          <p>Lost Talent is the organization. Lost Talent League is the competitive ecosystem underneath it — leagues, tournaments, 8s, stats, verified players and Discord-connected roster operations in one platform.</p>
          <div className="hero-actions"><Link className="button gold" to="/teams">Meet the Teams</Link><Link className="button ghost" to="/league">Enter LTL</Link></div>
        </div>
        <div className="feature-panel gold-edge">
          <div className="panel-top"><span>FEATURED MATCH</span><b>UPCOMING</b></div>
          <div className="matchup"><div><BrandMark /><b>LOST TALENT</b></div><strong>VS</strong><div><div className="opponent-mark">NS</div><b>NORTHSTAR</b></div></div>
          <div className="match-meta"><span>Sep 24 • 9:00 PM ET</span><span>BO5 • LTL Season 1</span></div>
        </div>
      </div>
    </section>

    <section className="shell identity-strip">
      <div><span>ORG</span><b>Lost Talent</b><small>Teams • Content • Merch • Community</small></div>
      <div><span>LEAGUE</span><b>Lost Talent League</b><small>Seasons • Stats • Verification • 8s</small></div>
      <div><span>EVENTS</span><b>LTL Tournaments</b><small>Standalone brackets + separate stats</small></div>
    </section>

    <section className="section dark-section"><div className="shell">
      <SectionHeader kicker="THE ORGANIZATION" title="More than a league website." copy="The public side leads with Lost Talent as an esports brand, while LTL runs the competition infrastructure behind it." action={<Link className="text-link" to="/teams">View all teams →</Link>} />
      <div className="card-grid three">
        {orgTeams.map(team => <article className="team-card card" key={team.name}><div className="team-card-head"><BrandMark /><span className="pill">{team.status}</span></div><h3>{team.name}</h3><p>{team.game}</p><div className="metric-row"><span>Record <b>{team.record}</b></span><span>Roster <b>{team.players.length}</b></span></div></article>)}
      </div>
    </div></section>

    <section className="section"><div className="shell">
      <SectionHeader kicker="COMPETITION" title="League and tournament stats stay separate." copy="A player's league season, one-off tournament runs and combined career view are tracked independently so event performance never contaminates the league leaderboard." action={<Link className="text-link" to="/stats">Explore stats →</Link>} />
      <div className="card-grid three">
        <div className="card feature-card"><span className="number">01</span><h3>Lost Talent League</h3><p>Season standings, scheduled matches, roster locks, playoffs and league-only performance.</p></div>
        <div className="card feature-card"><span className="number">02</span><h3>LTL Tournaments</h3><p>Standalone registration, event rosters, brackets and tournament-only player/team statistics.</p></div>
        <div className="card feature-card"><span className="number">03</span><h3>Combined Career</h3><p>Optional career rollups across league + tournament play without overwriting either source.</p></div>
      </div>
    </div></section>
  </>
}

function Teams() {
  return <Page title="Lost Talent Teams" kicker="THE ORGANIZATION" copy="Organization-owned rosters are separate from teams that register for Lost Talent League.">
    <div className="card-grid three">{orgTeams.map(team => <article className="card roster-card" key={team.name}><div className="roster-banner"><BrandMark /><span>{team.game}</span></div><div className="roster-body"><span className="pill">{team.status}</span><h3>{team.name}</h3><div className="players">{team.players.map((p, i) => <div key={p}><span>{p}</span><small>{i === 0 ? 'Captain' : i === team.players.length - 1 ? 'Flex' : 'Starter'}</small></div>)}</div></div></article>)}</div>
  </Page>
}

function League() {
  return <Page title="Lost Talent League" kicker="LTL • SEASON 1" copy="The seasonal competition hub: registration, verified rosters, standings, schedules, reporting, playoffs and league-only statistics.">
    <div className="subnav"><span className="active">Overview</span><span>Standings</span><span>Schedule</span><span>Playoffs</span><span>Rules</span></div>
    <div className="split-layout">
      <div>
        <SectionHeader kicker="STANDINGS" title="Season 1 table" />
        <div className="table-card"><div className="table-row table-head"><span>#</span><span>Team</span><span>Series</span><span>Maps</span><span>Diff</span></div>{leagueStandings.map(r => <div className="table-row" key={r[1]}>{r.map((v,i)=><span key={i}>{v}</span>)}</div>)}</div>
      </div>
      <aside className="stack">
        <div className="card"><span className="kicker">REGISTRATION</span><h3>Season 1</h3><p>Roster registration resolves verified players by Activision ID, then uses their linked Discord identity for roles and transactions.</p><Link className="button gold full" to="/register">Register Team</Link></div>
        <div className="card"><span className="kicker">ROSTER LOCK</span><h3>Oct 04 • 11:59 PM ET</h3><p>Approved transactions are logged and Discord sync jobs remain retryable if role updates fail.</p></div>
      </aside>
    </div>
  </Page>
}

function Tournaments() {
  return <Page title="LTL Tournaments" kicker="EVENTS" copy="Standalone events get their own registrations, event rosters, brackets, match history and stat scope — separate from league-season data.">
    <div className="card-grid three">{tournaments.map(t => <article className="card tournament-card" key={t.name}><div className="date-box">{t.date.split(' ').map(x=><b key={x}>{x}</b>)}</div><div><span className="pill gold-pill">{t.status}</span><h3>{t.name}</h3><p>{t.format}</p><div className="metric-row"><span>Teams <b>{t.teams}</b></span><span>Stats <b>{t.scope}</b></span></div></div></article>)}</div>
    <section className="inner-section">
      <SectionHeader kicker="EVENT FLOW" title="Tournament operations" copy="Each event can use its own format, ruleset and roster without mutating league standings or league stat leaderboards." />
      <div className="flow-grid">{['Registration','Check-in','Seeding','Veto','Match Report','Bracket Advance','Champion'].map((x,i)=><div className="flow-step" key={x}><span>{String(i+1).padStart(2,'0')}</span><b>{x}</b></div>)}</div>
    </section>
  </Page>
}

function Stats() {
  const [scope, setScope] = useState('league')
  const label = scope === 'league' ? 'League' : scope === 'tournament' ? 'Tournament' : 'Combined'
  return <Page title="Player Statistics" kicker="DATA CENTER" copy="Switch scope without mixing competition types. League and tournament source records stay independent in PostgreSQL.">
    <div className="scope-toggle">{['league','tournament','combined'].map(s => <button className={scope===s?'active':''} onClick={()=>setScope(s)} key={s}>{s[0].toUpperCase()+s.slice(1)}</button>)}</div>
    <div className="stat-banner"><span className="kicker">CURRENT VIEW</span><h3>{label} Stats</h3><p>{scope === 'league' ? 'Only matches attached to an LTL season.' : scope === 'tournament' ? 'Only standalone tournament matches.' : 'Career rollup across both scopes.'}</p></div>
    <div className="table-card"><div className="table-row stats-row table-head"><span>#</span><span>Player</span><span>K/D</span><span>SPM</span><span>Maps</span><span>MVP</span></div>{statRows[scope].map(r => <div className="table-row stats-row" key={r[1]}>{r.map((v,i)=><span key={i}>{v}</span>)}</div>)}</div>
  </Page>
}

function Eights() {
  return <Page title="8s Hub" kicker="TWO LADDERS" copy="Lost Talent community 8s and Lost Talent League 8s use separate ELO pools while sharing the same verified player identity.">
    <div className="card-grid two"><Leaderboard title="Lost Talent Community" guild="Main Discord" players={['Karma','Riot','Hollow','Slate']} /><Leaderboard title="Lost Talent League" guild="League Discord" players={['Frost','Ghost','Karma','Vex']} /></div>
  </Page>
}

function Leaderboard({ title, guild, players }) {
  return <div className="card leaderboard"><div className="panel-top"><div><span className="kicker">{guild}</span><h3>{title} 8s</h3></div><span className="pill">ELO</span></div>{players.map((p,i)=><div className="leader-row" key={p}><b>#{i+1}</b><span>{p}</span><strong>{1520-i*43}</strong></div>)}</div>
}

function Verify() {
  const [session, setSession] = useState(null)
  const [activisionId, setActivisionId] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    getCurrentSession().then(({ data }) => setSession(data.session))
  }, [])

  const discordIdentity = useMemo(() => session?.user?.identities?.find(identity => identity.provider === 'discord'), [session])
  const discordId = discordIdentity?.provider_id || discordIdentity?.identity_data?.user_id || null

  async function handleDiscord() {
    const { error } = await signInWithDiscord()
    if (error) setStatus(error.message)
  }

  async function handleVerification(e) {
    e.preventDefault()
    if (!activisionId.includes('#')) {
      setStatus('Enter the full Activision ID including the #numbers.')
      return
    }
    const { data, error } = await submitActivisionVerification(activisionId)
    if (error) return setStatus(error.message)
    setStatus(data?.mock ? 'Mock mode: verification flow is ready; connect Supabase to store it.' : 'Verification submitted successfully.')
  }

  return <Page title="Player Verification" kicker="IDENTITY FIRST" copy="Players connect Discord once, then verify an Activision ID. Captains can later register them using only the Activision ID and the bot can resolve the linked Discord member automatically.">
    <div className="verification-flow">
      <div className="verify-step card"><span>01</span><h3>Connect Discord</h3><p>Discord OAuth establishes the immutable Discord account behind the player profile.</p><button className="button gold full" onClick={handleDiscord}>{session ? 'Discord Connected' : 'Connect Discord'}</button>{session && <small className="success">Connected user: {discordId || 'Discord identity found'}</small>}</div>
      <div className="connector-line">→</div>
      <form className="verify-step card" onSubmit={handleVerification}><span>02</span><h3>Verify Activision ID</h3><p>This becomes the roster-facing identifier captains use during league and tournament registration.</p><input value={activisionId} onChange={e=>setActivisionId(e.target.value)} placeholder="Gamertag#1234567" /><button className="button gold full" type="submit">Submit Verification</button></form>
      <div className="connector-line">→</div>
      <div className="verify-step card"><span>03</span><h3>One Player Identity</h3><p>Discord ID, Activision history, league stats, tournament stats, 8s ELO and roster history all point to one profile.</p><div className="identity-code">ACTI → PROFILE → DISCORD</div></div>
    </div>
    {status && <div className="notice">{status}</div>}
    <div className="card architecture-note"><b>Production behavior</b><p>When a roster transaction is approved, the database commits first. A Discord sync job is then queued to add/remove roles. Failed Discord actions remain retryable without losing the actual roster transaction.</p></div>
  </Page>
}

function Register() {
  const [players, setPlayers] = useState(['','','','',''])
  const [message, setMessage] = useState('')
  function submit(e) { e.preventDefault(); setMessage('Registration mock submitted. Production will resolve each Activision ID against verified player profiles before staff approval.') }
  return <Page title="Team Registration" kicker="LTL ROSTERS" copy="Captains register verified players by Activision ID — no Discord IDs need to be collected manually.">
    <form className="registration-form card" onSubmit={submit}>
      <div className="form-grid"><label>Team Name<input placeholder="Team name" /></label><label>Team Tag<input placeholder="LTL" /></label><label>Captain Activision ID<input placeholder="Captain#1234567" /></label><label>Competition<select><option>Lost Talent League</option><option>LTL Tournament</option></select></label></div>
      <h3>Roster</h3><p className="muted">Every Activision ID is resolved to the verified player profile and linked Discord account.</p>
      <div className="roster-inputs">{players.map((p,i)=><label key={i}><span>{i < 4 ? `Starter ${i+1}` : 'Substitute'}</span><input value={p} onChange={e=>setPlayers(players.map((x,j)=>j===i?e.target.value:x))} placeholder="Player#1234567" /><small>{p ? 'Lookup on submit' : 'Awaiting Activision ID'}</small></label>)}</div>
      <button className="button gold" type="submit">Submit Registration</button>
      {message && <div className="notice">{message}</div>}
    </form>
  </Page>
}

function Merch() {
  return <Page title="Lost Talent Merch" kicker="STORE" copy="The site owns the branded storefront presentation while checkout and fulfillment can route through the final commerce provider.">
    <div className="card-grid four">{['Lost Talent Jersey','LTL Core Hoodie','Black + Gold Tee','Champions Cap'].map((p,i)=><div className="card product" key={p}><div className="product-art">{i===0?'LT':'LTL'}</div><h3>{p}</h3><p>Placeholder product until final merch catalog is connected.</p><button className="button ghost full">View Product</button></div>)}</div>
  </Page>
}

function About() {
  return <Page title="About Lost Talent" kicker="THE BRAND" copy="A home for competitive players and community members who may have been overlooked elsewhere — with the infrastructure to run leagues and tournaments under the same identity.">
    <div className="about-grid"><div className="big-logo"><BrandMark /></div><div className="card"><span className="kicker">ORG + LTL</span><h2>One brand. Multiple competitive lanes.</h2><p>Lost Talent remains the organization identity. Lost Talent League is the seasonal league. LTL Tournaments are standalone events. All three can share players, Discord identity and staff tooling while preserving separate rosters, stats and histories.</p><div className="metric-row"><span>Org Teams <b>3+</b></span><span>League <b>LTL</b></span><span>Events <b>Recurring</b></span></div></div></div>
  </Page>
}

function Staff() {
  const queues = [
    ['Player verification', '7 pending'],
    ['Roster transactions', '4 pending'],
    ['Discord sync jobs', '1 retry'],
    ['Integrity reviews', '2 open'],
    ['Tournament registrations', '12 active'],
    ['Match reports', '3 awaiting confirmation'],
  ]
  return <Page title="Staff Operations" kicker="ADMIN PREVIEW" copy="One control center for organization content, LTL competition, tournaments, verification, integrity and Discord sync health.">
    <div className="card-grid three">{queues.map(([a,b])=><div className="card admin-card" key={a}><span>{a}</span><b>{b}</b><button className="text-button">Open queue →</button></div>)}</div>
    <section className="inner-section"><SectionHeader kicker="PLAYER INTEGRITY" title="Investigation workspace" copy="Staff can search a player and review league vs tournament performance, rank history, roster moves, evidence, corrections and audit history without writing SQL — while authorized ownership can still query PostgreSQL directly." /><div className="integrity-preview card"><div><b>Player Search</b><input placeholder="Activision ID / Discord ID / Gamertag" /></div><div className="integrity-metrics"><span>League K/D<b>1.18</b></span><span>Tournament K/D<b>1.34</b></span><span>Peak Rank<b>Crimson I</b></span><span>Transactions<b>8</b></span></div></div></section>
  </Page>
}

function Page({ title, kicker, copy, children }) {
  return <section className="page"><div className="shell"><div className="page-head"><span className="kicker">{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{children}</div></section>
}

function App() {
  return <Layout><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/teams" element={<Teams />} />
    <Route path="/league" element={<League />} />
    <Route path="/tournaments" element={<Tournaments />} />
    <Route path="/stats" element={<Stats />} />
    <Route path="/eights" element={<Eights />} />
    <Route path="/verify" element={<Verify />} />
    <Route path="/register" element={<Register />} />
    <Route path="/merch" element={<Merch />} />
    <Route path="/about" element={<About />} />
    <Route path="/staff" element={<Staff />} />
    <Route path="*" element={<Home />} />
  </Routes></Layout>
}

export default App
