# Cloudflare Pages deployment

Lost Talent is designed to deploy from the GitHub repository through Cloudflare Pages Git integration.

## Project settings

- Repository: `HonoringBills/Lost-Talent`
- Production branch: `main`
- Framework preset: React (Vite)
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Node version: 24 (pinned in `.node-version`)

## First deployment

In Cloudflare:

1. Open **Workers & Pages**.
2. Select **Create application**.
3. Choose **Pages**.
4. Choose **Import an existing Git repository**.
5. Select `HonoringBills/Lost-Talent`.
6. Use the settings above.
7. Select **Save and Deploy**.

After the first deploy, every push to `main` automatically rebuilds and updates the production `*.pages.dev` URL.

## Environment variables

The current public preview can build without Supabase credentials because the UI supports mock/fallback mode.

When live verification is enabled, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_DISCORD_GUILD_ID`
- `VITE_LEAGUE_DISCORD_GUILD_ID`
- `VITE_MERCH_URL` as needed

Server-side Discord bot secrets do not belong in Cloudflare Pages frontend variables.

## Routing

The app currently uses `HashRouter`, so client routes work on static hosting without a catch-all rewrite rule.
