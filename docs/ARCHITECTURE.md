# Lost Talent Platform Architecture

## Brand layers

**Lost Talent** is the esports organization and public brand.

**Lost Talent League (LTL)** is the recurring seasonal league.

**LTL Tournaments** are standalone events. They share verified player identities but have independent registrations, rosters, brackets and stats.

## Identity

The permanent player identity is keyed by the Supabase user ID and links:

- Discord provider ID (immutable Discord account ID)
- Current Activision ID
- Activision alias/history records
- Organization roster history
- League roster history
- Tournament roster history
- Community 8s and League 8s ratings
- League stats
- Tournament stats
- Rank history
- Integrity reviews
- Audit history

Captains should not need to collect Discord IDs. They register a player with an Activision ID; the backend resolves it to the verified profile and therefore knows which Discord account to role.

## Roster transaction flow

1. Captain submits Activision ID.
2. Backend resolves a verified player profile.
3. Eligibility checks run.
4. Staff approves the transaction.
5. Database roster state commits.
6. A Discord sync job is queued.
7. Bot removes/adds configured guild roles.
8. Bot marks the sync complete or failed.
9. Failed role sync is retryable without rolling back the roster database transaction.

## Statistics

Raw map records are stored once. A match carries a competition scope so leaderboards can filter correctly.

- League leaderboard: only `competition_scope = league`
- Tournament leaderboard: only `competition_scope = tournament`
- Combined career: league + tournament (and only when the user intentionally selects Combined)

## Integrity investigations

A staff investigation screen should combine:

- League vs tournament K/D and SPM trends
- Per-map history
- Rank and peak-rank history
- Games/maps played
- Roster/team changes
- Activision aliases
- Eligibility decisions
- Prior investigations
- Evidence links
- Stat corrections
- Audit log

Authorized ownership can still use Supabase/PostgreSQL SQL directly for deeper analysis.
