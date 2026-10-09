# Lost Talent production CMS

Lost Talent runs its public content and league operations from a staff console backed by Supabase and the Cloudflare Worker API.

## Public content

Editable site copy and links live in `public.site_content`. The public site reads approved data only; it does not publish demo teams, matches, player stats, or tournament results.

## Structured competition data

Teams, rosters, seasons, tournaments, matches, map reports, player statistics, 8s ladders, ratings, verification records and audit history remain in their dedicated PostgreSQL tables.

## Staff authorization

Staff sign in with Discord through Supabase Auth. The server binds the authenticated Discord provider ID to an explicitly pre-approved `public.profiles` row, then checks the active role in `public.staff_members`. Browser clients never receive the Supabase service key.

Roles include owner, organization admin, commissioner, deputy commissioner, stats, verifier, tournament admin and caster admin. Owner-only controls manage staff access.

## Staff Command

Authorized staff can manage public copy and links, seasons and registration windows, organization teams, league registration approvals and seeds, roster-slot decisions, tournaments, match scheduling/results, official map/player-stat reports, 8s ladders/ELO and staff permissions according to role.

## Database source

`supabase/schema.sql` contains the league/integrity schema and `supabase/cms.sql` contains the site-content CMS extension.
