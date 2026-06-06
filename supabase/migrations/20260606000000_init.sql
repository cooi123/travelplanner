-- =============================================================
-- Travel Planner — Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================

-- ----- PROFILES ---------------------------------------------------
-- One row per auth user. Auto-created on signup via trigger below.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- ----- TRIPS ------------------------------------------------------
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  destination text,
  start_date  date,
  end_date    date,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ----- TRIP MEMBERS ----------------------------------------------
-- Links a user to a trip with a role. This is the heart of "who's going".
create table if not exists public.trip_members (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null default 'participant' check (role in ('organizer','participant')),
  dietary_notes text,
  notes         text,
  joined_at     timestamptz not null default now(),
  unique (trip_id, user_id)
);

-- ----- ACCOMMODATIONS --------------------------------------------
create table if not exists public.accommodations (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null,                 -- "Room A", "Beach House"
  type       text,                          -- hotel / airbnb / tent ...
  address    text,
  check_in   date,
  check_out  date,
  capacity   int not null default 1,
  notes      text,
  created_at timestamptz not null default now()
);

-- ----- ACCOMMODATION ASSIGNMENTS ---------------------------------
-- Which trip member sleeps where.
create table if not exists public.accommodation_assignments (
  id               uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodations (id) on delete cascade,
  member_id        uuid not null references public.trip_members (id) on delete cascade,
  unique (accommodation_id, member_id)
);

-- ----- ACTIVITIES ------------------------------------------------
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  capacity    int,                          -- null = unlimited
  created_at  timestamptz not null default now()
);

-- ----- ACTIVITY PARTICIPANTS -------------------------------------
-- interest / confirm flow: who wants in, who the organizer locked in.
create table if not exists public.activity_participants (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  member_id   uuid not null references public.trip_members (id) on delete cascade,
  status      text not null default 'interested' check (status in ('interested','confirmed','declined')),
  unique (activity_id, member_id)
);

-- ----- INVITES ---------------------------------------------------
-- Shareable link tokens so people can join a trip.
create table if not exists public.trip_invites (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  email      text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================
-- Auto-create a profile row whenever a new auth user signs up
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- Helper: is the current user a member of this trip?
-- Used by RLS policies. SECURITY DEFINER avoids recursive RLS.
-- =============================================================
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_organizer(p_trip_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and role = 'organizer'
  );
$$;

-- =============================================================
-- Row Level Security
-- Rule of thumb: members can READ everything in their trip;
-- only organizers can WRITE structural data (accommodations,
-- activities, assignments). Participants can manage their OWN
-- activity interest.
-- =============================================================
alter table public.profiles                  enable row level security;
alter table public.trips                      enable row level security;
alter table public.trip_members               enable row level security;
alter table public.accommodations             enable row level security;
alter table public.accommodation_assignments  enable row level security;
alter table public.activities                 enable row level security;
alter table public.activity_participants      enable row level security;
alter table public.trip_invites               enable row level security;

-- profiles: you can read profiles of people you share a trip with; edit your own
drop policy if exists "read shared profiles" on public.profiles;
create policy "read shared profiles" on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.trip_members m1
      join public.trip_members m2 on m1.trip_id = m2.trip_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (id = auth.uid());

-- trips: members can read; creator/organizer can write
drop policy if exists "read member trips" on public.trips;
create policy "read member trips" on public.trips for select
  using (is_trip_member(id) or created_by = auth.uid());
drop policy if exists "create trips" on public.trips;
create policy "create trips" on public.trips for insert
  with check (created_by = auth.uid());
drop policy if exists "organizer update trips" on public.trips;
create policy "organizer update trips" on public.trips for update
  using (is_trip_organizer(id) or created_by = auth.uid());
drop policy if exists "organizer delete trips" on public.trips;
create policy "organizer delete trips" on public.trips for delete
  using (created_by = auth.uid());

-- trip_members: members read all members of their trips; organizers manage
drop policy if exists "read trip members" on public.trip_members;
create policy "read trip members" on public.trip_members for select
  using (is_trip_member(trip_id));
drop policy if exists "join trip" on public.trip_members;
create policy "join trip" on public.trip_members for insert
  with check (user_id = auth.uid() or is_trip_organizer(trip_id));
drop policy if exists "organizer update members" on public.trip_members;
create policy "organizer update members" on public.trip_members for update
  using (is_trip_organizer(trip_id));
drop policy if exists "organizer remove members" on public.trip_members;
create policy "organizer remove members" on public.trip_members for delete
  using (is_trip_organizer(trip_id) or user_id = auth.uid());

-- accommodations: members read, organizers write
drop policy if exists "read accommodations" on public.accommodations;
create policy "read accommodations" on public.accommodations for select
  using (is_trip_member(trip_id));
drop policy if exists "organizer write accommodations" on public.accommodations;
create policy "organizer write accommodations" on public.accommodations for all
  using (is_trip_organizer(trip_id)) with check (is_trip_organizer(trip_id));

-- accommodation_assignments: members read, organizers write
drop policy if exists "read assignments" on public.accommodation_assignments;
create policy "read assignments" on public.accommodation_assignments for select
  using (exists (
    select 1 from public.accommodations a
    where a.id = accommodation_id and is_trip_member(a.trip_id)
  ));
drop policy if exists "organizer write assignments" on public.accommodation_assignments;
create policy "organizer write assignments" on public.accommodation_assignments for all
  using (exists (
    select 1 from public.accommodations a
    where a.id = accommodation_id and is_trip_organizer(a.trip_id)
  ))
  with check (exists (
    select 1 from public.accommodations a
    where a.id = accommodation_id and is_trip_organizer(a.trip_id)
  ));

-- activities: members read, organizers write
drop policy if exists "read activities" on public.activities;
create policy "read activities" on public.activities for select
  using (is_trip_member(trip_id));
drop policy if exists "organizer write activities" on public.activities;
create policy "organizer write activities" on public.activities for all
  using (is_trip_organizer(trip_id)) with check (is_trip_organizer(trip_id));

-- activity_participants: members read all; a member can manage their OWN
-- interest; organizers can manage anyone (to confirm people).
drop policy if exists "read activity participants" on public.activity_participants;
create policy "read activity participants" on public.activity_participants for select
  using (exists (
    select 1 from public.activities a
    where a.id = activity_id and is_trip_member(a.trip_id)
  ));
drop policy if exists "manage own activity interest" on public.activity_participants;
create policy "manage own activity interest" on public.activity_participants for all
  using (
    exists (
      select 1 from public.trip_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and is_trip_organizer(a.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.trip_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and is_trip_organizer(a.trip_id)
    )
  );

-- invites: organizers manage; anyone authenticated can read by token (to join)
drop policy if exists "organizer manage invites" on public.trip_invites;
create policy "organizer manage invites" on public.trip_invites for all
  using (is_trip_organizer(trip_id)) with check (is_trip_organizer(trip_id));
drop policy if exists "read invite to join" on public.trip_invites;
create policy "read invite to join" on public.trip_invites for select
  using (auth.role() = 'authenticated');
