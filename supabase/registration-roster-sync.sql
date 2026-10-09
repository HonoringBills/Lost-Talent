-- Keep approved registration slots, active roster tables and generic Discord player
-- roles synchronized regardless of whether staff approval or player verification happens first.

create or replace function public.sync_approved_registration_roster()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role_id text;
  v_source_type text;
  v_guild_scope text := 'league';
  v_should_queue boolean := false;
begin
  if new.approval_status = 'approved'
     and new.profile_id is not null
     and new.resolution_status = 'linked' then

    if new.scope = 'league' then
      insert into public.league_roster_members (
        league_team_id, profile_id, roster_role, eligibility_status, approved_at, left_at
      ) values (
        new.league_team_id, new.profile_id, new.roster_role, 'eligible', coalesce(new.approved_at, now()), null
      )
      on conflict (league_team_id, profile_id) do update
      set roster_role = excluded.roster_role,
          eligibility_status = 'eligible',
          approved_at = coalesce(public.league_roster_members.approved_at, excluded.approved_at),
          left_at = null;

      select dgc.league_player_role_id
        into v_role_id
      from public.discord_guild_configs dgc
      where dgc.league_player_role_id is not null
      order by dgc.updated_at desc
      limit 1;
      v_source_type := 'approved_league_registration';

    elsif new.scope = 'tournament' then
      insert into public.tournament_roster_members (
        tournament_entry_id, profile_id, roster_role, eligibility_status
      ) values (
        new.tournament_entry_id, new.profile_id, new.roster_role, 'eligible'
      )
      on conflict (tournament_entry_id, profile_id) do update
      set roster_role = excluded.roster_role,
          eligibility_status = 'eligible';

      select dgc.tournament_player_role_id
        into v_role_id
      from public.discord_guild_configs dgc
      where dgc.tournament_player_role_id is not null
      order by dgc.updated_at desc
      limit 1;
      v_source_type := 'approved_tournament_registration';

    elsif new.scope = 'org' then
      if not exists (
        select 1
        from public.org_roster_members orm
        where orm.org_team_id = new.org_team_id
          and orm.profile_id = new.profile_id
          and orm.left_at is null
      ) then
        insert into public.org_roster_members (
          org_team_id, profile_id, roster_role, joined_at, left_at
        ) values (
          new.org_team_id, new.profile_id, new.roster_role, now(), null
        );
      end if;
    end if;

    if v_role_id is not null and v_source_type is not null then
      insert into public.discord_role_entitlements (
        profile_id, guild_scope, discord_role_id, source_type, source_id, active, revoked_at
      ) values (
        new.profile_id, v_guild_scope, v_role_id, v_source_type, new.id::text, true, null
      )
      on conflict (profile_id, guild_scope, discord_role_id, source_type, source_id) do update
      set active = true,
          revoked_at = null;

      v_should_queue := tg_op = 'INSERT'
        or old.approval_status is distinct from new.approval_status
        or old.profile_id is distinct from new.profile_id
        or old.resolution_status is distinct from new.resolution_status;

      if v_should_queue then
        insert into public.discord_sync_jobs (
          profile_id, guild_scope, action, discord_role_id, payload
        ) values (
          new.profile_id,
          v_guild_scope,
          'add_role',
          v_role_id,
          jsonb_build_object('registration_slot_id', new.id, 'source', v_source_type)
        );
      end if;
    end if;

  elsif old.approval_status = 'approved'
        and new.approval_status <> 'approved'
        and old.profile_id is not null then

    if old.scope = 'league' then
      update public.league_roster_members
      set eligibility_status = 'ineligible',
          left_at = coalesce(left_at, now())
      where league_team_id = old.league_team_id
        and profile_id = old.profile_id;

      select dgc.league_player_role_id
        into v_role_id
      from public.discord_guild_configs dgc
      where dgc.league_player_role_id is not null
      order by dgc.updated_at desc
      limit 1;
      v_source_type := 'approved_league_registration';

    elsif old.scope = 'tournament' then
      delete from public.tournament_roster_members
      where tournament_entry_id = old.tournament_entry_id
        and profile_id = old.profile_id;

      select dgc.tournament_player_role_id
        into v_role_id
      from public.discord_guild_configs dgc
      where dgc.tournament_player_role_id is not null
      order by dgc.updated_at desc
      limit 1;
      v_source_type := 'approved_tournament_registration';

    elsif old.scope = 'org' then
      update public.org_roster_members
      set left_at = coalesce(left_at, now())
      where org_team_id = old.org_team_id
        and profile_id = old.profile_id
        and left_at is null;
    end if;

    if v_role_id is not null and v_source_type is not null then
      update public.discord_role_entitlements
      set active = false,
          revoked_at = coalesce(revoked_at, now())
      where profile_id = old.profile_id
        and guild_scope = v_guild_scope
        and discord_role_id = v_role_id
        and source_type = v_source_type
        and source_id = old.id::text;

      if not exists (
        select 1
        from public.discord_role_entitlements dre
        where dre.profile_id = old.profile_id
          and dre.guild_scope = v_guild_scope
          and dre.discord_role_id = v_role_id
          and dre.active = true
      ) then
        insert into public.discord_sync_jobs (
          profile_id, guild_scope, action, discord_role_id, payload
        ) values (
          old.profile_id,
          v_guild_scope,
          'remove_role',
          v_role_id,
          jsonb_build_object('registration_slot_id', old.id, 'source', v_source_type)
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_approved_registration_roster() from public;
grant execute on function public.sync_approved_registration_roster() to service_role;

drop trigger if exists sync_approved_registration_roster_trigger on public.roster_registration_slots;
create trigger sync_approved_registration_roster_trigger
after insert or update of approval_status, profile_id, resolution_status, roster_role
on public.roster_registration_slots
for each row
execute function public.sync_approved_registration_roster();

update public.roster_registration_slots
set approved_at = coalesce(approved_at, now())
where approval_status = 'approved'
  and profile_id is not null
  and resolution_status = 'linked';
