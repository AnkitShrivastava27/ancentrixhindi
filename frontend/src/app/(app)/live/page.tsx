'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../../store'
import styles from './live.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type MsgRole = 'user' | 'ai'

interface ChatMsg {
  role: MsgRole
  text: string
  ts:   string
}

type CallStatus = 'ringing' | 'in_progress' | 'ended' | 'no_answer'

interface CallSession {
  call_uuid:   string
  phone:       string
  mode:        string
  lead_name?:  string
  started_at:  string
  answered_at?: string
  ended_at?:   string
  duration?:   number
  no_answer_reason?: string
  status:      CallStatus
  messages:    ChatMsg[]
}

type WsEvent =
  | { type: 'call_ringing';  call_uuid: string; phone: string; mode: string; lead_name?: string; started_at: string }
  | { type: 'call_start';    call_uuid: string; phone: string; mode: string; started_at: string }       // back-compat alias of call_ringing
  | { type: 'call_answered'; call_uuid: string; answered_at: string }
  | { type: 'user_msg';      call_uuid: string; text: string; ts: string }
  | { type: 'ai_msg';        call_uuid: string; text: string; ts: string }
  | { type: 'call_end';      call_uuid: string; duration_sec: number; ended_at: string }
  | { type: 'call_no_answer'; call_uuid: string; reason: string; ended_at: string }
  | { type: 'ping' }

const MAX_TABS = 8

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt_time(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return iso }
}

function fmt_phone(p: string) {
  // +919140971036 → +91 91409 71036
  if (p.startsWith('+91') && p.length === 13)
    return `+91 ${p.slice(3, 8)} ${p.slice(8)}`
  return p
}

