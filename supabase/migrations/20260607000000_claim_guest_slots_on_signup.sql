-- =============================================================
-- Migration: auto-claim guest trip_member slots on signup
-- When a new user signs up, any trip_members rows with a
-- matching guest_email and no user_id get linked to the new account.
-- Runs inside handle_new_user (SECURITY DEFINER) so it bypasses RLS.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  -- Link any guest trip-member slots that share this email.
  update public.trip_members
  set user_id = new.id
  where user_id is null
    and guest_email = new.email;

  return new;
end;
$$;
