import { Link } from 'react-router-dom'
import { ArrowLeft, Bot, KeyRound, MessageCircle, Shield, Users } from 'lucide-react'
import { motion } from 'framer-motion'

const features = [
  {
    icon: MessageCircle,
    title: 'محادثات API فعلية',
    desc: 'إرسال الطلبات إلى المزود والنموذج المحددين فعليًا، مع بث ردود المزودات المتوافقة مع OpenAI ودعم Markdown والكود.',
  },
  {
    icon: Bot,
    title: 'اكتشاف وتشخيص المزودات',
    desc: 'اكتشاف النماذج المتاحة واختبار توليد حقيقي، مع تشخيص أخطاء المفتاح والصلاحية والرصيد والمعدل والنموذج والبوابة.',
  },
  {
    icon: Users,
    title: 'إدارة مستخدمين متكاملة',
    desc: 'حسابات بالبريد أو اسم المستخدم، أدوار مالك ومدير ومشرف ومستخدم، وكلمات مرور مؤقتة تُعرض مرة واحدة.',
  },
  {
    icon: Shield,
    title: 'حماية من جهة الخادم',
    desc: 'تشفير مفاتيح API، عزل البيانات بسياسات RLS، تقييد الطلبات، ومنع عناوين المزودات الداخلية وغير الآمنة.',
  },
]

const providers = ['Google Gemini', 'OpenAI', 'Anthropic', 'NVIDIA NIM', 'Groq', 'DeepSeek', 'Mistral', 'Together AI']

const facts = [
  { number: '8', label: 'مزودات معروفة مسبقًا' },
  { number: '4', label: 'مستويات صلاحيات' },
  { number: '0', label: 'بوابات دفع حاليًا' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-dark-950 text-white overflow-hidden">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center"><span className="font-bold text-xl tracking-[-2px]">م</span></div>
            <div className="font-semibold text-xl tracking-tight">معتز العلقمي</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/privacy" className="text-white/70 hover:text-white transition-colors hidden sm:block">الخصوصية</Link>
            <Link to="/terms" className="text-white/70 hover:text-white transition-colors hidden sm:block">الشروط</Link>
            <Link to="/login" className="px-5 py-2 rounded-full border border-white/20 hover:bg-white/5 transition-all text-sm font-medium">تسجيل الدخول</Link>
            <Link to="/register" className="btn btn-primary px-6 py-2 text-sm">إنشاء حساب</Link>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-16 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] mb-6">نسخة تشغيل أولية دون نظام دفع</div>
          <h1 className="text-6xl md:text-7xl font-semibold tracking-tighter leading-[1.05] mb-6">محادثات الذكاء الاصطناعي.<br />بإدارة حقيقية.</h1>
          <p className="max-w-2xl mx-auto text-xl text-white/70 mb-10">منصة عربية لإدارة المستخدمين وربط مفاتيح مزودي الذكاء الاصطناعي واختبارها واستخدامها عبر الخادم دون ادعاء تكاملات غير منفذة.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login" className="btn btn-primary px-10 py-4 text-base group">الدخول إلى المنصة <ArrowLeft className="group-hover:-translate-x-0.5 transition" size={18} /></Link>
            <Link to="/register" className="btn btn-secondary px-8 py-4 text-base border-white/20">إنشاء حساب إن كان التسجيل مفعّلًا</Link>
          </div>
          <div className="mt-8 text-xs text-white/50">لا توجد مدفوعات داخلية في هذه المرحلة • يمكن للمالك إنشاء الحسابات من لوحة الإدارة</div>
        </div>
      </div>

      <div className="border-y border-white/10 py-8">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {facts.map((fact) => <div key={fact.label}><div className="text-4xl font-semibold tracking-tighter text-primary-400">{fact.number}</div><div className="text-white/60 mt-1 text-sm">{fact.label}</div></div>)}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14"><div className="text-primary-400 text-sm tracking-[3px] mb-3">الوظائف المنفذة</div><h2 className="text-4xl font-semibold tracking-tight">ميزات تعمل من الخادم وقاعدة البيانات</h2></div>
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature) => { const Icon = feature.icon; return <motion.div key={feature.title} whileHover={{ y: -4 }} className="card p-8 border-white/10 bg-dark-900/50"><div className="w-12 h-12 rounded-2xl bg-primary-950 flex items-center justify-center mb-6"><Icon className="text-primary-400" size={24} /></div><h3 className="text-2xl font-semibold tracking-tight mb-3">{feature.title}</h3><p className="text-white/70 leading-relaxed">{feature.desc}</p></motion.div> })}
        </div>
      </div>

      <div className="bg-dark-900 border-y border-white/10 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center"><div className="text-sm text-primary-400 tracking-widest mb-4">مزودات معروفة وإمكانية OpenAI-compatible مخصصة</div><h3 className="text-3xl font-semibold tracking-tight mb-10">يُعتمد الاتصال فقط بعد اختبار API فعلي</h3><div className="flex flex-wrap justify-center gap-3">{providers.map((provider) => <div key={provider} className="px-5 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium">{provider}</div>)}</div></div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12"><h2 className="text-4xl font-semibold tracking-tight">كيف تبدأ؟</h2><p className="text-white/60 mt-3">ثلاث خطوات واضحة دون بيانات تجريبية وهمية</p></div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Users, step: '01', title: 'فعّل حساب المالك', desc: 'استخدم مسار bootstrap الآمن مرة واحدة أو رقِّ مستخدمًا موجودًا عبر SQL المرفق.' },
            { icon: KeyRound, step: '02', title: 'أضف مفتاح المزود', desc: 'يُرسل المفتاح إلى الخادم ويُحفظ مشفّرًا، ثم تُختبر البوابة والنماذج فعليًا.' },
            { icon: MessageCircle, step: '03', title: 'ابدأ المحادثة', desc: 'اختر المزود والنموذج، وستأتي الإجابة من API الحقيقي للمزود المحدد.' },
          ].map((item) => { const Icon = item.icon; return <div key={item.step} className="relative pl-8 border-l border-white/10"><div className="text-6xl font-bold text-white/10 tracking-[-4px] absolute -top-3 right-0">{item.step}</div><Icon className="text-primary-400 mb-4" size={24} /><div className="font-semibold text-xl mb-2">{item.title}</div><p className="text-white/70">{item.desc}</p></div> })}
        </div>
      </div>

      <div className="border-t border-white/10 py-16 bg-dark-900"><div className="max-w-xl mx-auto text-center px-6"><h2 className="text-4xl font-semibold tracking-tight mb-4">ابدأ بالتشغيل والإعداد</h2><p className="text-white/70 mb-8">تسجيل المستخدمين العام متوقف افتراضيًا، ويمكن للمالك إدارته أو إنشاء الحسابات من لوحة التحكم.</p><Link to="/login" className="btn btn-primary px-10 py-4 text-base inline-flex">تسجيل الدخول</Link></div></div>

      <footer className="border-t border-white/10 py-10 text-center text-xs text-white/50">© {new Date().getFullYear()} معتز العلقمي. جميع الحقوق محفوظة. • <Link to="/privacy" className="hover:text-white/80 mx-1.5">سياسة الخصوصية</Link> • <Link to="/terms" className="hover:text-white/80 mx-1.5">شروط الاستخدام</Link></footer>
    </div>
  )
}
