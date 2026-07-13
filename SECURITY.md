# Security

- لا ترفع `.env` أو مفاتيح Supabase السرية أو مفاتيح المزودات إلى Git.
- استخدم مفتاح Supabase القابل للنشر في المتصفح، ولا تستخدم `service_role` خارجه.
- خزّن الصلاحيات في `public.profiles.role`، وليس في `user_metadata`.
- احذف أسرار bootstrap بعد إنشاء أول مالك.
- غيّر أي سر ظهر في محادثة أو سجل أو لقطة شاشة.
- لا تغيّر `ENCRYPTION_KEY` دون إعادة تشفير مفاتيح المزودات المخزنة.
- شغّل `npm run check` و`npm audit` قبل كل نشر.
