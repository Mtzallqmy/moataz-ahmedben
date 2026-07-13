import { z } from 'zod'

const emptyToUndefined = (value: unknown) => typeof value === 'string' && value.trim() === '' ? undefined : value
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional())
const optionalKey = z.preprocess(emptyToUndefined, z.string().min(20).optional())
const optionalPassword = z.preprocess(emptyToUndefined, z.string().min(8).optional())
const optionalToken = z.preprocess(emptyToUndefined, z.string().min(24).optional())

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}, z.boolean())

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_URL: optionalUrl,
  VITE_SUPABASE_URL: optionalUrl,
  SUPABASE_PUBLISHABLE_KEY: optionalKey,
  SUPABASE_ANON_KEY: optionalKey,
  VITE_SUPABASE_PUBLISHABLE_KEY: optionalKey,
  VITE_SUPABASE_ANON_KEY: optionalKey,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ENCRYPTION_KEY: z.string().min(32),
  ALLOW_PUBLIC_SIGNUP: booleanFromEnv.default(false),
  ALLOW_INSECURE_PROVIDER_URLS: booleanFromEnv.default(false),
  BOOTSTRAP_OWNER_EMAIL: z.string().email().default('mtzallqmy@gmail.com'),
  BOOTSTRAP_OWNER_PASSWORD: optionalPassword,
  BOOTSTRAP_TOKEN: optionalToken,
  USERNAME_EMAIL_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i).default('users.moataz.invalid'),
  APP_URL: optionalUrl,
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
})

export type ServerEnv = z.infer<typeof rawSchema> & {
  supabaseUrl: string
  supabasePublishableKey: string
}

let cached: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  if (cached) return cached

  const parsed = rawSchema.safeParse(process.env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ')
    throw new Error(`متغيرات الخادم غير مكتملة أو غير صالحة: ${fields}`)
  }

  const supabaseUrl = parsed.data.SUPABASE_URL || parsed.data.VITE_SUPABASE_URL
  const supabasePublishableKey = parsed.data.SUPABASE_PUBLISHABLE_KEY
    || parsed.data.SUPABASE_ANON_KEY
    || parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY
    || parsed.data.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('إعدادات Supabase الخلفية غير مكتملة: SUPABASE_URL وSUPABASE_PUBLISHABLE_KEY مطلوبان')
  }

  cached = { ...parsed.data, supabaseUrl, supabasePublishableKey }
  return cached
}

export function resetEnvCacheForTests() {
  cached = undefined
}
