# Supabase foundation

`schema.sql` is the initial reviewed data model for Lost Talent + Lost Talent League. It is intentionally kept as a baseline SQL file until the actual Supabase project is connected.

## Identity model

1. Player signs in with Discord through Supabase Auth.
2. `verify_player_identity()` reads the provider-issued Discord `provider_id` from `auth.identities`.
3. Player submits their full Activision ID.
4. The profile stores the immutable relationship: Supabase user ↔ Discord user ID ↔ Activision ID.
5. Captains can register rosters using Activision IDs only.
6. After staff approves a roster transaction, a `discord_sync_jobs` record queues bot role changes.

The function does **not** trust client-editable user metadata for Discord authorization/identity binding.

## Competition stat scopes

Every match carries a `competition_scope`:

- `league`
- `tournament`
- `org`
- `eights`

Player map stats join through each match, allowing the app to calculate league-only, tournament-only and combined career leaderboards without mixing the source records.

## Before production

- Connect a development Supabase project first.
- Apply the baseline SQL there and test all allow/deny cases.
- Add staff-dashboard policies using least privilege.
- Run Supabase database/security advisors.
- Generate the real migration with the current Supabase CLI instead of manually inventing migration filenames.
- Configure Discord OAuth callback and redirect URLs.
- Keep the Supabase secret/service role key server-side only.
