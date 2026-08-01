// src/store/liveCallStore.ts
//
// Live Call Tracking's WebSocket used to live inside live/page.tsx's own
// useEffect. That meant every navigation away from the Live tab (to
// Batches, Schedules, Settings, anywhere) unmounted the component, closed
// the socket, and threw away `sessions` entirely — coming back to Live
// mid-call showed an empty state and any conversation that happened while
// you were away was gone for good, with no way to recover it (no
// fetch-on-mount fallback, purely event-driven).
//
// Fix: the connection + session state now live here, in a store connected
// once from (app)/layout.tsx — which stays mounted for the whole app
// session, not per-page. Navigating between tabs no longer touches the
// socket or clears anything; live/page.tsx just reads from this store.
import { create } from 'zustand'

export type MsgRole = 'user' | 'ai'

export interface ChatMsg {
  role: MsgRole
  text: string
  ts:   string
}

export type CallStatus = 'ringing' | 'in_progress' | 'ended' | 'no_answer'

export interface CallSession {
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
  | { type: 'call_start';    call_uuid: string; phone: string; mode: string; started_at: string }
  | { type: 'call_answered'; call_uuid: string; answered_at: string }
  | { type: 'user_msg';      call_uuid: string; text: string; ts: string }
  | { type: 'ai_msg';        call_uuid: string; text: string; ts: string }
  | { type: 'call_end';      call_uuid: string; duration_sec: number; ended_at: string }
  | { type: 'call_no_answer'; call_uuid: string; reason: string; ended_at: string }
  | { type: 'ping' }

const MAX_TABS = 8

interface LiveCallState {
  sessions:      CallSession[]
  wsStatus:      'connecting' | 'connected' | 'disconnected' | 'idle'
  _ws:           WebSocket | null
  _companyId:    string | null
  _reconnectTimer: ReturnType<typeof setTimeout> | null
  _reconnectAttempts: number

  connect:    (companyId: string) => void
  disconnect: () => void
}

const MAX_RECONNECT_DELAY_MS = 15000

export const useLiveCallStore = create<LiveCallState>((set, get) => ({
  sessions:   [],
  wsStatus:   'idle',
  _ws:        null,
  _companyId: null,
  _reconnectTimer: null,
  _reconnectAttempts: 0,

  connect: (companyId: string) => {
    const state = get()
    // Already connected/connecting to this exact company — no-op. This is
    // what makes it safe to call connect() from every page that mounts,
    // instead of only once at the top layout.
    if (state._companyId === companyId && state._ws &&
        (state._ws.readyState === WebSocket.OPEN || state._ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    // Switching company (e.g. different account) — tear down the old one.
    if (state._ws) state._ws.close()
    if (state._reconnectTimer) clearTimeout(state._reconnectTimer)

    const BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace('/api/v1', '')
    const wsBase = BASE.replace('https://', 'wss://').replace('http://', 'ws://')
    const url = `${wsBase}/api/v1/live/ws?company_id=${companyId}`

    set({ wsStatus: 'connecting', _companyId: companyId })

    const ws = new WebSocket(url)

    ws.onopen = () => {
      set({ wsStatus: 'connected', _reconnectAttempts: 0 })
    }

    ws.onclose = () => {
      set({ wsStatus: 'disconnected' })
      // Auto-reconnect with backoff — covers real network blips
      // (mobile data drop, brief Azure connection reset, etc.) without
      // requiring the user to notice and click a manual "Reconnect"
      // button. Only reconnects if we're still meant to be connected to
      // this company (disconnect() clears _companyId to cancel this).
      const cur = get()
      if (!cur._companyId) return
      const attempt = cur._reconnectAttempts + 1
      const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS)
      const timer = setTimeout(() => {
        const latest = get()
        if (latest._companyId) latest.connect(latest._companyId)
      }, delay)
      set({ _reconnectAttempts: attempt, _reconnectTimer: timer })
    }

    ws.onerror = () => {
      set({ wsStatus: 'disconnected' })
    }

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)
      if (event.type === 'ping') return

      set(s => {
        let next = [...s.sessions]

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
          next = [newSession, ...next].slice(0, MAX_TABS)
          return { sessions: next }
        }

        const idx = next.findIndex(x => x.call_uuid === event.call_uuid)
        if (idx === -1) return { sessions: next }

        if (event.type === 'call_answered') {
          next[idx] = { ...next[idx], status: 'in_progress', answered_at: event.answered_at }
        } else if (event.type === 'user_msg') {
          next[idx] = { ...next[idx], messages: [...next[idx].messages, { role: 'user', text: event.text, ts: event.ts }] }
        } else if (event.type === 'ai_msg') {
          next[idx] = { ...next[idx], messages: [...next[idx].messages, { role: 'ai', text: event.text, ts: event.ts }] }
        } else if (event.type === 'call_end') {
          next[idx] = { ...next[idx], status: 'ended', ended_at: event.ended_at, duration: event.duration_sec }
        } else if (event.type === 'call_no_answer') {
          next[idx] = { ...next[idx], status: 'no_answer', ended_at: event.ended_at, no_answer_reason: event.reason }
        }
        return { sessions: next }
      })
    }

    set({ _ws: ws })
  },

  disconnect: () => {
    const state = get()
    if (state._reconnectTimer) clearTimeout(state._reconnectTimer)
    state._ws?.close()
    set({ _ws: null, _companyId: null, wsStatus: 'idle', _reconnectTimer: null })
  },
}))
