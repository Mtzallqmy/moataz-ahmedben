import { describe, expect, it } from 'vitest'
import { inferProtocol, isPrivateIpAddress, providerBaseUrl, sanitizeProviderEndpoint } from '../provider-runtime'

describe('provider runtime', () => {
  it('detects native protocols', () => {
    expect(inferProtocol('gemini', null)).toBe('gemini')
    expect(inferProtocol('custom', 'https://api.anthropic.com/v1')).toBe('anthropic')
    expect(inferProtocol('openrouter', null)).toBe('openai-compatible')
  })

  it('normalizes known base URLs', () => {
    expect(providerBaseUrl({ type: 'openai', base_url: null })).toBe('https://api.openai.com/v1')
    expect(providerBaseUrl({ type: 'custom', base_url: 'https://example.com/v1/' })).toBe('https://example.com/v1')
  })

  it('removes credentials and query secrets from reported endpoints', () => {
    expect(sanitizeProviderEndpoint('https://user:pass@example.com/v1/models?key=secret#part')).toBe('https://example.com/v1/models')
  })

  it('blocks private address families', () => {
    expect(isPrivateIpAddress('127.0.0.1')).toBe(true)
    expect(isPrivateIpAddress('10.1.2.3')).toBe(true)
    expect(isPrivateIpAddress('172.20.1.1')).toBe(true)
    expect(isPrivateIpAddress('192.168.1.1')).toBe(true)
    expect(isPrivateIpAddress('8.8.8.8')).toBe(false)
  })
})
