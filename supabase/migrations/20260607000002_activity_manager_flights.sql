-- =============================================================
-- Migration: extend activity_manager to flights
-- activity_managers can add, edit, delete, and assign flights,
-- and see the full timeline (all members' items).
-- Requires can_manage_activities() from 20260607000001.
-- =============================================================

-- Flights: activity_managers can write.
drop policy if exists "organizer write flights" on public.flights;
create policy "manager write flights" on public.flights for all
  using (can_manage_activities(trip_id))
  with check (can_manage_activities(trip_id));

-- Flight assignments: activity_managers can write.
drop policy if exists "organizer write flight assignments" on public.flight_assignments;
create policy "manager write flight assignments" on public.flight_assignments for all
  using (exists (
    select 1 from public.flights f
    where f.id = flight_id and can_manage_activities(f.trip_id)
  ))
  with check (exists (
    select 1 from public.flights f
    where f.id = flight_id and can_manage_activities(f.trip_id)
  ));
