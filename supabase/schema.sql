-- Moataz AI — production Supabase schema
-- Idempotent: safe to re-run from Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Remove unsafe artifacts from older project revisions.
drop trigger if exists ensure_last_owner on auth.users;
drop function if exists public.check_last_owner() cascade;

-- =========================================================
-- Profiles and application roles
-- Authorization is read from this table, never from user_metadata.
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text not null default 'مستخدم',
  avatar_url text,
  role text not null default 'user',
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  is_internal_email boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text not null default 'مستخدم';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists is_internal_email boolean not null default false;
alter table public.profiles add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Normalize legacy values before replacing validation constraints.
update public.profiles
set role = 'user'
where role is null or role not in ('owner', 'admin', 'supervisor', 'user');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'supervisor', 'user'));

alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username is null or username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$');

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username)) where username is not null;
create index if not exists profiles_role_active_idx on public.profiles(role, is_active);

-- Create a default profile for every new Supabase Auth user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    role,
    is_active,
    must_change_password,
    is_internal_email
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'مستخدم'), '@', 1)),
    case
      when new.raw_app_meta_data ->> 'app_role' in ('owner', 'admin', 'supervisor', 'user')
        then new.raw_app_meta_data ->> 'app_role'
      else 'user'
    end,
    true,
    false,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles for existing Auth users without changing their passwords.
insert into public.profiles (id, display_name, role, is_active)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(u.email, 'مستخدم'), '@', 1)),
  case
    when u.raw_app_meta_data ->> 'app_role' in ('owner', 'admin', 'supervisor', 'user')
      then u.raw_app_meta_data ->> 'app_role'
    else 'user'
  end,
  true
from auth.users u
on conflict (id) do nothing;

-- =========================================================
-- Provider credentials and diagnostics
-- =========================================================
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('gemini','openai','openai-compatible','openrouter','anthropic','nvidia','groq','deepseek','mistral','together','custom')),
  base_url text,
  model text,
  encrypted_key jsonb not null,
  is_enabled boolean not null default true,
  status text not null default 'untested' check (status in ('connected','error','untested')),
  error_message text,
  models jsonb not null default '[]'::jsonb,
  detected_protocol text,
  diagnostic jsonb,
  last_latency_ms integer,
  last_http_status integer,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.providers add column if not exists base_url text;
alter table public.providers add column if not exists model text;
alter table public.providers add column if not exists encrypted_key jsonb;
alter table public.providers add column if not exists is_enabled boolean not null default true;
alter table public.providers add column if not exists status text not null default 'untested';
alter table public.providers add column if not exists error_message text;
alter table public.providers add column if not exists models jsonb not null default '[]'::jsonb;
alter table public.providers add column if not exists detected_protocol text;
alter table public.providers add column if not exists diagnostic jsonb;
alter table public.providers add column if not exists last_latency_ms integer;
alter table public.providers add column if not exists last_http_status integer;
alter table public.providers add column if not exists last_tested_at timestamptz;
alter table public.providers add column if not exists updated_at timestamptz not null default now();

create index if not exists providers_user_id_idx on public.providers(user_id);

-- Field-level protection: browser clients never receive encrypted_key.
-- This helper is used only by chat RLS to verify provider ownership.
create or replace function public.owns_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.providers p
    where p.id = p_provider_id
      and p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_provider(uuid) from public, anon;
grant execute on function public.owns_provider(uuid) to authenticated;

-- =========================================================
-- Chats and messages
-- =========================================================
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  provider_id uuid references public.providers(id) on delete set null,
  model text not null default '',
  mode text not null default 'chat' check (mode in ('chat','agent')),
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('system','user','assistant','tool')),
  content text not null,
  model text,
  tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists chats_user_updated_idx on public.chats(user_id, updated_at desc);
create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at);

-- =========================================================
-- Audit trail (server-only)
-- =========================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs add column if not exists actor_id uuid references auth.users(id) on delete set null;
alter table public.audit_logs add column if not exists target_user_id uuid references auth.users(id) on delete set null;
alter table public.audit_logs add column if not exists details jsonb not null default '{}'::jsonb;
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_target_created_idx on public.audit_logs(target_user_id, created_at desc);

-- Remove a legacy browser-visible audit policy if an older schema created it.
drop policy if exists audit_logs_owner_select on public.audit_logs;

-- =========================================================
-- Atomic API rate limits (server-only)
-- =========================================================
create table if not exists public.api_rate_limits (
  key_hash text not null,
  action text not null,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (key_hash, action),
  constraint api_rate_limits_key_hash_check check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint api_rate_limits_action_check check (char_length(action) between 1 and 80)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits(updated_at);

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_window_started_at timestamptz;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid rate limit key';
  end if;
  if p_action is null or char_length(p_action) not between 1 and 80 then
    raise exception 'invalid rate limit action';
  end if;
  if p_limit not between 1 and 100000 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.api_rate_limits as limits (
    key_hash, action, request_count, window_started_at, updated_at
  ) values (
    p_key_hash, p_action, 1, v_now, v_now
  )
  on conflict (key_hash, action) do update
  set
    request_count = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else limits.request_count + 1
    end,
    window_started_at = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else limits.window_started_at
    end,
    updated_at = v_now
  returning request_count, window_started_at
  into v_count, v_window_started_at;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.providers enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.api_rate_limits enable row level security;

-- Profiles: browser clients can only read their own profile.
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

-- Providers: strictly isolated per user.
drop policy if exists providers_owner_select on public.providers;
drop policy if exists providers_owner_insert on public.providers;
drop policy if exists providers_owner_update on public.providers;
drop policy if exists providers_owner_delete on public.providers;
create policy providers_owner_select on public.providers for select to authenticated using ((select auth.uid()) = user_id);
create policy providers_owner_insert on public.providers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy providers_owner_update on public.providers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy providers_owner_delete on public.providers for delete to authenticated using ((select auth.uid()) = user_id);

-- Chats and messages: ownership plus provider ownership.
drop policy if exists chats_owner_select on public.chats;
drop policy if exists chats_owner_insert on public.chats;
drop policy if exists chats_owner_update on public.chats;
drop policy if exists chats_owner_delete on public.chats;
create policy chats_owner_select on public.chats for select to authenticated using ((select auth.uid()) = user_id);
create policy chats_owner_insert on public.chats for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (provider_id is null or (select public.owns_provider(provider_id)))
);
create policy chats_owner_update on public.chats for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (provider_id is null or (select public.owns_provider(provider_id)))
);
create policy chats_owner_delete on public.chats for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists messages_owner_select on public.messages;
drop policy if exists messages_owner_insert on public.messages;
drop policy if exists messages_owner_delete on public.messages;
create policy messages_owner_select on public.messages for select to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid())
));
create policy messages_owner_insert on public.messages for insert to authenticated
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid())
));
create policy messages_owner_delete on public.messages for delete to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid())
));

-- No browser policy is created for audit_logs. It is accessed through server-side admin APIs only.

-- Explicit grants for exposed Data API tables.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.chats, public.messages to authenticated;
revoke all on public.providers from authenticated;
revoke all on public.profiles, public.providers, public.chats, public.messages, public.audit_logs from anon;
revoke all on public.audit_logs from authenticated;
revoke all on public.api_rate_limits from public, anon, authenticated;
