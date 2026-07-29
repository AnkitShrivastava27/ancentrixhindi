'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { emailsApi, batchesApi } from '@/lib/api'
import { Modal, Button, Spinner, EmptyState, Tabs, StatCard } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './emails.module.css'

const S_STYLE: Record<string, { color: string; bg: string }> = {
  queued:    { color:'#5a5d70', bg:'rgba(90,93,112,0.1)'  },
  sent:      { color:'#4da6ff', bg:'rgba(77,166,255,0.1)' },
  delivered: { color:'#3ecf8e', bg:'rgba(62,207,142,0.1)' },
  opened:    { color:'#a594ff', bg:'rgba(165,148,255,0.1)'},
  replied:   { color:'#3ecf8e', bg:'rgba(62,207,142,0.15)'},
  bounced:   { color:'#f25757', bg:'rgba(242,87,87,0.1)'  },
  failed:    { color:'#f25757', bg:'rgba(242,87,87,0.1)'  },
}
const REPLY_COLOR: Record<string, string> = {
  unread:'#5a5d70', ai_replied:'#3ecf8e', queued_for_review:'#f5a623', human_replied:'#a594ff', ignored:'#3a3d4e',
}

export default function EmailsPage() {
  const [tab, setTab]           = useState('logs')
  const [logs, setLogs]         = useState<any[]>([])
  const [queue, setQueue]       = useState<any[]>([])
  const [stats, setStats]       = useState<any>(null)
  const [batches, setBatches]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [draft, setDraft]       = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [polling, setPolling]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, q, s, b] = await Promise.all([
        emailsApi.logs({ batch_id:batchFilter||undefined, status:statusFilter||undefined, limit:100 }),
        emailsApi.queue(),
        emailsApi.stats(batchFilter ? { batch_id:batchFilter } : undefined),
        batchesApi.list({ batch_type:'email' }),
      ])
      setLogs(Array.isArray(l) ? l : [])
      setQueue(Array.isArray(q) ? q : [])
      setStats(s)
      setBatches(Array.isArray(b) ? b : [])
    } catch {} finally { setLoading(false) }
  }, [batchFilter, statusFilter])
  useEffect(() => { load() }, [load])

  const approve = async () => {
    try { await emailsApi.approveReply({ email_log_id: selected.id, edited_body: draft||undefined }); toast.success('Reply sent!'); setSelected(null); load() }
    catch { toast.error('Failed') }
  }
  const manualReply = async () => {
    if (!draft) return
    try { await emailsApi.send({ email_log_id: selected.id, reply_body: draft }); toast.success('Sent!'); setSelected(null); load() }
    catch { toast.error('Failed') }
  }
  const pollReplies = async () => {
    setPolling(true)
    try { await emailsApi.pollReplies(); toast.success('Polling… refreshing in 5s'); setTimeout(load, 5000) }
    catch { toast.error('Poll failed') }
    finally { setPolling(false) }
  }

  const display = tab === 'review' ? queue : logs

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.headTitle}>Email Campaigns</h1>
          <p className={styles.headSub}>AI-powered email outreach and reply management</p>
        </div>
        <button onClick={pollReplies} disabled={polling} className={`${styles.pollBtn} ${polling ? styles.pollBtnDisabled : ''}`}>
          {polling ? <Spinner size={12} /> : '📬'} Poll Replies
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className={styles.statsRow}>
          {[['Sent',stats.sent,'#4da6ff'],['Opened',stats.opened,'#a594ff'],['Replied',stats.replied,'#3ecf8e'],['Bounced',stats.bounced,'#f25757'],['Open %',`${stats.open_rate||0}%`,'#a594ff'],['Reply %',`${stats.reply_rate||0}%`,'#3ecf8e'],['Auto-replied',stats.ai_auto_replied,'#f5a623'],['For review',stats.pending_review,'#f5a623']].map(([l,v,c]) => (
            <div key={l as string} className={`${styles.statTile} ${(stats.pending_review>0 && l==='For review') ? styles.statTileWarn : ''}`}>
              <div className={styles.statTileLabel}>{l}</div>
              <div className={styles.statTileValue} style={{ color: c as string }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab + filters */}
      <div className={styles.filterRow}>
        <Tabs active={tab} onChange={setTab}
          tabs={[{ id:'logs', label:'All Emails' }, { id:'review', label:`Review Queue${queue.length>0?` (${queue.length})`:''}` }]} />
        <div className={styles.filterGroup}>
          <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className={styles.filterSelect} style={{ color: batchFilter ? '#f0f1f5' : '#5a5d70' }}>
            <option value="">All batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={styles.filterSelect} style={{ color: statusFilter ? '#f0f1f5' : '#5a5d70' }}>
            <option value="">All statuses</option>
            {['queued','sent','delivered','opened','replied','bounced','failed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tablePanel}>
        <div className={`${styles.gridCols} ${styles.tableHead}`}>
          {['To','Subject','Status','Sent','Reply Status','Mood','Action'].map(h => (
            <div key={h} className={styles.tableHeadCell}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div className={styles.centerPad}><Spinner size={24} /></div>
        ) : display.length === 0 ? (
          <EmptyState icon="✉️" title={tab==='review' ? 'No emails pending review' : 'No emails yet'} description={tab==='review' ? 'AI is handling all replies automatically' : 'Send an email batch to see logs here'} />
        ) : display.map((log, i) => {
          const sm = S_STYLE[log.status] || { color:'#5a5d70', bg:'rgba(90,93,112,0.1)' }
          return (
            <div key={log.id}
              className={`${styles.gridCols} ${i < display.length-1 ? styles.row : styles.rowLast}`}
              onClick={() => { setSelected(log); setDraft(log.ai_reply_draft||'') }}>
              <div className={styles.toCell}>
                <div className={styles.toName}>{log.to_name||log.to_email}</div>
                <div className={styles.toEmail}>{log.to_email}</div>
              </div>
              <div className={styles.subjectCell}>{log.subject}</div>
              <div><span className={styles.statusPill} style={{ color:sm.color, background:sm.bg }}>{log.status}</span></div>
              <div className={styles.dateCell}>{log.sent_at ? new Date(log.sent_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'}</div>
              <div className={styles.replyStatusCell} style={{ color: REPLY_COLOR[log.reply_status]||'#4a4d5e' }}>{log.reply_status ? log.reply_status.replace(/_/g,' ') : '—'}</div>
              <div className={styles.moodCell}>{log.reply_sentiment==='positive'?'😊':log.reply_sentiment==='negative'?'😟':log.reply_sentiment==='neutral'?'😐':'—'}</div>
              <div onClick={e => e.stopPropagation()}>
                {log.reply_status==='queued_for_review' ? (
                  <button onClick={() => { setSelected(log); setDraft(log.ai_reply_draft||'') }} className={styles.reviewBtn}>Review</button>
                ) : log.status==='replied' && !log.ai_reply_sent ? (
                  <button onClick={() => { setSelected(log); setDraft('') }} className={styles.replyBtn}>Reply</button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      {selected && (
        <Modal open title="Email Thread" onClose={() => setSelected(null)} size="lg"
          footer={
            <div className={styles.modalFooterActions}>
              {selected.reply_status==='queued_for_review' && <Button variant="primary" onClick={approve}>✅ Approve & Send</Button>}
              {draft && <Button onClick={manualReply}>📤 Send Manual Reply</Button>}
              <Button onClick={() => setSelected(null)}>Close</Button>
            </div>
          }>
          <div className={styles.detailStack}>
            {/* Meta */}
            <div className={styles.metaBox}>
              <div>
                <div className={styles.metaName}>{selected.to_name} <span className={styles.metaEmail}>&lt;{selected.to_email}&gt;</span></div>
                <div className={styles.metaSubject}>Subject: {selected.subject}</div>
                {selected.reply_sentiment && (
                  <div className={styles.metaMoodRow}>
                    <span className={styles.metaMood}>Mood: {selected.reply_sentiment==='positive'?'😊':selected.reply_sentiment==='negative'?'😟':'😐'} {selected.reply_sentiment}</span>
                    {selected.reply_intent && <span className={styles.metaIntent}>Intent: {selected.reply_intent}</span>}
                  </div>
                )}
              </div>
              <div className={styles.metaStatusPill} style={S_STYLE[selected.status]||{ color:'#5a5d70', background:'rgba(90,93,112,0.1)' }}>{selected.status}</div>
            </div>

            {/* Thread */}
            <div className={styles.thread}>
              {(selected.email_thread||[{ role:'ai', body:selected.body_text }]).map((m: any, i: number) => (
                <div key={i} className={m.role==='ai' ? styles.threadRowAi : styles.threadRowLead}>
                  <div className={`${styles.bubble} ${m.role==='ai' ? styles.bubbleAi : styles.bubbleLead}`}>
                    <div className={styles.bubbleRole}>{m.role==='ai'?'🤖 AI Agent':'👤 Lead'}</div>
                    {m.body}
                  </div>
                </div>
              ))}
            </div>

            {/* AI confidence */}
            {selected.ai_reply_confidence > 0 && (
              <div className={styles.confidenceRow}>
                <span className={styles.confidenceLabel}>AI confidence</span>
                <div className={styles.confidenceTrack}>
                  <div className={styles.confidenceFill} style={{ width:`${Math.round(selected.ai_reply_confidence*100)}%`, background:selected.ai_reply_confidence>=0.75?'#3ecf8e':'#f5a623' }} />
                </div>
                <span className={styles.confidenceValue} style={{ color:selected.ai_reply_confidence>=0.75?'#3ecf8e':'#f5a623' }}>{Math.round(selected.ai_reply_confidence*100)}%</span>
              </div>
            )}

            {/* Reply editor */}
            {(selected.reply_status==='queued_for_review' || (selected.status==='replied' && !selected.ai_reply_sent)) && (
              <div>
                <div className={styles.editorLabel}>
                  {selected.reply_status==='queued_for_review' ? 'Edit AI draft' : 'Write reply'}
                </div>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
                  placeholder={selected.ai_reply_draft || 'Write reply here…'}
                  className={styles.editorTextarea} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
