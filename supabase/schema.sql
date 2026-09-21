-- Lost Talent / Lost Talent League baseline schema.
-- This is a reviewable baseline, not a migration-history file yet.
-- When the real Supabase project is connected, apply/test this in a branch or dev project,
-- run database advisors, then generate the committed migration with the Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  discord_user_id text unique,
  discord_username text,
  activision_id text,
  activision_key text unique,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activision_aliases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activision_id text not null,
  activision_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique(profile_id, activision_key)
);
create index if not exists activision_aliases_key_idx on public.activision_aliases(activision_key);

create table if not exists public.staff_members (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','org_admin','commissioner','deputy_commissioner','stats','verifier','tournament_admin','caster_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.org_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text,
  game_title text not null default 'Call of Duty',
  division_label text,
  logo_url text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.org_roster_members (
  id uuid primary key default gen_random_uuid(),
  org_team_id uuid not null references public.org_teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  roster_role text not null default 'starter',
  game_role text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(org_team_id, profile_id, joined_at)
);

create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_title text not null default 'Call of Duty',
  status text not null default 'draft' check (status in ('draft','registration','active','playoffs','complete','archived')),
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  roster_lock_at timestamptz,
  ruleset jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.league_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  name text not null,
  tag text,
  logo_url text,
  captain_profile_id uuid references public.profiles(id),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','withdrawn')),
  seed integer,
  created_at timestamptz not null default now(),
  unique(season_id, name)
);

create table if not exists public.league_roster_members (
  id uuid primary key default gen_random_uuid(),
  league_team_id uuid not null references public.league_teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  roster_role text not null default 'starter',
  eligibility_status text not null default 'pending' check (eligibility_status in ('pending','eligible','ineligible','review')),
  approved_at timestamptz,
  left_at timestamptz,
  unique(league_team_id, profile_id)
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_title text not null default 'Call of Duty',
  format text not null default 'double_elimination',
  series_format text not null default 'BO5',
  status text not null default 'draft' check (status in ('draft','registration','check_in','active','complete','archived')),
  starts_at timestamptz,
  registration_close_at timestamptz,
  capacity integer,
  ruleset jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_name text not null,
  team_tag text,
  logo_url text,
  captain_profile_id uuid references public.profiles(id),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','withdrawn')),
  seed integer,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tournament_id, team_name)
);

