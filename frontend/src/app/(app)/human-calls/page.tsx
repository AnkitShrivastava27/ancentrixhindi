'use client'
import { useEffect, useState, useCallback } from 'react'
import { humanCallsApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import { Modal, Select, Textarea, Button, Spinner, EmptyState, StatusBadge } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './human-calls.module.css'

const STATUSES = [
  { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' },
  { value: 'called', label: '📵 Called — No Answer' },
  { value: 'interested', label: 'Interested' }, { value: 'warm', label: 'Warm' },
  { value: 'hot', label: '🔥 Hot' },
  { value: 'cold', label: 'Cold' }, { value: 'closed_won', label: 'Won' },
  { value: 'closed_lost', label: 'Lost' }, { value: 'do_not_call', label: 'Do Not Call' },
]

const AGENT_PHONE_KEY = 'human_call_agent_phone'

function fmt(s: number) {
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
}

export default function HumanCallsPage() {
  const { balance } = useAuthStore()
  const [leads, setLeads]         = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [dialing, setDialing]     = useState<string | null>(null)   // lead_id currently being dialed

  const [agentPhone, setAgentPhone] = useState('')

  // Active bridged call — set once /dial succeeds, cleared once the
  // post-call form is submitted.
  const [activeCall, setActiveCall] = useState<{ callLogId: string; lead: any; startedAt: number } | null>(null)
  const [, forceTick] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [completeStatus, setCompleteStatus] = useState('contacted')
  const [completeSummary, setCompleteSummary] = useState('')
  const [completeNotes, setCompleteNotes]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canCall = !!balance?.can_place_calls

  const load = useCallback(() => {
    setLoading(true)
    humanCallsApi.listLeads()
      .then((res: any) => setLeads(res.leads || []))
      .catch(() => toast.error('Could not load leads'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(AGENT_PHONE_KEY) : null
    if (saved) setAgentPhone(saved)
  }, [])

  // Ticking timer for the active-call banner
  useEffect(() => {
    if (!activeCall) return
    const t = setInterval(() => forceTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [activeCall])

  async function handleDial(lead: any) {
    const cleanPhone = agentPhone.replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      toast.error('Enter your 10-digit phone number above first — Vobiz will ring you, then bridge to the lead.')
      return
    }
    if (!canCall) {
      toast.error('Out of minutes — buy a plan first.')
      return
    }
    localStorage.setItem(AGENT_PHONE_KEY, cleanPhone)
    setDialing(lead.id)
    try {
      const res: any = await humanCallsApi.dial({ lead_id: lead.id, agent_phone: cleanPhone })
      setActiveCall({ callLogId: res.call_log_id, lead, startedAt: Date.now() })
      toast.success(`Calling your phone (${cleanPhone}) — pick up to be bridged to ${lead.name || lead.phone}`)
    } catch (e: any) {
      toast.error(e.message || 'Could not place the call')
    } finally {
      setDialing(null)
    }
  }

  function openCompleteForm() {
    setCompleteStatus('contacted')
    setCompleteSummary('')
    setCompleteNotes('')
    setShowComplete(true)
  }

  async function handleSubmitComplete() {
    if (!activeCall) return
    if (!completeSummary.trim()) { toast.error('Add a short summary of the call'); return }
    setSubmitting(true)
    try {
      await humanCallsApi.complete(activeCall.callLogId, {
        lead_status: completeStatus,
        summary: completeSummary.trim(),
        notes: completeNotes.trim() || undefined,
      })
      toast.success('Call logged')
      setShowComplete(false)
      setActiveCall(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Could not save call log')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Human Call</h1>
        <p className={styles.headSub}>
          Leads assigned to manual (non-AI) batches. Dialing rings your own phone first, then bridges you to the lead.
        </p>
      </div>

      <div className={styles.phonePromptRow}>
        <input
          value={agentPhone}
          onChange={e => setAgentPhone(e.target.value)}
          placeholder="Your phone number (Vobiz rings this first)"
          maxLength={10}
          className={styles.phoneInput}
        />
      </div>

      {activeCall && (
        <div className={styles.callBanner}>
          <div className={styles.callBannerLeft}>
            <span className={styles.callBannerDot} />
            <span className={styles.callBannerText}>
              Bridging call to {activeCall.lead.name || activeCall.lead.phone}
            </span>
            <span className={styles.callBannerTimer}>{fmt(Math.floor((Date.now() - activeCall.startedAt) / 1000))}</span>
          </div>
          <Button variant="primary" size="sm" onClick={openCompleteForm}>End Call &amp; Log</Button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingWrap}><Spinner /></div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon="🧑‍💼"
          title="No leads waiting"
          description="Create a batch with 'Who dials these leads? → Human' to send leads here instead of the AI."
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              {['Name', 'Phone', 'Status', 'Source', 'Batch', 'Attempts', ''].map(h => (
                <th key={h} className={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l, i) => (
              <tr key={l.id} className={i < leads.length - 1 ? styles.tr : styles.trLast}>
                <td className={styles.tdName}>{l.name || '—'}</td>
                <td className={styles.tdPhone}>{l.phone}</td>
                <td><StatusBadge status={l.status} /></td>
                <td className={styles.tdBatch}>{l.source || '—'}</td>
                <td className={styles.tdBatch}>{l.batch_name}</td>
                <td className={styles.tdBatch}>{l.call_attempts || 0}</td>
                <td>
                  {l.dialed ? (
                    <div className={styles.dialedCell}>
                      <span className={styles.tdDialed}>✓ Dialed</span>
                      <button
                        className={styles.recallBtn}
                        disabled={!!activeCall || dialing === l.id || !canCall}
                        onClick={() => handleDial(l)}
                        title="Call this lead again"
                      >
                        {dialing === l.id ? '…' : '↻ Re-call'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.dialBtn}
                      disabled={!!activeCall || dialing === l.id || !canCall}
                      onClick={() => handleDial(l)}
                    >
                      {dialing === l.id ? '…' : '📞 Dial'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={showComplete}
        onClose={() => {}}
        title="Log this call"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowComplete(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmitComplete} loading={submitting}>Save</Button>
          </>
        }
      >
        <div className={styles.formGroup}>
          <Select label="Lead status" options={STATUSES} value={completeStatus} onChange={e => setCompleteStatus(e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <Textarea label="Call summary" placeholder="What happened on the call?" value={completeSummary} onChange={e => setCompleteSummary(e.target.value)} rows={3} />
        </div>
        <div className={styles.formGroup}>
          <Textarea label="Notes (optional)" placeholder="Anything else worth noting" value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} rows={2} />
        </div>
      </Modal>
    </div>
  )
}
