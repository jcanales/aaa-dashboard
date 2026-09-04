import React, { useEffect, useRef, useState } from 'react'
import { Bot, ChevronRight, Send, X } from 'lucide-react'
import { fetchAgentSkills, streamAgentChat, type AgentSkillMeta, type AgentSkillsManifest, type ChatMessage } from '@/api/agentsApi'
import { useClientStore } from '@/store/clientStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sk } from '@/components/ui/Skeleton'

const CATEGORY_COLORS: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700 border-blue-200',
  teal:   'bg-teal-100 text-teal-700 border-teal-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  amber:  'bg-amber-100 text-amber-700 border-amber-200',
  green:  'bg-green-100 text-green-700 border-green-200',
}

function MarkdownText({ text }: { text: string }) {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\n)/)
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4)
          return <strong key={idx}>{seg.slice(2, -2)}</strong>
        if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2)
          return <em key={idx}>{seg.slice(1, -1)}</em>
        if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2)
          return <code key={idx} className="bg-slate-100 px-1 rounded text-[10px] font-mono">{seg.slice(1, -1)}</code>
        if (seg === '\n') return <br key={idx} />
        return <React.Fragment key={idx}>{seg}</React.Fragment>
      })}
    </>
  )
}

export function AgentsPage() {
  const { selectedClient } = useClientStore()
  const [manifest, setManifest] = useState<AgentSkillsManifest | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<AgentSkillMeta | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAgentSkills()
      .then(setManifest)
      .catch(() => setError('Could not load agent skills. Make sure the backend is running.'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openSkill = (skill: AgentSkillMeta) => {
    setSelectedSkill(skill)
    setMessages([])
    setError('')
  }

  const closeChat = () => {
    setSelectedSkill(null)
    setMessages([])
    setInput('')
    setError('')
  }

  const sendMessage = async () => {
    if (!input.trim() || streaming || !selectedSkill) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setError('')

    let assistantContent = ''
    const placeholder: ChatMessage = { role: 'assistant', content: '' }
    setMessages([...newMessages, placeholder])

    await streamAgentChat({
      slug: selectedSkill.slug,
      messages: newMessages,
      clientContext: selectedClient
        ? `Client: ${selectedClient.name} (coKey: ${selectedClient.coKey})`
        : undefined,
      onChunk: (text) => {
        assistantContent += text
        setMessages([...newMessages, { role: 'assistant', content: assistantContent }])
      },
      onDone: () => {
        setStreaming(false)
      },
      onError: (msg) => {
        setError(msg)
        setMessages(newMessages)
        setStreaming(false)
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const categoryMap = Object.fromEntries(manifest?.categories.map((c) => [c.id, c]) ?? [])

  if (error && !manifest) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-9rem)]">
      {/* Left: skill browser */}
      <div className={`flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col
        ${selectedSkill ? 'w-72' : 'flex-1'}`}>
        <div className="px-4 py-3 border-b border-slate-100">
          <h1 className="text-sm font-semibold text-slate-700">AI Agents</h1>
          <p className="text-[10px] text-slate-400 mt-0.5">Select an agent to start a conversation</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!manifest && (
            <div className="divide-y divide-slate-50">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <Sk className="h-3 w-2/3" />
                    <Sk className="h-2.5 w-4/5" />
                  </div>
                  <Sk className="h-4 w-10 rounded" />
                </div>
              ))}
            </div>
          )}
          {manifest?.categories.map((cat) => {
            const catSkills = manifest.skills.filter((s) => s.category === cat.id)
            if (catSkills.length === 0) return null
            return (
              <div key={cat.id}>
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{cat.label}</p>
                  {!selectedSkill && <p className="text-[10px] text-slate-400">{cat.description}</p>}
                </div>
                {catSkills.map((skill) => (
                  <button
                    key={skill.slug}
                    onClick={() => openSkill(skill)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 transition-colors
                      ${selectedSkill?.slug === skill.slug ? 'bg-blue-50 border-l-2 border-brand-500' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{skill.title}</p>
                        {!selectedSkill && (
                          <p className="text-[10px] text-slate-400 truncate">{skill.objective}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium
                          ${CATEGORY_COLORS[cat.color] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {skill.role}
                        </span>
                        <ChevronRight className="h-3 w-3 text-slate-300" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: chat panel */}
      {selectedSkill && (
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-teal-600" />
                <p className="text-sm font-semibold text-slate-700">{selectedSkill.title}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium
                  ${CATEGORY_COLORS[categoryMap[selectedSkill.category]?.color ?? 'teal'] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {selectedSkill.role}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{selectedSkill.objective}</p>
            </div>
            <button onClick={closeChat} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400 font-medium">{selectedSkill.title}</p>
                <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">{selectedSkill.objective}</p>
                {selectedClient && (
                  <p className="text-[10px] text-teal-500 mt-2">
                    Context: {selectedClient.name}
                  </p>
                )}
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-teal-700 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                    }`}
                >
                  {msg.role === 'assistant' ? <MarkdownText text={msg.content} /> : msg.content}
                  {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1 h-3 bg-slate-400 rounded ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            ))}
            {error && (
              <div className="text-center text-xs text-red-500 py-1">{error}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${selectedSkill.title}…`}
              className="flex-1 text-xs"
              disabled={streaming}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              size="sm"
              style={{ backgroundColor: '#073b49' }}
              className="flex-shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
