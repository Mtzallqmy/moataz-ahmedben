# إعداد Supabase لمشروع Moataz AI

1. افتح **SQL Editor** ونفّذ `schema.sql` كاملًا.
2. أضف متغيرات البيئة الموجودة في `.env.example` إلى Vercel.
3. للتهيئة الرسمية لأول مالك:
   - اضبط `BOOTSTRAP_TOKEN` بقيمة عشوائية طويلة.
   - اضبط `BOOTSTRAP_OWNER_EMAIL=mtzallqmy@gmail.com`.
   - اضبط `BOOTSTRAP_OWNER_PASSWORD` مؤقتًا.
   - انشر المشروع، ثم نفّذ طلب POST إلى `/api/setup/bootstrap` مع الهيدر `X-Bootstrap-Token`.
   - بعد النجاح احذف `BOOTSTRAP_TOKEN` و`BOOTSTRAP_OWNER_PASSWORD` من Vercel وأعد النشر.
4. إذا كان المستخدم موجودًا مسبقًا في Supabase Auth، يمكن تشغيل `execute-bootstrap.sql` لترقيته فقط. هذا الملف لا ينشئ مستخدمًا ولا يغيّر كلمة المرور.

لا تستخدم `raw_user_meta_data` للصلاحيات. المصدر الرسمي داخل التطبيق هو `public.profiles.role`، مع نسخة مساعدة في `raw_app_meta_data.app_role` تُحدّث فقط من الخادم.