create table if not exists public.tournament_roster_members (
  id uuid primary key default gen_random_uuid(),
  tournament_entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  roster_role text not null default 'starter',
  eligibility_status text not null default 'pending',
  unique(tournament_entry_id, profile_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_scope text not null check (competition_scope in ('org','league','tournament','eights')),
  league_season_id uuid references public.league_seasons(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  league_team_a_id uuid references public.league_teams(id),
  league_team_b_id uuid references public.league_teams(id),
  tournament_entry_a_id uuid references public.tournament_entries(id),
  tournament_entry_b_id uuid references public.tournament_entries(id),
  scheduled_at timestamptz,
  series_format text not null default 'BO5',
  result_status text not null default 'scheduled' check (result_status in ('scheduled','reported','confirmed','disputed','complete','forfeit')),
  winner_ref uuid,
  score_a integer,
  score_b integer,
  created_at timestamptz not null default now(),
  check (
    (competition_scope = 'league' and league_season_id is not null and tournament_id is null)
    or (competition_scope = 'tournament' and tournament_id is not null and league_season_id is null)
    or competition_scope in ('org','eights')
  )
);
create index if not exists matches_scope_idx on public.matches(competition_scope);
create index if not exists matches_league_season_idx on public.matches(league_season_id);
create index if not exists matches_tournament_idx on public.matches(tournament_id);

create table if not exists public.match_maps (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  map_number integer not null,
  mode text not null,
  map_name text not null,
  score_a integer,
  score_b integer,
  screenshot_url text,
  created_at timestamptz not null default now(),
  unique(match_id, map_number)
);

create table if not exists public.player_map_stats (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.match_maps(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kills integer,
  deaths integer,
  assists integer,
  score integer,
  spm numeric(8,2),
  objective jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('manual','csv','ocr','api')),
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  unique(map_id, profile_id)
);
create index if not exists player_map_stats_profile_idx on public.player_map_stats(profile_id);

create table if not exists public.roster_transactions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('league','tournament','org')),
  transaction_type text not null check (transaction_type in ('add','drop','transfer','captain_change','role_change')),
  profile_id uuid not null references public.profiles(id),
  league_team_id uuid references public.league_teams(id),
  tournament_entry_id uuid references public.tournament_entries(id),
  org_team_id uuid references public.org_teams(id),
  submitted_by uuid references public.profiles(id),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','cancelled')),
  staff_note text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.discord_role_bindings (
  id uuid primary key default gen_random_uuid(),
  guild_scope text not null check (guild_scope in ('org','league')),
  binding_type text not null,
  entity_id uuid,
  discord_role_id text not null,
  active boolean not null default true,
  unique(guild_scope, binding_type, entity_id)
);

create table if not exists public.discord_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  source_transaction_id uuid references public.roster_transactions(id),
  guild_scope text not null check (guild_scope in ('org','league')),
  action text not null check (action in ('add_role','remove_role','sync_member')),
  discord_role_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','complete','failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists discord_sync_jobs_queue_idx on public.discord_sync_jobs(status, next_attempt_at);

create table if not exists public.eight_ladders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('org_community','league')),
  discord_guild_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.eight_ratings (
  ladder_id uuid not null references public.eight_ladders(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  elo integer not null default 1500,
  wins integer not null default 0,
  losses integer not null default 0,
  streak integer not null default 0,
  primary key (ladder_id, profile_id)
);

create table if not exists public.integrity_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  opened_by uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewing','cleared','actioned','closed')),
  summary text,
  decision text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.integrity_review_notes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.integrity_reviews(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  note text not null,
  evidence_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.player_rank_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  game_title text not null,
  season_label text not null,
  rank text,
  peak_rank text,
  games_played integer,
  source text,
  recorded_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id text,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.activision_aliases enable row level security;
alter table public.staff_members enable row level security;
alter table public.org_teams enable row level security;
alter table public.org_roster_members enable row level security;
alter table public.league_seasons enable row level security;
alter table public.league_teams enable row level security;
alter table public.league_roster_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_roster_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_maps enable row level security;
alter table public.player_map_stats enable row level security;
alter table public.roster_transactions enable row level security;
alter table public.discord_role_bindings enable row level security;
alter table public.discord_sync_jobs enable row level security;
alter table public.eight_ladders enable row level security;
alter table public.eight_ratings enable row level security;
alter table public.integrity_reviews enable row level security;
alter table public.integrity_review_notes enable row level security;
alter table public.player_rank_history enable row level security;
alter table public.audit_log enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

create policy "players can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "players can update limited own profile row"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.verify_player_identity(p_activision_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_discord_id text;
  v_discord_username text;
  v_activision_display text := btrim(p_activision_id);
  v_activision_key text := lower(btrim(p_activision_id));
  v_old_activision text;
  v_old_key text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_activision_display is null or length(v_activision_display) < 3 or position('#' in v_activision_display) = 0 then
    raise exception 'Full Activision ID including # is required';
  end if;

  select i.provider_id,
         coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name', i.identity_data ->> 'preferred_username')
    into v_discord_id, v_discord_username
  from auth.identities i
  where i.user_id = v_uid and i.provider = 'discord'
  order by i.last_sign_in_at desc nulls last
  limit 1;

  if v_discord_id is null then
    raise exception 'Discord identity is required before Activision verification';
  end if;

  select p.activision_id, p.activision_key
    into v_old_activision, v_old_key
  from public.profiles p
  where p.id = v_uid;

  if exists (
    select 1 from public.profiles p
    where p.activision_key = v_activision_key and p.id <> v_uid
  ) then
    raise exception 'That Activision ID is already linked to another verified profile';
  end if;

  insert into public.profiles (
    id, discord_user_id, discord_username, activision_id, activision_key,
    verification_status, verified_at, updated_at
  ) values (
    v_uid, v_discord_id, v_discord_username, v_activision_display, v_activision_key,
    'verified', now(), now()
  )
  on conflict (id) do update set
    discord_user_id = excluded.discord_user_id,
    discord_username = excluded.discord_username,
    activision_id = excluded.activision_id,
    activision_key = excluded.activision_key,
    verification_status = 'verified',
    verified_at = now(),
    updated_at = now();

  if v_old_key is not null and v_old_key <> v_activision_key then
    insert into public.activision_aliases(profile_id, activision_id, activision_key, last_seen_at)
    values (v_uid, v_old_activision, v_old_key, now())
    on conflict (profile_id, activision_key) do update set last_seen_at = now();
  end if;

  insert into public.activision_aliases(profile_id, activision_id, activision_key)
  values (v_uid, v_activision_display, v_activision_key)
  on conflict (profile_id, activision_key) do update set last_seen_at = null;

  return jsonb_build_object(
    'profile_id', v_uid,
    'discord_user_id', v_discord_id,
    'activision_id', v_activision_display,
    'verification_status', 'verified'
  );
end;
$$;

revoke all on function public.verify_player_identity(text) from public, anon;
grant execute on function public.verify_player_identity(text) to authenticated;
