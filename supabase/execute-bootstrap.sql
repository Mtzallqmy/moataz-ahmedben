
-- تنفيذ العملية في Auth schema
DO $$
DECLARE
    user_id UUID;
BEGIN
    -- التحقق من وجود المستخدم
    SELECT id INTO user_id FROM auth.users WHERE email = 'mtzallqmy@gmail.com';

    IF user_id IS NULL THEN
        -- إنشاء مستخدم جديد
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
            created_at, updated_at, confirmation_token, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 
            'mtzallqmy@gmail.com', '$2b$12$uBU2KF.uyxicf5sdTPdpculhB.kQCB0fmWYMGNo0ckMjSQ1bYhIPm', now(), 
            '{"provider": "email", "providers": ["email"]}', 
            '{"full_name": "Moataz Ahmedben", "roles": ["OWNER", "ADMIN", "SUPERVISOR"], "force_password_change": true}', now(), now(), '', ''
        ) RETURNING id INTO user_id;
    ELSE
        -- تحديث المستخدم الحالي
        UPDATE auth.users SET 
            encrypted_password = '$2b$12$uBU2KF.uyxicf5sdTPdpculhB.kQCB0fmWYMGNo0ckMjSQ1bYhIPm',
            raw_user_meta_data = raw_user_meta_data || '{"full_name": "Moataz Ahmedben", "roles": ["OWNER", "ADMIN", "SUPERVISOR"], "force_password_change": true}'::jsonb,
            updated_at = now(),
            email_confirmed_at = COALESCE(email_confirmed_at, now())
        WHERE id = user_id;
    END IF;

    -- إضافة سجل التدقيق
    INSERT INTO public.audit_logs (user_id, action, details)
    VALUES (user_id, 'BOOTSTRAP_OWNER', '{"email": "mtzallqmy@gmail.com", "roles": ["OWNER", "ADMIN", "SUPERVISOR"]}');

END $$;
