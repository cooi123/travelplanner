-- =============================================================
-- Migration: activity_manager role
-- Organizers can promote participants to activity_manager, granting
-- full add / edit / delete / assign permissions on activities only.
-- All other organizer privileges (members, accommodations, invites)
-- remain restricted to the organizer role.
-- =============================================================

-- Extend the role CHECK constraint.
alter table public.trip_members
  drop constraint if exists trip_members_role_check;

alter table public.trip_members
  add constraint trip_members_role_check
  check (role in ('organizer', 'participant', 'activity_manager'));

-- Helper: true if the current user can manage activities for this trip.
create or replace function public.can_manage_activities(p_trip_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id
      and user_id = auth.uid()
      and role in ('organizer', 'activity_manager')
  );
$$;

-- Activities: organizers AND activity_managers can write.
drop policy if exists "organizer write activities" on public.activities;
create policy "manager write activities" on public.activities for all
  using (can_manage_activities(trip_id))
  with check (can_manage_activities(trip_id));

-- activity_participants: organizers AND activity_managers can manage assignments.
drop policy if exists "manage own activity interest" on public.activity_participants;
create policy "manage own activity interest" on public.activity_participants for all
  using (
    exists (
      select 1 from public.trip_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and can_manage_activities(a.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.trip_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and can_manage_activities(a.trip_id)
    )
  );
