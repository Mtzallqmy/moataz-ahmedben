-- Safe SQL fallback: promote an EXISTING Supabase Auth user.
-- This file intentionally does not insert into auth.users and does not set passwords.
-- Preferred creation method: POST /api/setup/bootstrap using Supabase Admin API.

do $$
declare
  target_email text := 'mtzallqmy@gmail.com';
  target_id uuid;
  desired_username text := 'moataz';
  username_owner uuid;
begin
  select id into target_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_id is null then
    raise exception 'المستخدم % غير موجود في Authentication. أنشئه عبر /api/setup/bootstrap أو Supabase Dashboard أولاً.', target_email;
  end if;

  select id into username_owner
  from public.profiles
  where lower(username) = lower(desired_username)
    and id <> target_id
  limit 1;

  if username_owner is not null then
    desired_username := 'moataz-' || left(target_id::text, 8);
  end if;

  insert into public.profiles (
    id, username, display_name, role, is_active,
    must_change_password, is_internal_email, updated_at
  ) values (
    target_id, desired_username, 'Moataz Alalqami', 'owner', true,
    true, false, now()
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    role = 'owner',
    is_active = true,
    must_change_password = true,
    is_internal_email = false,
    updated_at = now();

  insert into public.audit_logs (actor_id, target_user_id, action, details)
  values (target_id, target_id, 'OWNER_PROMOTED_BY_SQL', jsonb_build_object('email', target_email));
end $$;

select p.id, p.username, u.email, p.role, p.is_active, p.must_change_password
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('mtzallqmy@gmail.com');
