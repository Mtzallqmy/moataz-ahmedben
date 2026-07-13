import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, normalizeUsername, validateUsername } from '../users'

describe('managed users', () => {
  it('generates one-time passwords with requested length', () => {
    const password = generateTemporaryPassword(20)
    expect(password).toHaveLength(20)
    expect(password).not.toMatch(/\s/)
  })

  it('normalizes and validates usernames', () => {
    expect(normalizeUsername('  Moataz.Admin ')).toBe('moataz.admin')
    expect(() => validateUsername('moataz_admin')).not.toThrow()
    expect(() => validateUsername('ab')).toThrow()
    expect(() => validateUsername('اسم')).toThrow()
  })
})
