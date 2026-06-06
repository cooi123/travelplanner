-- ----- FLIGHTS --------------------------------------------------
create table if not exists public.flights (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips (id) on delete cascade,
  flight_iata         text not null,
  airline_name        text,
  departure_airport   text,
  departure_iata      text,
  departure_time      timestamptz,
  departure_timezone  text,
  arrival_airport     text,
  arrival_iata        text,
  arrival_time        timestamptz,
  arrival_timezone    text,
  flight_status       text,
  notes               text,
  created_at          timestamptz not null default now()
);

-- ----- FLIGHT ASSIGNMENTS ----------------------------------------
create table if not exists public.flight_assignments (
  id         uuid primary key default gen_random_uuid(),
  flight_id  uuid not null references public.flights (id) on delete cascade,
  member_id  uuid not null references public.trip_members (id) on delete cascade,
  unique (flight_id, member_id)
);

-- ----- RLS -------------------------------------------------------
alter table public.flights            enable row level security;
alter table public.flight_assignments enable row level security;

-- flights: members read, organizers write
drop policy if exists "read flights" on public.flights;
create policy "read flights" on public.flights for select
  using (is_trip_member(trip_id));

drop policy if exists "organizer write flights" on public.flights;
create policy "organizer write flights" on public.flights for all
  using (is_trip_organizer(trip_id)) with check (is_trip_organizer(trip_id));

-- flight_assignments: members read, organizers write
drop policy if exists "read flight assignments" on public.flight_assignments;
create policy "read flight assignments" on public.flight_assignments for select
  using (exists (
    select 1 from public.flights f
    where f.id = flight_id and is_trip_member(f.trip_id)
  ));

drop policy if exists "organizer write flight assignments" on public.flight_assignments;
create policy "organizer write flight assignments" on public.flight_assignments for all
  using (exists (
    select 1 from public.flights f
    where f.id = flight_id and is_trip_organizer(f.trip_id)
  ))
  with check (exists (
    select 1 from public.flights f
    where f.id = flight_id and is_trip_organizer(f.trip_id)
  ));
