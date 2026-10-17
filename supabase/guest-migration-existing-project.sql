-- Run once in Supabase SQL Editor for the already-created project.
-- Keeps existing tables, letters, couples, and RLS policies.

-- Anonymous Auth users have no email address.
alter table public.profiles alter column email drop not null;

-- Ensure pgcrypto is available in the schema referenced below.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Replace the existing RPC body so its random-byte function is schema-qualified.
create or replace function public.create_couple(couple_name text default 'Our little world')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_couple_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'A guest session is required.';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You are already connected to a couple space.';
  end if;
  loop
    new_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.couples where invite_code = new_code);
  end loop;
  insert into public.couples(name, invite_code, created_by)
  values (left(coalesce(nullif(trim(couple_name), ''), 'Our little world'), 80), new_code, auth.uid())
  returning id into new_couple_id;
  insert into public.couple_members(couple_id, user_id)
  values (new_couple_id, auth.uid());
  return new_code;
end;
$$;

grant execute on function public.create_couple(text) to authenticated;
revoke execute on function public.create_couple(text) from anon;
