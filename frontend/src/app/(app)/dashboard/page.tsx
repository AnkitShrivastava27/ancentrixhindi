'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { callsApi, leadsApi, batchesApi, schedulesApi } from '@/lib/api'
import { StatCard } from '@/components/ui'
import { useAuthStore } from '@/store'
import { useLiveCallStore, CallSession } from '@/store/liveCallStore'
import styles from './dashboard.module.css'

const PIPELINE = [
  { key: 'hot',         label: 'Hot 🔥',   color: '#f25757' },
  { key: 'interested',  label: 'Interested', color: '#ff9f6b' },
  { key: 'warm',       label: 'Warm',      color: '#f5a623' },
  { key: 'new',        label: 'New',       color: '#a594ff' },
  { key: 'contacted',  label: 'Contacted', color: '#4da6ff' },
  { key: 'called',     label: 'Called — No Answer', color: '#8a8d9e' },
  { key: 'cold',       label: 'Cold',      color: '#5a5d70' },
  { key: 'closed_won', label: 'Won ✓',     color: '#3ecf8e' },
]

const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

function Row({ label, value, color }: { label: string; value: string|number; color?: string }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statRowLabel}>{label}</span>
      <span className={styles.statRowValue} style={{ color: color || '#c8cad8' }}>{value}</span>
    </div>
  )
}

function SCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.sCard}>
      <div className={styles.sCardHead}>
        <span className={styles.sCardHeadText}>
          {title}
        </span>
      </div>

      <div className={styles.sCardBody}>
        {children}
      </div>
    </div>
  )
}

// ── Minutes-remaining card (small) — replaces the old license card ─────────
function MinutesCard({ balance }: { balance: any }) {
  if (!balance) return null
  const hasPlan = balance.plan_type !== 'none'
  const low = !hasPlan || balance.is_expired || balance.minutes_remaining <= 0
  return (
    <Link href="/billing" className={`${styles.minutesCard} ${low ? styles.minutesCardLow : styles.minutesCardOk}`}>
      <div className={styles.minutesLabel}>Minutes Remaining</div>
      {hasPlan ? (
        <>
          <div className={styles.minutesValue}>
            {balance.minutes_remaining.toLocaleString('en-IN')} <small>/ {balance.minutes_total.toLocaleString('en-IN')}</small>
          </div>
          {low ? (
            <div className={styles.minutesSubWarn}>⚠ {balance.is_expired ? 'Plan expired' : 'Out of minutes'} — buy more</div>
          ) : (
            <div className={styles.minutesSub}>{balance.plan_type} plan · ₹{balance.rate_per_minute}/min</div>
          )}
        </>
      ) : (
        <>
          <div className={styles.minutesValue}>—</div>
          <div className={styles.minutesSubWarn}>⚠ No plan — buy minutes to start calling</div>
        </>
      )}
    </Link>
  )
}

// ── Live call tracking card (small, "third smaller card") ──────────────────
// Ticks its own duration display every second off started_at/answered_at —
// doesn't wait on a WS event to refresh the number.
function LiveCallCard() {
  const sessions = useLiveCallStore(s => s.sessions)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => forceTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const active: CallSession | undefined = sessions.find(s => s.status === 'ringing' || s.status === 'in_progress')

  if (!active) {
    return (
      <div className={styles.liveCallCard}>
        <div className={styles.liveCallLabel}>Live Call</div>
        <div className={styles.liveCallEmpty}>No call in progress</div>
      </div>
    )
  }

  const since = active.status === 'in_progress' && active.answered_at ? active.answered_at : active.started_at
  const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))

  return (
    <Link href="/live" className={`${styles.liveCallCard} ${styles.liveCallCardActive}`}>
      <div className={styles.liveCallLabel}><span className={styles.liveDot} /> Live Call</div>
      <div className={styles.liveCallPhone}>{active.phone}</div>
      <div className={styles.liveCallMeta}>
        {active.status === 'ringing' ? 'Ringing…' : `In progress · ${fmt(elapsedSec)}`}
        {active.lead_name ? ` · ${active.lead_name}` : ''}
      </div>
    </Link>
  )
}

