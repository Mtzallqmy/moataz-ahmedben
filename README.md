# معتز العلقمي — Moataz AI

نسخة أولية إنتاجية لمنصة عربية على React/Vite + Vercel Functions + Supabase Auth/Postgres. تركز هذه النسخة على المصادقة والإدارة والمحادثة الحقيقية مع مزودي الذكاء الاصطناعي، دون دفع أو اشتراكات داخلية.

## ما يعمل فعليًا

- تسجيل الدخول بالبريد أو اسم المستخدم وكلمة المرور.
- ملف `profiles` آمن كمصدر رسمي للأدوار: `owner`, `admin`, `supervisor`, `user`.
- لوحة إدارة للمستخدمين: إنشاء، تفعيل/إيقاف، تغيير الدور، إعادة تعيين كلمة مرور مؤقتة، وحذف بواسطة المالك.
- إنشاء حساب باسم مستخدم فقط عبر بريد داخلي لا يظهر للمستخدم.
- تهيئة المالك الأول رسميًا عبر Supabase Admin API، بدل الإدخال المباشر في `auth.users`.
- تخزين مفاتيح المزودات مشفّرة بـ AES-256-GCM من جهة الخادم، مع منع جدول المفاتيح من الوصول المباشر عبر المتصفح.
- Gemini وAnthropic ومزودات OpenAI-compatible، بما فيها OpenAI وOpenRouter وGroq وDeepSeek وMistral وTogether وNVIDIA.
- اكتشاف فعلي للنماذج، مع اختبار توليد بديل عندما لا يدعم المزود `/models`.
- تشخيص أخطاء المفتاح والصلاحية والرصيد وحد الطلبات والنموذج والبوابة والشبكة والمهلة وخادم المزود، مع عرض رسالة المزود الأصلية.
- حماية Base URL من SSRF عبر منع localhost والشبكات الخاصة والتحقق من DNS.
- محادثات ورسائل محفوظة في Supabase ومعزولة بسياسات RLS.
- تقييد ذري للطلبات داخل PostgreSQL لمسارات الدخول والإدارة والمزودات والمحادثة.
- `/api/health` و`/api/ready` للفحص التشغيلي؛ readiness يتحقق أيضًا من قاعدة البيانات وخدمة التقييد.

GitHub وTelegram وMCP ووضع الوكيل معروضة كميزات غير مفعلة، ولا تعرض المنصة اتصالًا وهميًا بها.

## إعداد قاعدة البيانات

1. أنشئ مشروع Supabase.
2. نفّذ `supabase/schema.sql` كاملًا في SQL Editor.
3. انسخ `.env.example` إلى `.env.local` للتطوير، وأضف القيم نفسها في Vercel دون رفع الأسرار إلى GitHub.

## تهيئة المالك الأول

اضبط مؤقتًا:

```env
BOOTSTRAP_OWNER_EMAIL=mtzallqmy@gmail.com
BOOTSTRAP_OWNER_PASSWORD=كلمة-مؤقتة-قوية
BOOTSTRAP_TOKEN=رمز-عشوائي-طويل-جداً
```

بعد النشر نفّذ:

```bash
curl -X POST https://YOUR_DOMAIN/api/setup/bootstrap \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: YOUR_LONG_TOKEN' \
  -d '{}'
```

بعد نجاح الطلب، احذف `BOOTSTRAP_TOKEN` و`BOOTSTRAP_OWNER_PASSWORD` من Vercel وأعد النشر. سيُطلب من المالك تغيير كلمة المرور عند أول دخول.

إذا كان البريد موجودًا مسبقًا في Supabase Auth، يمكن تشغيل `supabase/execute-bootstrap.sql` لترقيته فقط. لا ينشئ هذا SQL مستخدمًا ولا يغيّر كلمة المرور.

## التشغيل المحلي

```bash
npm ci
cp .env.example .env.local
npx vercel dev
```

`npm run dev` يشغّل واجهة Vite فقط؛ استخدم `vercel dev` لتشغيل الواجهة وVercel Functions معًا محليًا.

## التحقق الكامل

```bash
npm run check
```

ويشمل lint وTypeScript للواجهة والـ API والاختبارات والبناء الإنتاجي.

## متطلبات النشر

- Node.js 20 أو أحدث.
- جميع المتغيرات ذات `VITE_` فقط قابلة للظهور في المتصفح.
- `SUPABASE_SERVICE_ROLE_KEY` و`ENCRYPTION_KEY` وبيانات bootstrap تبقى Server-only.
- استخدم HTTPS لمزودات API في الإنتاج.
- فعّل Email Auth في Supabase واضبط Site URL وRedirect URLs على نطاق Vercel.

## قبل النشر

راجع [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) و[SECURITY.md](./SECURITY.md). لا يحتوي المشروع على كلمة مرور المالك أو مفاتيح حقيقية؛ تُضبط جميعها كمتغيرات خادمية.
