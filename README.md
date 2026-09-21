# Lost Talent / Lost Talent League

Production foundation for the Lost Talent esports organization and Lost Talent League (LTL).

## What is included now

- Black + gold Lost Talent visual system with temporary text-mark logo
- Organization-first homepage
- Organization team/roster section
- Lost Talent League season hub
- Dedicated LTL Tournaments section
- League / Tournament / Combined stat scopes
- Two independent 8s ladders (Lost Talent Community + LTL)
- Discord-first player verification flow
- Activision-ID roster registration flow
- Staff/integrity dashboard preview
- PostgreSQL/Supabase baseline schema
- Retryable Discord role-sync queue design
- Discord bot scaffold

## Verification concept

Players verify themselves once:

`Discord OAuth → Discord Provider ID → Player Profile → Activision ID`

After that, captains can register the player using only the Activision ID. The backend resolves the verified profile and therefore already knows the Discord member that needs roles.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when a Supabase project and Discord application are ready.

## Current status

The UI runs in mock/fallback mode until Supabase environment values are connected. The Supabase schema and Discord integration are intentionally staged for review before touching a production database or live guild.

Final logos, exact gold values, sponsor assets and real organization copy can be swapped in without changing the architecture.