function fmt_duration(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function statusBadge(status: CallStatus) {
  switch (status) {
    case 'ringing':     return { label: 'RINGING',    color: '#f5a623', bg: 'rgba(245,166,35,0.12)' }
    case 'in_progress': return { label: 'LIVE',       color: '#3ecf8e', bg: 'rgba(62,207,142,0.1)' }
    case 'no_answer':   return { label: 'NO ANSWER',  color: '#8a8d9e', bg: 'rgba(255,255,255,0.04)' }
    default:            return { label: 'ENDED',      color: '#4a4d5e', bg: 'rgba(255,255,255,0.04)' }
  }
}

function reasonLabel(reason?: string) {
  if (!reason) return 'Not answered'
  if (reason === 'busy') return 'Line busy'
  if (reason === 'failed') return 'Call failed to connect'
  return 'Rang, no pickup'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LivePage() {
  const { user, company } = useAuthStore()
  const companyId = (company as any)?.id as string | undefined

  const [sessions, setSessions]       = useState<CallSession[]>([])
  const [activeTab, setActiveTab]     = useState<string | null>(null)
  const [wsStatus, setWsStatus]       = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const wsRef    = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom of chat when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessions, activeTab])

  // WebSocket connection
  useEffect(() => {
    if (!companyId) return

    const BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace('/api/v1', '')
    const wsBase = BASE
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')

    const url = `${wsBase}/api/v1/live/ws?company_id=${companyId}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen  = () => setWsStatus('connected')
    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)
      if (event.type === 'ping') return

      setSessions(prev => {
        let next = [...prev]

        if (event.type === 'call_ringing' || event.type === 'call_start') {
          const newSession: CallSession = {
            call_uuid:  event.call_uuid,
            phone:      event.phone,
            mode:       event.mode,
            lead_name:  (event as any).lead_name || '',
            started_at: event.started_at,
            status:     'ringing',
            messages:   [],
          }
          // Prepend; keep MAX_TABS
          next = [newSession, ...next].slice(0, MAX_TABS)
          // Auto-switch to newest call
          setActiveTab(event.call_uuid)
          return next
        }

        const idx = next.findIndex(s => s.call_uuid === event.call_uuid)
        if (idx === -1) return prev

        if (event.type === 'call_answered') {
          next[idx] = { ...next[idx], status: 'in_progress', answered_at: event.answered_at }
        } else if (event.type === 'user_msg') {
          next[idx] = {
            ...next[idx],
            messages: [...next[idx].messages, { role: 'user', text: event.text, ts: event.ts }]
          }
        } else if (event.type === 'ai_msg') {
          next[idx] = {
            ...next[idx],
            messages: [...next[idx].messages, { role: 'ai', text: event.text, ts: event.ts }]
          }
        } else if (event.type === 'call_end') {
          next[idx] = {
            ...next[idx],
            status:   'ended',
            ended_at: event.ended_at,
            duration: event.duration_sec,
          }
        } else if (event.type === 'call_no_answer') {
          next[idx] = {
            ...next[idx],
            status: 'no_answer',
            ended_at: event.ended_at,
            no_answer_reason: event.reason,
          }
        }
        return next
      })
    }

    return () => { ws.close() }
  }, [companyId])

  // Reconnect
  function reconnect() {
    wsRef.current?.close()
    setWsStatus('connecting')
    setSessions([])
    setActiveTab(null)
    // Remount effect by toggling companyId — simplest is to just reload
    window.location.reload()
  }

  const activeSession = sessions.find(s => s.call_uuid === activeTab) ?? null
  const liveCount     = sessions.filter(s => s.status === 'in_progress').length
  const ringingCount  = sessions.filter(s => s.status === 'ringing').length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.statusDot} style={{ background: wsStatus === 'connected' ? '#3ecf8e' : wsStatus === 'connecting' ? '#f5a623' : '#f25757', boxShadow: wsStatus === 'connected' ? '0 0 6px #3ecf8e' : 'none' }} />
          <span className={styles.headerTitle}>Live Call Tracking</span>
          <span className={styles.headerStatusText}>
            {wsStatus === 'connected' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
        </div>
        <div className={styles.headerRight}>
          {ringingCount > 0 && (
            <div className={styles.pillRinging}>
              {ringingCount} Ringing
            </div>
          )}
          {liveCount > 0 && (
            <div className={styles.pillActive}>
              {liveCount} Active
            </div>
          )}
          {wsStatus === 'disconnected' && (
            <button onClick={reconnect} className={styles.reconnectBtn}>
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* No sessions state */}
      {sessions.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📞</div>
          <div className={styles.emptyTitle}>Waiting for calls…</div>
          <div className={styles.emptyDesc}>Calls will show up here the moment they start dialing — ringing, then live conversation.</div>
        </div>
      )}

      {/* Main layout — tabs + chat */}
      {sessions.length > 0 && (
        <div className={styles.mainLayout}>

          {/* Left sidebar — call tabs */}
          <div className={styles.tabsCol}>
            <div className={styles.tabsHead}>
              Calls (last {MAX_TABS})
            </div>
            {sessions.map(s => {
              const isActive = s.call_uuid === activeTab
              const badge    = statusBadge(s.status)
              return (
                <div
                  key={s.call_uuid}
                  onClick={() => setActiveTab(s.call_uuid)}
                  className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
                >
                  <div className={styles.tabTop}>
                    <span className={`${styles.tabPhone} ${isActive ? styles.tabPhoneActive : ''}`}>
                      {fmt_phone(s.phone)}
                    </span>
                    <span className={styles.tabBadge} style={{ color: badge.color, background: badge.bg }}>
                      {badge.label}
                    </span>
                  </div>
                  {s.lead_name && (
                    <div className={styles.tabLead}>{s.lead_name}</div>
                  )}
                  <div className={styles.tabMeta}>
                    {s.mode.toUpperCase()} · {fmt_time(s.started_at)}
                  </div>
                  <div className={styles.tabSub}>
                    {s.status === 'no_answer'
                      ? reasonLabel(s.no_answer_reason)
                      : `${s.messages.length} messages${s.duration != null ? ` · ${fmt_duration(s.duration)}` : ''}`}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right — chat panel */}
          <div className={styles.chatCol}>

            {/* Call info bar */}
            {activeSession && (
              <div className={styles.infoBar}>
                <div className={styles.infoAvatar} style={{ background: activeSession.status === 'in_progress' ? 'rgba(62,207,142,0.15)' : activeSession.status === 'ringing' ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.05)' }}>
                  {activeSession.status === 'in_progress' ? '📞' : activeSession.status === 'ringing' ? '📳' : activeSession.status === 'no_answer' ? '📵' : '☎️'}
                </div>
                <div>
                  <div className={styles.infoName}>
                    {fmt_phone(activeSession.phone)}{activeSession.lead_name ? ` — ${activeSession.lead_name}` : ''}
                  </div>
                  <div className={styles.infoMeta}>
                    {activeSession.mode.toUpperCase()} · Started {fmt_time(activeSession.started_at)}
                    {activeSession.status === 'ended' && activeSession.duration != null
                      ? ` · Ended after ${fmt_duration(activeSession.duration)}`
                      : ''}
                    {activeSession.status === 'no_answer'
                      ? ` · ${reasonLabel(activeSession.no_answer_reason)}`
                      : ''}
                  </div>
                </div>
                <div className={styles.infoStatusWrap}>
                  {activeSession.status === 'ringing' && (
                    <>
                      <div className={`${styles.livePulse} ${styles.livePulseRinging}`} />
                      <span className={styles.liveLabelRinging}>Ringing…</span>
                    </>
                  )}
                  {activeSession.status === 'in_progress' && (
                    <>
                      <div className={`${styles.livePulse} ${styles.livePulseActive}`} />
                      <span className={styles.liveLabelActive}>In Progress</span>
                    </>
                  )}
                  {activeSession.status === 'no_answer' && (
                    <span className={styles.liveLabelNoAnswer}>No Answer</span>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className={styles.messages}>
              {!activeSession && (
                <div className={styles.centerNote}>
                  Select a call from the left to view conversation
                </div>
              )}

              {activeSession?.status === 'ringing' && (
                <div className={styles.centerNoteCol}>
                  <div className={styles.centerNoteIcon}>📳</div>
                  <div className={styles.centerNoteText}>Phone is ringing — waiting for pickup…</div>
                </div>
              )}

              {activeSession?.status === 'no_answer' && (
                <div className={styles.centerNoteCol}>
                  <div className={styles.centerNoteIcon}>📵</div>
                  <div className={styles.centerNoteText}>{reasonLabel(activeSession.no_answer_reason)} — lead moved to "Called" status</div>
                </div>
              )}

              {activeSession && activeSession.status !== 'ringing' && activeSession.status !== 'no_answer' && activeSession.messages.length === 0 && (
                <div className={styles.waitingText}>
                  Waiting for conversation to begin…
                </div>
              )}

              {activeSession?.messages.map((msg, i) => {
                const isAI = msg.role === 'ai'
                return (
                  <div key={i} className={`${styles.msgRow} ${isAI ? styles.msgRowAi : styles.msgRowUser}`}>
                    {/* Avatar */}
                    <div className={`${styles.msgAvatar} ${isAI ? styles.msgAvatarAi : styles.msgAvatarUser}`}>
                      {isAI ? '🤖' : '👤'}
                    </div>
                    {/* Bubble */}
                    <div className={styles.msgBubbleWrap}>
                      <div className={`${styles.msgMeta} ${isAI ? styles.msgMetaLeft : styles.msgMetaRight}`}>
                        {isAI ? 'AI Agent' : 'Caller'} · {fmt_time(msg.ts)}
                      </div>
                      <div className={`${styles.msgBubble} ${isAI ? styles.msgBubbleAi : styles.msgBubbleUser}`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Live typing indicator */}
              {activeSession?.status === 'in_progress' && (
                <div className={styles.typingRow}>
                  <div className={styles.typingAvatar}>🤖</div>
                  <div className={styles.typingBubble}>
                    {[0, 1, 2].map(d => (
                      <div key={d} className={styles.typingDot} style={{ animationDelay: `${d * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
