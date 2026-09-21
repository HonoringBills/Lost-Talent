# Initial production setup

## 1. Branding

Current UI uses temporary LT/LTL text marks and black/gold design tokens.

When final assets arrive, replace:
- Header / footer logo
- Organization team marks
- League mark if separate
- Favicon / social preview
- Exact gold values if the brand guide specifies them

## 2. Supabase

Create or select the Lost Talent Supabase project.

Configure these frontend values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Keep the secret/service key server-side only.

Before applying `supabase/schema.sql` to production:
1. Apply and test it in development.
2. Verify RLS allow/deny behavior.
3. Run Supabase database/security advisors.
4. Generate the real migration through the current Supabase CLI.

## 3. Discord OAuth

Create or use the Lost Talent Discord application.

In Supabase Auth:
- Enable Discord provider.
- Set the Discord Client ID and Client Secret.
- Add the Supabase Auth callback URL in the Discord Developer Portal.
- Add the final site URL and local/dev URL to Supabase redirect allowlists.

Player flow:
1. Sign in with Discord.
2. Submit full Activision ID.
3. `verify_player_identity()` reads the provider-issued Discord `provider_id` from `auth.identities`.
4. The verified profile stores Discord ID + Activision ID.

## 4. Bot

The bot needs:
- `DISCORD_TOKEN`
- `SUPABASE_SECRET_KEY`
- `ORG_GUILD_ID`
- `LEAGUE_GUILD_ID`

Role IDs will be configured through database role bindings / staff settings rather than hard-coded per team.

## 5. Registration behavior

Captains enter Activision IDs only.

For each roster slot:
1. Normalize Activision ID.
2. Resolve verified player profile.
3. Confirm eligibility.
4. Submit/approve roster transaction.
5. Commit database state.
6. Queue Discord role sync.

If the bot fails, the roster transaction remains valid and the Discord job can be retried.
