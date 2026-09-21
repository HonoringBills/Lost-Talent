# Initial production setup

## 1. Branding

The current frontend uses the official Lost Talent League shield and the black/gold Lost Talent visual system.

When the organization logo arrives, replace the temporary LT org mark in:
- Header / footer
- Organization team cards
- About page
- Social preview / favicon if desired

The LTL shield remains the league/tournament identity.

## 2. Supabase

Create a dedicated Lost Talent Supabase project.

Use these public frontend variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use these trusted server-side values only in the bot / Cloudflare Functions:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Before production:
1. Apply `supabase/schema.sql` to a development project.
2. Verify the RLS allow/deny behavior.
3. Run Supabase security/database advisors.
4. Generate the production migration through the current Supabase CLI.

## 3. Discord-first player onboarding

Website OAuth is **not** the primary verification gate.

The intended flow is:

1. A player joins the Lost Talent or Lost Talent League Discord.
2. The bot checks whether their immutable Discord user ID already belongs to a verified player profile.
3. Returning verified players have active role entitlements restored automatically.
4. New players receive a DM containing a one-time **Start Player Verification** button.
5. The button opens the Cloudflare `/verify` page tied to that Discord user ID.
6. The form asks for:
   - full Activision ID;
   - player intent (League / Tournament / 8s / Org / Other);
   - acknowledgement of the duplicate-account security check.
7. The Cloudflare Function links Discord ID ↔ player profile ↔ Activision ID.
8. Any previously approved roster slots using that Activision ID resolve to the new profile.
9. Verified/team roles are queued to the Discord bot.
10. Durable role entitlements allow the bot to restore roles automatically after future leaves/rejoins.

## 4. Pre-registration before Discord join

Captains may register an Activision ID before that person has joined Discord.

The roster slot is stored by normalized Activision ID with no Discord ID required.

When the player later joins and verifies:
- the Activision ID is matched to the pending slot;
- the slot is linked to the permanent player profile;
- if the roster/team entry was already approved, the correct Discord role entitlement is created;
- the bot applies the role automatically.

This means captains do not need to collect Discord IDs.

## 5. Duplicate-account / network security

Discord does not expose a member's network address to bots.

The one-time Cloudflare verification page is therefore the security observation point.

The verification flow:
- reads the request network address at Cloudflare;
- creates an HMAC-SHA256 network fingerprint using `LTL_FINGERPRINT_SECRET`;
- stores the raw network address encrypted with AES-GCM using `LTL_IP_ENCRYPTION_SECRET`;
- hashes the User-Agent/browser signature;
- compares the network fingerprint to prior verification events;
- creates an `alt_detection_flags` staff-review record when another Discord account matches;
- may post a staff alert to `DISCORD_SECURITY_ALERT_CHANNEL_ID`.

A network match is **never automatic proof of an alt**. Shared households, VPNs, carrier NAT, schools, workplaces and other shared networks can legitimately match. No automatic discipline should be applied from this signal alone.

The verification page explicitly discloses this security collection before submission.

## 6. Cloudflare Pages Function variables/secrets

Configure these in the Lost Talent Cloudflare Pages project:

Variables:
- `PUBLIC_SITE_URL`
- `ORG_GUILD_ID`
- `LEAGUE_GUILD_ID`
- role IDs as needed

Secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DISCORD_BOT_TOKEN`
- `LTL_EVENT_SECRET`
- `LTL_FINGERPRINT_SECRET`
- `LTL_IP_ENCRYPTION_SECRET`

Optional Discord role/security settings:
- `ROLE_VERIFIED_PLAYER`
- `ROLE_UNVERIFIED`
- `ROLE_ORG_VERIFIED_PLAYER`
- `ROLE_ORG_UNVERIFIED`
- `ROLE_LEAGUE_VERIFIED_PLAYER`
- `ROLE_LEAGUE_UNVERIFIED`
- `DISCORD_STAFF_ROLE_ID`
- `DISCORD_SECURITY_ALERT_CHANNEL_ID`

## 7. Discord bot

The always-on bot needs:
- `DISCORD_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ORG_GUILD_ID`
- `LEAGUE_GUILD_ID`
- `LTL_API_URL`
- `LTL_EVENT_SECRET`

Enable **Server Members Intent** in the Discord Developer Portal.

The bot:
- sends onboarding DMs;
- marks new/unverified members with the configured unverified role;
- polls retryable Discord role jobs;
- pauses role jobs when a member is not currently in the guild;
- restores active role entitlements on rejoin.

## 8. Registration behavior

For each roster slot:

1. Normalize Activision ID.
2. Resolve an existing verified profile if one already exists.
3. Otherwise store the slot as `pending_identity`.
4. Staff approves the registration/team transaction.
5. Once the player verifies, the slot resolves to their profile.
6. Durable Discord role entitlements are created.
7. Role sync jobs apply those roles to the live Discord member.
8. If they are not in the guild yet, the jobs wait and are restored on their next join.
