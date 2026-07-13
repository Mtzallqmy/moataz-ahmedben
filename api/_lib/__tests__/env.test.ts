import { afterEach, describe, expect, it } from 'vitest'
import { getServerEnv, resetEnvCacheForTests } from '../env'

const snapshot = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, snapshot)
  resetEnvCacheForTests()
})

describe('server environment', () => {
  it('accepts blank optional values and modern publishable keys', () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder-1234567890',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder_1234567890',
      VITE_SUPABASE_ANON_KEY: '',
      BOOTSTRAP_TOKEN: '',
      BOOTSTRAP_OWNER_PASSWORD: '',
      APP_URL: '',
    })
    resetEnvCacheForTests()
    const env = getServerEnv()
    expect(env.supabasePublishableKey).toBe('sb_publishable_placeholder_1234567890')
    expect(env.BOOTSTRAP_TOKEN).toBeUndefined()
    expect(env.APP_URL).toBeUndefined()
  })
})
