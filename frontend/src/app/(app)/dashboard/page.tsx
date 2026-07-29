'use client'
import { useEffect, useState } from 'react'
import { callsApi, leadsApi } from '@/lib/api'
import { StatCard } from '@/components/ui'
import { useAuthStore } from '@/store'
import styles from './dashboard.module.css'

const PIPELINE = [
  { key: 'interested', label: 'Hot 🔥',   color: '#f25757' },
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

function LicenseCard({ license }: { license: any }) {
  if (!license) return null
  const active = !!license.valid
  return (
    <div className={`${styles.licenseCard} ${active ? styles.licenseCardActive : styles.licenseCardInactive}`}>
      <div className={styles.licenseRow}>
        <div>
          <div className={styles.licenseLabel}>License</div>
          <div className={styles.licenseSub} style={{ color: active ? '#5a5d70' : '#f25757' }}>
            {active
              ? `${(license.tier || 'plan').replace(/^\w/, (c:string) => c.toUpperCase())} tier — expires ${license.expires_at ? new Date(license.expires_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '?'}`
              : `⚠ ${license.activated ? 'License expired' : 'No license activated'} — features locked`}
          </div>
        </div>
        <div>
          <div className={styles.licenseStatus} style={{ color: active ? '#3ecf8e' : '#f25757' }}>
            {active ? '● Active' : '● Inactive'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { license } = useAuthStore()
  const [ls, setLs] = useState<any>(null)
  const [cs, setCs] = useState<any>(null)
  const [es, setEs] = useState<any>(null)
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      leadsApi.stats().catch(() => null),
      callsApi.stats().catch(() => null),
      //
      callsApi.list({ limit: 6 }).catch(() => ({ calls: [] })),
    ]).then(([l, c, e, cl]: any) => {
      setLs(l); setCs(c); setEs(e); setCalls(cl?.calls || [])
      setLoading(false)
    })
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Dashboard</h1>
        <p className={styles.headSub}>Your AI call center at a glance</p>
      </div>

      {/* Stats grid — minutes bar spans full width */}
      <div className={styles.statsGrid}>
        <LicenseCard license={license} />
        <StatCard label="Total Leads"    value={ls?.total || 0}      color="#a594ff" loading={loading} />
        <StatCard label="Total Calls"    value={cs?.total || 0}      color="#3ecf8e" loading={loading} />
        <StatCard label="Emails Sent"    value={es?.sent || 0}       color="#4da6ff" loading={loading} />
        <StatCard label="Pending Review" value={es?.pending_review || 0} color="#f5a623" loading={loading} />
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

        <SCard title="Email Activity">
          <div>
            <Row label="Sent"         value={loading ? '—' : es?.sent || 0}               color="#4da6ff" />
            <Row label="Opened"       value={loading ? '—' : es?.opened || 0}             color="#a594ff" />
            <Row label="Replied"      value={loading ? '—' : es?.replied || 0}            color="#3ecf8e" />
            <Row label="Open Rate"    value={loading ? '—' : `${es?.open_rate || 0}%`}    color="#a594ff" />
            <Row label="Reply Rate"   value={loading ? '—' : `${es?.reply_rate || 0}%`}   color="#3ecf8e" />
            <Row label="Needs Review" value={loading ? '—' : es?.pending_review || 0}     color={es?.pending_review > 0 ? '#f5a623' : undefined} />
          </div>
        </SCard>
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
