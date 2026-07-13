-- Moataz AI production schema for Supabase.
-- Run this once in Supabase SQL Editor before deploying the Vercel app.
create extension if not exists pgcrypto;

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
alter table public.providers add column if not exists last_tested_at timestamptz;
alter table public.providers add column if not exists updated_at timestamptz not null default now();

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

create index if not exists providers_user_id_idx on public.providers(user_id);
create index if not exists chats_user_updated_idx on public.chats(user_id, updated_at desc);
create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at);

alter table public.providers enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

drop policy if exists "providers_owner_select" on public.providers;
drop policy if exists "providers_owner_insert" on public.providers;
drop policy if exists "providers_owner_update" on public.providers;
drop policy if exists "providers_owner_delete" on public.providers;
create policy "providers_owner_select" on public.providers for select to authenticated using ((select auth.uid()) = user_id);
create policy "providers_owner_insert" on public.providers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "providers_owner_update" on public.providers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "providers_owner_delete" on public.providers for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "chats_owner_select" on public.chats;
drop policy if exists "chats_owner_insert" on public.chats;
drop policy if exists "chats_owner_update" on public.chats;
drop policy if exists "chats_owner_delete" on public.chats;
create policy "chats_owner_select" on public.chats for select to authenticated using ((select auth.uid()) = user_id);
create policy "chats_owner_insert" on public.chats for insert to authenticated with check ((select auth.uid()) = user_id and (provider_id is null or exists (select 1 from public.providers p where p.id = provider_id and p.user_id = (select auth.uid()))));
create policy "chats_owner_update" on public.chats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (provider_id is null or exists (select 1 from public.providers p where p.id = provider_id and p.user_id = (select auth.uid()))));
create policy "chats_owner_delete" on public.chats for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "messages_owner_select" on public.messages;
drop policy if exists "messages_owner_insert" on public.messages;
drop policy if exists "messages_owner_delete" on public.messages;
create policy "messages_owner_select" on public.messages for select to authenticated using ((select auth.uid()) = user_id and exists (select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid())));
create policy "messages_owner_insert" on public.messages for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid())));
create policy "messages_owner_delete" on public.messages for delete to authenticated using ((select auth.uid()) = user_id and exists (select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid())));

grant select, insert, update, delete on public.providers, public.chats, public.messages to authenticated;
revoke all on public.providers, public.chats, public.messages from anon;
-- 1. إعداد الأدوار في metadata المستخدمين
-- سنستخدم auth.users.raw_user_meta_data لتخزين الأدوار

-- 2. إنشاء جدول سجل التدقيق إذا لم يكن موجوداً
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

-- 3. تفعيل RLS على سجل التدقيق
alter table public.audit_logs enable row level security;
create policy "audit_logs_owner_select" on public.audit_logs for select to authenticated 
using (auth.jwt() -> 'user_metadata' ->> 'role' ? 'OWNER');

-- 4. وظيفة لحماية آخر OWNER
create or replace function public.check_last_owner()
returns trigger as $$
begin
  if (old.raw_user_meta_data->>'roles')::jsonb ? 'OWNER' and 
     not ((new.raw_user_meta_data->>'roles')::jsonb ? 'OWNER') then
    if (select count(*) from auth.users where (raw_user_meta_data->>'roles')::jsonb ? 'OWNER') <= 1 then
      raise exception 'لا يمكن حذف أو تخفيض صلاحيات آخر مالك (OWNER) في النظام';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 5. تريجر لحماية المالك
drop trigger if exists ensure_last_owner on auth.users;
create trigger ensure_last_owner
before update or delete on auth.users
for each row execute function public.check_last_owner();

-- 6. وظيفة لفرض تغيير كلمة المرور (إضافة علامة في metadata)
-- سيتم التعامل معها في الواجهة الأمامية أو Middleware