// ── Active batch / campaign card (large, "third large card") ───────────────
// Shows which product the AI is currently pitching and its schedule window
// — the currently-running batch, or the next one about to dispatch.
function ActiveBatchCard() {
  const [batch, setBatch] = useState<any>(null)
  const [schedule, setSchedule] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    batchesApi.list({ batch_type: 'voice' }).then(async (res: any) => {
      const batches: any[] = res || []
      // Prefer a batch that's actively running; fall back to the most
      // recently created "scheduled"/"draft" one so there's still
      // something useful to show between runs.
      const running = batches.find(b => b.status === 'running')
      const upcoming = batches.find(b => b.status === 'scheduled')
      const pick = running || upcoming || null
      setBatch(pick ? { ...pick, _isRunning: !!running } : null)
      if (pick) {
        try {
          const scheds: any[] = await schedulesApi.list({ batch_id: pick.id })
          setSchedule(scheds?.[0] || null)
        } catch {}
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <SCard title="Active Campaign">
      {loading ? (
        <div className={styles.activeBatchEmpty}>—</div>
      ) : !batch ? (
        <div className={styles.activeBatchEmpty}>No campaign running right now</div>
      ) : (
        <div>
          <div className={styles.activeBatchName}>
            {batch._isRunning ? '🟢 ' : '🕐 '}{batch.name}
            <span style={{ marginLeft: 8 }}>
              {batch.agent_type === 'human' ? '🧑‍💼 Human' : '🤖 AI'}
            </span>
          </div>
          <div className={styles.activeBatchProduct}>
            {batch.product_focus ? `Pitching: ${batch.product_focus}` : 'No specific product set'}
          </div>
          <div className={styles.activeBatchScheduleRow}>
            <span className={styles.activeBatchScheduleLabel}>Status</span>
            <span className={styles.activeBatchScheduleValue}>{batch.leads_processed || 0} / {batch.lead_count || 0} leads dialed</span>
          </div>
          {schedule && (
            <>
              <div className={styles.activeBatchScheduleRow}>
                <span className={styles.activeBatchScheduleLabel}>Starts</span>
                <span className={styles.activeBatchScheduleValue}>
                  {new Date(schedule.start_datetime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={styles.activeBatchScheduleRow}>
                <span className={styles.activeBatchScheduleLabel}>Window</span>
                <span className={styles.activeBatchScheduleValue}>{schedule.window_start_time}–{schedule.window_end_time} ({schedule.base_timezone})</span>
              </div>
            </>
          )}
        </div>
      )}
    </SCard>
  )
}

export default function DashboardPage() {
  const { balance } = useAuthStore()
  const [ls, setLs] = useState<any>(null)
  const [cs, setCs] = useState<any>(null)
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      leadsApi.stats().catch(() => null),
      callsApi.stats().catch(() => null),
      callsApi.list({ limit: 6 }).catch(() => ({ calls: [] })),
    ]).then(([l, c, cl]: any) => {
      setLs(l); setCs(c); setCalls(cl?.calls || [])
      setLoading(false)
    })
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Dashboard</h1>
        <p className={styles.headSub}>Your AI call center at a glance</p>
      </div>

      {/* Stats grid */}
      <div className={styles.statsGrid}>
        <MinutesCard balance={balance} />
        <LiveCallCard />
        <StatCard label="Total Leads"    value={ls?.total || 0}      color="#a594ff" loading={loading} />
        <StatCard label="Total Calls"    value={cs?.total || 0}      color="#3ecf8e" loading={loading} />
      </div>

      {/* Middle row */}
      <div className={styles.midGrid}>
        <SCard title="Lead Pipeline">
          <div style={{ paddingTop: 4 }}>
            {PIPELINE.map(s => {
              const count = ls?.by_status?.[s.key] || 0
              const pct   = ls?.total > 0 ? (count / ls.total) * 100 : 0
              return (
                <div key={s.key} className={styles.pipelineRow}>
                  <div className={styles.pipelineTop}>
                    <span className={styles.pipelineLabel}>{s.label}</span>
                    <span className={styles.pipelineValue} style={{ color: s.color }}>{loading ? '—' : count}</span>
                  </div>
                  <div className={styles.pipelineTrack}>
                    <div className={styles.pipelineFill} style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </SCard>

        <SCard title="Call Activity">
          <div>
            <Row label="Completed"    value={loading ? '—' : cs?.completed || 0}  color="#3ecf8e" />
            <Row label="Inbound"      value={loading ? '—' : cs?.inbound || 0}     color="#4da6ff" />
            <Row label="Outbound"     value={loading ? '—' : cs?.outbound || 0}    color="#a594ff" />
            <Row label="No Answer"    value={loading ? '—' : cs?.no_answer || 0}   color="#5a5d70" />
            <Row label="Transferred"  value={loading ? '—' : cs?.transferred || 0} color="#f5a623" />
            <Row label="Avg Duration" value={loading ? '—' : `${cs?.avg_duration_seconds || 0}s`} />
          </div>
        </SCard>

        <ActiveBatchCard />
      </div>

      {/* Recent calls */}
      <SCard title="Recent Calls">
        {calls.length === 0 ? (
          <div className={styles.emptyCalls}>
            No calls yet — connect your Vobiz number in Settings
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {['Direction','Number','Duration','Status','Sentiment','Summary'].map(h => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => (
                <tr key={c.id} className={i < calls.length - 1 ? styles.tr : styles.trLast}>
                  <td className={styles.td}>
                    <span className={styles.dirBadge} style={{ color: c.direction === 'inbound' ? '#4da6ff' : '#a594ff', background: c.direction === 'inbound' ? 'rgba(77,166,255,0.1)' : 'rgba(165,148,255,0.1)' }}>
                      {c.direction === 'inbound' ? '↙' : '↗'} {c.direction}
                    </span>
                  </td>
                  <td className={styles.tdMono}>{c.direction === 'inbound' ? c.from_number : c.to_number}</td>
                  <td className={styles.tdMonoDim}>{fmt(c.duration_seconds || 0)}</td>
                  <td className={styles.tdStatus} style={{ color: c.status === 'completed' ? '#3ecf8e' : c.status === 'failed' ? '#f25757' : '#5a5d70' }}>{c.status}</td>
                  <td className={styles.tdEmoji}>{c.sentiment === 'positive' ? '😊' : c.sentiment === 'negative' ? '😟' : c.sentiment === 'neutral' ? '😐' : '—'}</td>
                  <td className={styles.tdSummary}>{c.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SCard>
    </div>
  )
}
