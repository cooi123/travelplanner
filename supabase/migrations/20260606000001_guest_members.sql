-- =============================================================
-- Migration: guest / placeholder members
-- Allows organizers to add people by name before they have an account.
-- When they sign up and join via invite, user_id gets filled in.
-- =============================================================

-- Make user_id optional so a row can exist without an account.
alter table public.trip_members
  alter column user_id drop not null;

-- Store the placeholder name and email.
alter table public.trip_members
  add column if not exists guest_name  text,
  add column if not exists guest_email text;

-- Either a real user_id or a guest_name must be present.
alter table public.trip_members
  add constraint trip_members_identity_check
  check (user_id is not null or guest_name is not null);

-- Index so the join-page claim query is fast.
create index if not exists idx_trip_members_guest_email
  on public.trip_members (trip_id, guest_email);

-- =============================================================
-- Update the unique constraint so two guests with the same
-- trip can coexist (only real users need to be unique per trip).
-- The original unique(trip_id, user_id) partial-covers nulls in
-- most Postgres versions, but let's make it explicit.
-- =============================================================
alter table public.trip_members
  drop constraint if exists trip_members_trip_id_user_id_key;

create unique index if not exists trip_members_real_user_unique
  on public.trip_members (trip_id, user_id)
  where user_id is not null;

-- =============================================================
-- Update RLS: organizers can insert guest rows (user_id = null).
-- The existing "join trip" policy checks user_id = auth.uid()
-- which would block guest inserts from the organizer. Replace it.
-- =============================================================
drop policy if exists "join trip" on public.trip_members;

create policy "join trip" on public.trip_members for insert
  with check (
    -- A user joining themselves
    (user_id = auth.uid())
    or
    -- An organizer adding a guest (user_id may be null)
    is_trip_organizer(trip_id)
  );

-- Organizers can also update guest rows (e.g. to claim them).
-- The existing "organizer update members" policy covers this.
-- But we also need to allow a user to claim their own guest slot.
drop policy if exists "claim guest slot" on public.trip_members;
create policy "claim guest slot" on public.trip_members for update
  using (
    -- The row has no user yet and the email matches the logged-in user
    user_id is null
    and guest_email = (select email from public.profiles where id = auth.uid())
  )
  with check (user_id = auth.uid());
