import { useAuthStore } from '@/store/authStore'

const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api'

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth-token')
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function handle401(): never {
  useAuthStore.getState().logout()
  window.location.href = '/login'
  throw new Error('Session expired. Please log in again.')
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentSkillMeta {
  slug:      string
  category:  string
  title:     string
  role:      string
  objective: string
}

export interface AgentCategory {
  id:          string
  label:       string
  color:       'blue' | 'teal' | 'violet' | 'amber' | 'green'
  description: string
}

export interface AgentSkillsManifest {
  categories: AgentCategory[]
  skills:     AgentSkillMeta[]
}

export interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchAgentSkills(): Promise<AgentSkillsManifest> {
  const res = await fetch(`${BASE_URL}/agents/skills`, { headers: authHeaders() })
  if (res.status === 401) handle401()
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<AgentSkillsManifest>
}

/**
 * Streams an agent chat response.
 * onChunk is called with each text delta; resolves when stream ends.
 */
export async function streamAgentChat(params: {
  slug:          string
  messages:      ChatMessage[]
  clientContext?: string
  onChunk:       (text: string) => void
  onDone:        () => void
  onError:       (msg: string) => void
}): Promise<void> {
  const { slug, messages, clientContext, onChunk, onDone, onError } = params

  const res = await fetch(`${BASE_URL}/agents/chat`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, messages, clientContext }),
  })

  if (res.status === 401) handle401()
  if (!res.ok) {
    onError(`Server error ${res.status}`)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { onError('No response body'); return }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') { onDone(); return }
      try {
        const json = JSON.parse(data) as { text?: string; error?: string }
        if (json.error) { onError(json.error); return }
        if (json.text) onChunk(json.text)
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  onDone()
}
