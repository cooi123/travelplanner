-- =============================================================
-- Migration: transport
-- Ground/water transport between locations (bus, train, ferry,
-- rideshare, car rental, shuttle, taxi, other).
-- Managers (organizer or activity_manager) can write; all members
-- can read.
-- =============================================================

-- ----- TRANSPORTS -----------------------------------------------
create table if not exists public.transports (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  type             text not null default 'other',
  operator         text,
  from_location    text,
  to_location      text,
  departs_at       timestamptz,
  departs_timezone text,
  arrives_at       timestamptz,
  arrives_timezone text,
  booking_ref      text,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ----- TRANSPORT ASSIGNMENTS ------------------------------------
create table if not exists public.transport_assignments (
  id            uuid primary key default gen_random_uuid(),
  transport_id  uuid not null references public.transports (id) on delete cascade,
  member_id     uuid not null references public.trip_members (id) on delete cascade,
  unique (transport_id, member_id)
);

-- ----- RLS ------------------------------------------------------
alter table public.transports            enable row level security;
alter table public.transport_assignments enable row level security;

-- transports: all trip members can read
create policy "read transports" on public.transports for select
  using (is_trip_member(trip_id));

-- transports: organizers and activity managers can write
create policy "manager write transports" on public.transports for all
  using (can_manage_activities(trip_id))
  with check (can_manage_activities(trip_id));

-- transport_assignments: all trip members can read
create policy "read transport assignments" on public.transport_assignments for select
  using (exists (
    select 1 from public.transports t
    where t.id = transport_id and is_trip_member(t.trip_id)
  ));

-- transport_assignments: organizers and activity managers can write
create policy "manager write transport assignments" on public.transport_assignments for all
  using (exists (
    select 1 from public.transports t
    where t.id = transport_id and can_manage_activities(t.trip_id)
  ))
  with check (exists (
    select 1 from public.transports t
    where t.id = transport_id and can_manage_activities(t.trip_id)
  ));
