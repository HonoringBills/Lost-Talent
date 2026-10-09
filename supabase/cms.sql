-- Lost Talent public-site content CMS.
-- Operational league, tournament, roster, match and 8s data remains in dedicated tables.

create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists site_content_updated_by_idx
  on public.site_content(updated_by);

alter table public.site_content enable row level security;
revoke all on table public.site_content from anon, authenticated;
grant select, insert, update, delete on table public.site_content to service_role;

insert into public.site_content (key, value)
values
  ('brand', '{"tagline":"Built for the ones overlooked.","subline":"Compete. Prove. Climb.","footer":"Lost Talent Esports"}'::jsonb),
  ('home', '{"hero_body":"Lost Talent gives overlooked competitors a place to prove themselves through teams, league play, tournaments and 8s.","organization_title":"Represent Lost Talent.","organization_body":"Follow our competitive teams, creators and community as we build something worth remembering.","competition_title":"Earn it where it counts.","competition_body":"Compete through Lost Talent League seasons, tournaments and 8s with verified rosters and tracked results.","announcement":""}'::jsonb),
  ('about', '{"headline":"One name. One standard.","body":"Lost Talent was built for competitors and community members who are ready to earn their place. Lost Talent League gives that competition a stage through organized seasons, tournaments and 8s."}'::jsonb),
  ('links', '{"discord_url":"","merch_url":"","x_url":"","tiktok_url":"","twitch_url":""}'::jsonb),
  ('registration', '{"enabled":false,"message":"Team registration is currently closed."}'::jsonb)
on conflict (key) do nothing;
