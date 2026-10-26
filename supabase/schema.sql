-- Letters for Baby: secure Supabase schema
-- Run this entire file in Supabase SQL Editor using a fresh project.
-- The frontend must use only the publishable/anon key, never service_role.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our little world',
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text not null check (category in (
    'When you miss me', 'When you''re sad', 'When you need a hug',
    'Just because', 'When you need courage', 'A little thank-you'
  )),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists letters_couple_created_idx
  on public.letters(couple_id, created_at desc);
create index if not exists letters_author_idx on public.letters(author_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.letters enable row level security;
alter table public.push_subscriptions enable row level security;

-- Helpers are SECURITY DEFINER to avoid recursive RLS checks on couple_members.
create or replace function public.current_couple_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select cm.couple_id
  from public.couple_members cm
  where cm.user_id = (select auth.uid())
  limit 1
$$;

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
    raise exception 'You must sign in first.';
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

create or replace function public.join_couple(invite_code_input text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_couple_id uuid;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'You must sign in first.';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You are already connected to a couple space.';
  end if;

  select c.id into target_couple_id
  from public.couples c
  where c.invite_code = upper(trim(invite_code_input))
  for update;

  if target_couple_id is null then
    raise exception 'That invite code is invalid. Ask your person to send it again.';
  end if;

  select count(*) into member_count
  from public.couple_members where couple_id = target_couple_id;

  if member_count >= 2 then
    raise exception 'This space already has two members.';
  end if;

  insert into public.couple_members(couple_id, user_id)
  values (target_couple_id, auth.uid());

  return target_couple_id;
end;
$$;

-- Profiles: each signed-in user can read/update only their own profile.
create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Couples and memberships can be read only by people in that couple.
create policy "couples_select_member" on public.couples
for select to authenticated using (id = (select public.current_couple_id()));
create policy "members_select_same_couple" on public.couple_members
for select to authenticated using (couple_id = (select public.current_couple_id()));

-- Letters are visible to the two members of the same couple.
create policy "letters_select_same_couple" on public.letters
for select to authenticated using (couple_id = (select public.current_couple_id()));

-- A person can create letters only as themselves, inside their own couple space.
create policy "letters_insert_own_in_couple" on public.letters
for insert to authenticated with check (
  author_id = (select auth.uid())
  and couple_id = (select public.current_couple_id())
);

-- Authors can edit/delete only their own letters, still within the same couple.
create policy "letters_update_own" on public.letters
for update to authenticated using (
  author_id = (select auth.uid())
  and couple_id = (select public.current_couple_id())
) with check (
  author_id = (select auth.uid())
  and couple_id = (select public.current_couple_id())
);
create policy "letters_delete_own" on public.letters
for delete to authenticated using (
  author_id = (select auth.uid())
  and couple_id = (select public.current_couple_id())
);

create policy "push_subscriptions_select_own" on public.push_subscriptions
for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions_insert_own" on public.push_subscriptions
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_subscriptions_update_own" on public.push_subscriptions
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "push_subscriptions_delete_own" on public.push_subscriptions
for delete to authenticated using (user_id = (select auth.uid()));

-- Grant only the operations the app needs. RLS remains the actual access gate.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.couples to authenticated;
grant select on public.couple_members to authenticated;
grant select, insert, update, delete on public.letters to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant execute on function public.current_couple_id() to authenticated;
grant execute on function public.create_couple(text) to authenticated;
grant execute on function public.join_couple(text) to authenticated;

-- Do not expose internal tables or RPCs to anon. Supabase Auth owns auth.users.
revoke all on public.profiles from anon;
revoke all on public.couples from anon;
revoke all on public.couple_members from anon;
revoke all on public.letters from anon;
revoke all on public.push_subscriptions from anon;
revoke execute on function public.create_couple(text) from anon;
revoke execute on function public.join_couple(text) from anon;