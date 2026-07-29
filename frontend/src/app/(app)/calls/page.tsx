'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { callsApi } from '@/lib/api'
import { Spinner, EmptyState, Modal, Button, Tabs } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './calls.module.css'

const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
function timeAgo(s: string) {
  const d = Math.floor((Date.now()-new Date(s).getTime())/1000)
  return d < 60 ? `${d}s` : d < 3600 ? `${Math.floor(d/60)}m` : d < 86400 ? `${Math.floor(d/3600)}h` : `${Math.floor(d/86400)}d`
}

export default function CallsPage() {
  const [dir, setDir]       = useState('')
  const [calls, setCalls]   = useState<any[]>([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const LIMIT = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r: any = await callsApi.list({ direction:dir||undefined, limit:LIMIT, offset })
      setCalls(r.calls||[]); setTotal(r.total||0)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [dir, offset])
  useEffect(() => { load() }, [load])

  const pages = Math.ceil(total / LIMIT)
  const page  = Math.floor(offset / LIMIT) + 1

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Call Logs</h1>
        <p className={styles.headSub}>{total} total calls</p>
      </div>

      {/* Direction tabs + count */}
      <div className={styles.tabRow}>
        <Tabs active={dir||'all'} onChange={v => { setDir(v==='all'?'':v); setOffset(0) }}
          tabs={[{ id:'all', label:'All' }, { id:'inbound', label:'↙ Inbound' }, { id:'outbound', label:'↗ Outbound' }]} />
      </div>

      <div className={styles.panel}>
        {/* Header */}
        <div className={`${styles.gridCols} ${styles.rowHead}`}>
          {['','Number','Duration','Status','Mood','Summary','Time'].map(h => (
            <div key={h} className={styles.rowHeadCell}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div className={styles.centerPad}><Spinner size={24} /></div>
        ) : calls.length === 0 ? (
          <EmptyState icon="📞" title="No calls yet" description="Calls appear here once your Vobiz number is connected" />
        ) : calls.map((c, i) => (
          <div key={c.id}
            className={`${styles.gridCols} ${i < calls.length-1 ? styles.row : styles.rowLast}`}
            onClick={() => setDetail(c)}>
            <div className={styles.dirIcon} style={{
              background: c.direction==='inbound' ? 'rgba(77,166,255,0.1)' : 'rgba(165,148,255,0.1)',
              color: c.direction==='inbound' ? '#4da6ff' : '#a594ff' }}>
              {c.direction==='inbound'?'↙':'↗'}
            </div>
            <div className={styles.numberCell}>{c.direction==='inbound'?c.from_number:c.to_number}</div>
            <div className={styles.durationCell}>{fmt(c.duration_seconds||0)}</div>
            <div className={styles.statusCell} style={{ color: c.status==='completed'?'#3ecf8e': c.status==='failed'?'#f25757':'#5a5d70' }}>{c.status}</div>
            <div className={styles.moodCell}>{c.sentiment==='positive'?'😊':c.sentiment==='negative'?'😟':c.sentiment==='neutral'?'😐':'—'}</div>
            <div className={styles.summaryCell}>{c.summary||'—'}</div>
            <div className={styles.timeCell}>{c.created_at ? timeAgo(c.created_at) : '—'}</div>
          </div>
        ))}

        {pages > 1 && (
          <div className={styles.pager}>
            <Button size="sm" disabled={page===1} onClick={() => setOffset(offset-LIMIT)}>← Prev</Button>
            <span className={styles.pagerText}>Page {page} of {pages}</span>
            <Button size="sm" disabled={page===pages} onClick={() => setOffset(offset+LIMIT)}>Next →</Button>
          </div>
        )}
      </div>

      {detail && (
        <Modal open title="Call Details" onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Close</Button>} size="md">
          <div className={styles.detailWrap}>
            <div className={styles.detailGrid}>
              {[['Direction',detail.direction],['Duration',fmt(detail.duration_seconds||0)],['Mode',detail.mode||'—'],['Sentiment',detail.sentiment||'—']].map(([l,v]) => (
                <div key={l as string} className={styles.detailTile}>
                  <div className={styles.detailTileLabel}>{l}</div>
                  <div className={styles.detailTileValue}>{v}</div>
                </div>
              ))}
            </div>
            {detail.summary && (
              <div className={styles.summaryBox}>
                <div className={styles.summaryBoxLabel}>AI Summary</div>
                <p className={styles.summaryBoxText}>{detail.summary}</p>
              </div>
            )}
            {(detail.conversation_history||[]).length > 0 && (
              <div>
                <div className={styles.convoLabel}>Conversation</div>
                <div className={styles.convoList}>
                  {detail.conversation_history.map((m: any, i: number) => (
                    <div key={i} className={m.role==='assistant' ? styles.convoRowAssistant : styles.convoRowUser}>
                      <div className={`${styles.bubble} ${m.role==='assistant' ? styles.bubbleAssistant : styles.bubbleUser}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
