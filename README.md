# معتز العلقمي — Moataz AI

منصة React/Vite عربية تعمل على Vercel وتستخدم Supabase Auth وPostgres وRLS، مع استدعاء حقيقي لمزودي الذكاء الاصطناعي.

## التشغيل المحلي

```bash
npm install
cp .env.example .env.local
npm run dev
```

## قبل النشر

1. نفّذ `supabase/schema.sql` في SQL Editor.
2. أضف متغيرات `.env.example` في Vercel لكل البيئات المطلوبة.
3. اجعل `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` أو المفتاح publishable عامين فقط.
4. اجعل `SUPABASE_SERVICE_ROLE_KEY` و`ENCRYPTION_KEY` متغيرين server-only، ولا تستخدم لهما بادئة `VITE_`.
5. فعّل Email Auth في Supabase واضبط Site URL وRedirect URLs على نطاق Vercel.

## ما تم إصلاحه

- إزالة المصادقة الوهمية وlocalStorage للمستخدمين، واستبدالها بـ Supabase Auth.
- ربط المحادثات والرسائل بقاعدة Supabase مع سياسات RLS وعزل حسب `auth.uid()`.
- إضافة وظائف Vercel محمية بجلسة Supabase لإدارة المزودات والدردشة.
- تشفير مفاتيح API في الخادم باستخدام AES-256-GCM وعدم إرسالها أو تخزينها في المتصفح.
- دعم Gemini وAnthropic وOpenAI وOpenRouter وجميع المزودات OpenAI-compatible عبر Base URL.
- اختبار حقيقي للمفتاح واكتشاف النماذج من واجهة المزود، مع إرجاع رسائل الخطأ الفعلية.
- بث SSE لمزودي OpenAI-compatible، وإيقاف التوليد من الواجهة.
- إصلاح توجيه SPA في Vercel حتى لا يبتلع مسارات `/api`.

## التحقق

```bash
npm run typecheck
npm run typecheck:api
npm run build
```

لا توجد مفاتيح مزود افتراضية مطلوبة؛ يضيف كل مستخدم مفتاحه من صفحة «المزودون».
