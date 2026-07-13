import { Github, LockKeyhole, Plug, Send } from 'lucide-react'

const integrations = [
  {
    icon: Github,
    name: 'GitHub',
    status: 'غير مفعّل',
    description: 'يتطلب GitHub OAuth App ومسار callback خادمي وتخزين token مشفّر وصلاحيات محدودة للمستودعات.',
  },
  {
    icon: Send,
    name: 'Telegram Bot',
    status: 'غير مفعّل',
    description: 'يتطلب تخزين Bot Token مشفّر، Webhook سري، وربط Chat ID بالمستخدم مع سجل تدقيق.',
  },
  {
    icon: Plug,
    name: 'MCP Servers',
    status: 'غير مفعّل',
    description: 'يتطلب عميل MCP خادمي، allowlist للعناوين والأدوات، مهلات تنفيذ، وموافقة صريحة على الأدوات الحساسة.',
  },
]

export default function Integrations() {
  return <div className="p-6 max-w-5xl mx-auto">
    <h1 className="text-3xl font-semibold tracking-tight mb-2">التكاملات</h1>
    <p className="text-dark-400 mb-8">لا تعرض المنصة اتصالًا ناجحًا ما لم يكن التكامل منفذًا ومختبرًا من الخادم.</p>
    <div className="grid md:grid-cols-3 gap-6">{integrations.map(({ icon: Icon, name, status, description }) => <div key={name} className="card p-7"><div className="flex items-center gap-4 mb-5"><div className="p-3 bg-dark-800 rounded-2xl"><Icon size={25} /></div><div><div className="font-semibold text-xl">{name}</div><div className="text-xs text-amber-400">{status}</div></div></div><p className="text-sm text-dark-400 leading-7">{description}</p></div>)}</div>
    <div className="mt-8 card p-6 border-primary-800/50"><div className="flex gap-3"><LockKeyhole className="text-primary-400 flex-shrink-0" /><div><h2 className="font-semibold">لماذا لا توجد أزرار اتصال شكلية؟</h2><p className="text-sm text-dark-400 mt-1 leading-7">إدخال التوكن في المتصفح أو حفظه محليًا ليس تكاملًا إنتاجيًا. ستُضاف هذه الميزات لاحقًا عبر API خادمي وتشفير وصلاحيات وتدقيق. أما مزودو الذكاء الاصطناعي في صفحة «المزودون» فهم متصلون عبر الخادم فعليًا.</p></div></div></div>
  </div>
}
