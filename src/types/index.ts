export type AppRole = 'owner' | 'admin' | 'supervisor' | 'user'

export interface User {
  id: string
  name: string
  username?: string | null
  email: string
  loginEmail?: string
  avatar?: string
  role: AppRole
  roles?: AppRole[]
  isActive: boolean
  forcePasswordChange?: boolean
  createdAt: string
}

export type ProviderType = 'gemini' | 'openai' | 'openai-compatible' | 'openrouter' | 'anthropic' | 'nvidia' | 'groq' | 'deepseek' | 'mistral' | 'together' | 'dahl' | 'custom'

export interface ProviderDiagnostic {
  success: boolean
  message: string
  providerMessage?: string
  category?: 'authentication' | 'authorization' | 'rate_limit' | 'quota' | 'model' | 'endpoint' | 'validation' | 'network' | 'timeout' | 'upstream' | 'unknown'
  code?: string
  httpStatus?: number
  endpoint?: string
  requestId?: string
  hint?: string
  detectedProtocol: 'gemini' | 'anthropic' | 'openai-compatible'
  models: string[]
  latencyMs: number
  testedModel?: string
  warning?: string
}

export interface Provider {
  id: string
  name: string
  type: ProviderType
  baseUrl?: string
  model?: string
  isEnabled: boolean
  lastTested?: string
  status: 'connected' | 'error' | 'untested'
  errorMessage?: string
  models?: string[]
  detectedProtocol?: string
  diagnostic?: ProviderDiagnostic
  lastLatencyMs?: number
  lastHttpStatus?: number
}

export interface AdminUser {
  id: string
  username?: string | null
  name: string
  email: string
  loginEmail?: string
  role: AppRole
  isActive: boolean
  mustChangePassword: boolean
  isInternalEmail: boolean
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Chat {
  id: string
  title: string
  providerId: string
  model: string
  mode: 'chat' | 'agent'
  createdAt: string
  updatedAt: string
  messageCount: number
  projectId?: string
}

export interface Message {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
  model?: string
  tokens?: number
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  status: 'pending' | 'success' | 'error'
}

export interface AgentStep {
  id: string
  step: number
  title: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'error'
  toolName?: string
  result?: string
  duration?: number
}

export interface Integration {
  id: string
  type: 'github' | 'telegram' | 'mcp'
  name: string
  connected: boolean
  config: Record<string, unknown>
  lastSync?: string
  status: string
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  chatCount: number
}
