'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { batchesApi, schedulesApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import { Button, Input, Select, Tabs, StatusBadge, Spinner, EmptyState, StatCard } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './batches.module.css'

const LEAD_STATUSES = ['new','contacted','interested','warm','cold']
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function Bar({ done, total, color }: { done: number; total: number; color: string }) {
  const p = total > 0 ? Math.min(100, (done / total) * 100) : 0
  return (
    <div className={styles.barRow}>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${p}%`, background: color }} />
      </div>
      <span className={styles.barPct}>{Math.round(p)}%</span>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = { running: '#3ecf8e', scheduled: '#4da6ff', completed: '#a594ff', failed: '#f25757', paused: '#f5a623', draft: '#5a5d70' }

export default function BatchesPage() {
  const [tab, setTab]         = useState('list')
  const [batches, setBatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail]   = useState<any>(null)
  const [filter, setFilter]   = useState('all')

  const load = useCallback(async () => {
    try { const d = await batchesApi.list(); setBatches(Array.isArray(d) ? d : []) }
    catch { setBatches([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const deleteBatch = async (id: string) => {
    if (!confirm('Delete this batch? Cannot be undone.')) return
    try { await batchesApi.delete(id); toast.success('Deleted'); setBatches(b => b.filter(x => x.id !== id)); setDetail(null) }
    catch { toast.error('Delete failed') }
  }

  const visible = filter === 'all' ? batches : batches.filter(b => b.status === filter)
  const counts: Record<string, number> = { all: batches.length }
  batches.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1 })

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Batches</h1>
        <p className={styles.headSub}>Group leads into voice  campaigns</p>
      </div>

      <Tabs active={tab} onChange={setTab}
        tabs={[{ id: 'list', label: 'All Batches', count: batches.length }, { id: 'create', label: '+ New Batch' }]} />

      {/* ── LIST ── */}
      {tab === 'list' && (
        <div>
          {/* Stat cards */}
          <div className={styles.statsGrid}>
            <StatCard label="Total"     value={batches.length}                                 color="#a594ff" loading={loading} />
            <StatCard label="Running"   value={batches.filter(b=>b.status==='running').length}   color="#3ecf8e" loading={loading} />
            <StatCard label="Scheduled" value={batches.filter(b=>b.status==='scheduled').length} color="#4da6ff" loading={loading} />
            <StatCard label="Completed" value={batches.filter(b=>b.status==='completed').length} color="#f5a623" loading={loading} />
          </div>

          {/* Filter pills */}
          <div className={styles.filterPills}>
            {['all','running','scheduled','paused','draft','completed','failed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`${styles.filterPill} ${filter === f ? styles.filterPillActive : ''}`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase()+f.slice(1)} <span className={styles.filterCount}>{counts[f]||0}</span>
              </button>
            ))}
          </div>

          <div className={styles.panel}>
            <div className={`${styles.gridCols} ${styles.rowHead}`}>
              {['Batch','Leads','Done','Status','Progress',''].map(h => <div key={h} className={styles.rowHeadCell}>{h}</div>)}
            </div>
            {loading ? (
              <div className={styles.centerPad}><Spinner size={24} /></div>
            ) : visible.length === 0 ? (
              <EmptyState icon="▤" title="No batches yet" description="Create a batch to start running voice campaigns at scale"
                action={<Button variant="primary" onClick={() => setTab('create')}>+ New Batch</Button>} />
            ) : visible.map((b, i) => {
              const col = STATUS_COLOR[b.status] || '#5a5d70'
              return (
                <div key={b.id} className={`${styles.gridCols} ${i < visible.length-1 ? styles.row : styles.rowLast}`}
                  onClick={() => setDetail(b)}>
                  <div className={styles.nameCell}>
                    <div className={styles.nameTop}>
                      <span className={styles.typeIcon}>📞</span>
                      <span className={styles.flagIcon} title="Vobiz (India)">{'🇮🇳'}</span>
                      <span className={styles.batchName}>{b.name}</span>
                    </div>
                    {b.campaign_name && <div className={styles.campaignName}>{b.campaign_name}</div>}
                  </div>
                  <div className={styles.numCell}>{b.lead_count?.toLocaleString()}</div>
                  <div className={styles.numCellDim}>{b.leads_processed?.toLocaleString()}</div>
                  <div><StatusBadge status={b.status} /></div>
                  <Bar done={b.leads_processed} total={b.lead_count} color={col} />
                  <div className={styles.deleteAction} onClick={e => e.stopPropagation()}>
                    <button onClick={() => deleteBatch(b.id)} className={styles.iconDeleteBtn}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CREATE ── */}
      {tab === 'create' && (
        <CreateBatchForm onDone={() => { setTab('list'); load() }} onCancel={() => setTab('list')} />
      )}

      {/* Detail panel */}
      {detail && (
        <BatchDetail batch={detail} onClose={() => setDetail(null)} onDelete={() => deleteBatch(detail.id)} onRefresh={load} />
      )}
    </div>
  )
}

function CreateBatchForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { license } = useAuthStore()
  const [step, setStep] = useState<1|2|3>(1)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)
  const [f, setF] = useState({
    name: '', campaign_name: '', product_focus: '',
    batch_type: 'voice' as 'voice', call_mode: 'sales' as 'sales'|'support',
    provider: 'vobiz' as 'vobiz',
    statuses: [] as string[], country_code: '' as ''|'+91'|'other', limit: '', exclude_done: true,
    withSchedule: false,
    start_datetime: '', end_datetime: '',
    window_start: '09:00', window_end: '18:00',
    base_timezone: 'Asia/Kolkata', use_lead_timezone: true,
    allowed_days: ['Monday','Tuesday','Wednesday','Thursday','Friday'] as string[],
    max_per_hour: '20', delay_s: '30',
  })
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const toggleDay = (d: string) => set('allowed_days', f.allowed_days.includes(d) ? f.allowed_days.filter(x=>x!==d) : [...f.allowed_days, d])
  const toggleStatus = (s: string) => set('statuses', f.statuses.includes(s) ? f.statuses.filter(x=>x!==s) : [...f.statuses, s])

  const doPreview = async () => {
    setPreviewing(true)
    try { const d = await batchesApi.preview({ limit: Number(f.limit)||200, status: f.statuses.join(',')||undefined, country_code: f.country_code||undefined }); setPreview(d) }
    catch { toast.error('Preview failed') }
    finally { setPreviewing(false) }
  }

  const submit = async () => {
    setSaving(true)
    try {
      const b: any = await batchesApi.create({
        name: f.name, batch_type: f.batch_type, call_mode: f.call_mode, provider: f.provider,
        campaign_name: f.campaign_name || undefined, product_focus: f.product_focus || undefined,
        filter_criteria: { status: f.statuses.length ? f.statuses : undefined, country_code: f.country_code || undefined, limit: f.limit ? Number(f.limit) : undefined, exclude_statuses: f.exclude_done ? ['closed_won','closed_lost','do_not_call'] : undefined },
      })
      if (f.withSchedule && f.start_datetime) {
        await schedulesApi.create({ batch_id: b.id, start_datetime: f.start_datetime, end_datetime: f.end_datetime||undefined, window_start_time: f.window_start, window_end_time: f.window_end, base_timezone: f.base_timezone, use_lead_timezone: f.use_lead_timezone, allowed_days: f.allowed_days, max_per_hour: Number(f.max_per_hour), delay_between_seconds: Number(f.delay_s) })
      }
      toast.success(`Batch created — ${b.lead_count} leads`); onDone()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className={styles.createGrid}>
      {/* Form card */}
      <div className={styles.formCard}>
        {license && !license.valid && (
          <div className={styles.licenseWarn}>
            ⚠ No active license — you can build this batch, but outbound calls won't dispatch until you activate/renew.
          </div>
        )}
        {/* Step nav */}
        <div className={styles.stepNav}>
          {[{ n: 1, l: 'Setup' }, { n: 2, l: 'Filter' }, { n: 3, l: 'Confirm' }].map(({ n, l }, i) => (
            <React.Fragment key={n}>
              <div className={`${styles.stepPill} ${n === step ? styles.stepPillCurrent : n < step ? styles.stepPillDone : ''}`}>
                <span>{n < step ? '✓' : n}</span> {l}
              </div>
              {i < 2 && <div className={styles.stepDivider} />}
            </React.Fragment>
          ))}
        </div>

        <div className={styles.stepBody}>
          {/* ── Step 1 ── */}
          {step === 1 && <>
            <Input label="Batch Name *" value={f.name} onChange={e => set('name', e.target.value)} />
            <div className={styles.rowGrid2}>
              <Input label="Campaign" value={f.campaign_name} onChange={e => set('campaign_name', e.target.value)} />
              <Input label="Product Focus" value={f.product_focus} onChange={e => set('product_focus', e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Call Mode</label>
              <div className={styles.modeRow}>
                {[{ v: 'sales', l: '💰 Sales' }, { v: 'support', l: '🎧 Support' }].map(m => (
                  <button key={m.v} onClick={() => set('call_mode', m.v)} className={`${styles.modeBtn} ${f.call_mode === m.v ? styles.modeBtnActive : ''}`}>{m.l}</button>
                ))}
              </div>
            </div>
            {/* Provider picker removed — Vobiz is the sole telephony provider now */}
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={f.withSchedule} onChange={e => set('withSchedule', e.target.checked)} className={styles.checkbox} />
              <span className={styles.checkboxLabel}>Create a schedule for this batch</span>
            </label>
          </>}

          {/* ── Step 2 ── */}
          {step === 2 && <>
            <div>
              <label className={styles.label}>Filter by lead status (empty = all active)</label>
              <div className={styles.chipRow}>
                {LEAD_STATUSES.map(s => (
                  <button key={s} onClick={() => toggleStatus(s)} className={`${styles.chip} ${f.statuses.includes(s) ? styles.chipActive : ''}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={styles.label}>Country (empty = all)</label>
              <div className={styles.chipRow}>
                {[{ v: '+91', l: '🇮🇳 India (+91)' }, { v: 'other', l: '🌐 Other' }].map(c => (
                  <button key={c.v} onClick={() => set('country_code', f.country_code === c.v ? '' : c.v)} className={`${styles.chip} ${f.country_code === c.v ? styles.chipActive : ''}`}>{c.l}</button>
                ))}
              </div>
            </div>
            <label className={styles.checkboxRowSimple}>
              <input type="checkbox" checked={f.exclude_done} onChange={e => set('exclude_done', e.target.checked)} className={styles.checkbox} />
              Exclude closed / do-not-call leads
            </label>
            <Input label="Max leads (leave blank for all matching)" type="number" value={f.limit} onChange={e => set('limit', e.target.value)} />
            <Button onClick={doPreview} loading={previewing}>🔍 Preview matching leads</Button>
            {preview && (
              <div className={styles.previewBox}>
                <div className={styles.previewCount}>{preview.total_matching.toLocaleString()} <span className={styles.previewCountLabel}>leads match</span></div>
                {preview.sample?.slice(0,3).map((l: any) => (
                  <div key={l.id} className={styles.previewSample}>• {l.name} — {l.phone} — {l.status}</div>
                ))}
                {preview.total_matching > 3 && <div className={styles.previewMore}>+{preview.total_matching - 3} more</div>}
              </div>
            )}
          </>}

          {/* ── Step 3 ── */}
          {step === 3 && <>
            {f.withSchedule && <>
              <div className={styles.rowGrid2}>
                <div><label className={styles.label}>Start *</label><input type="datetime-local" value={f.start_datetime} onChange={e => set('start_datetime', e.target.value)} className={styles.fieldInput} /></div>
                <div><label className={styles.label}>End (optional)</label><input type="datetime-local" value={f.end_datetime} onChange={e => set('end_datetime', e.target.value)} className={styles.fieldInput} /></div>
              </div>
              <div className={styles.rowGrid2}>
                <div><label className={styles.label}>Window start</label><input type="time" value={f.window_start} onChange={e => set('window_start', e.target.value)} className={styles.fieldInput} /></div>
                <div><label className={styles.label}>Window end</label><input type="time" value={f.window_end} onChange={e => set('window_end', e.target.value)} className={styles.fieldInput} /></div>
              </div>
              <div>
                <label className={styles.label}>Allowed days</label>
                <div className={styles.chipRow}>
                  {DAYS.map(d => (
                    <button key={d} onClick={() => toggleDay(d)} className={`${styles.chip} ${styles.chipSmall} ${f.allowed_days.includes(d) ? styles.chipActive : ''}`}>{d.slice(0,3)}</button>
                  ))}
                </div>
              </div>
              <div className={styles.rowGrid2}>
                <Input label="Max per hour" type="number" value={f.max_per_hour} onChange={e => set('max_per_hour', e.target.value)} />
                <Input label="Delay (sec)" type="number" value={f.delay_s} onChange={e => set('delay_s', e.target.value)} />
              </div>
            </>}
            {!f.withSchedule && (
              <div className={styles.reviewBox}>
                {[['Name', f.name], ['Mode', f.call_mode], ['Provider', f.provider], ['Leads', f.limit || 'all matching'], ['Campaign', f.campaign_name||'—'], ['Filter', f.statuses.join(', ')||'all active'], ['Country', f.country_code||'all']].map(([l,v]) => (
                  <div key={l as string} className={styles.reviewRow}>
                    <span className={styles.reviewLabel}>{l}</span>
                    <span className={styles.reviewValue}>{v as string}</span>
                  </div>
                ))}
              </div>
            )}
          </>}
        </div>

        {/* Footer */}
        <div className={styles.formFooter}>
          <Button onClick={step === 1 ? onCancel : () => setStep(s => (s - 1) as any)}>{step === 1 ? 'Cancel' : '← Back'}</Button>
          {step < 3
            ? <Button variant="primary" disabled={step === 1 && !f.name} onClick={() => { if (step === 2 && !preview) { doPreview() } else { setStep(s => (s + 1) as any) } }}>
                {step === 2 && !preview ? 'Preview & Next →' : 'Next →'}
              </Button>
            : <Button variant="primary" loading={saving} onClick={submit}>🚀 {f.withSchedule ? 'Create & Schedule' : 'Create Batch'}</Button>
          }
        </div>
      </div>

      {/* Tips */}
      <div className={styles.guideCard}>
        <div className={styles.guideTitle}>Guide</div>
        {step === 1 && [['📞','Voice','AI dials leads and has live conversations.'], ['📅','Schedule','Set a time window and rate limit.']].map(([ic,t,d]) => (
          <div key={t as string} className={styles.guideItem}>
            <span className={styles.guideIcon}>{ic}</span>
            <div><div className={styles.guideItemTitle}>{t}</div><div className={styles.guideItemDesc}>{d}</div></div>
          </div>
        ))}
        {step === 2 && [['🎯','Status filter','Choose which leads to include.'], ['🔍','Preview','Check the count before creating.'], ['⚡','Limit','Cap the batch size.']].map(([ic,t,d]) => (
          <div key={t as string} className={styles.guideItem}>
            <span className={styles.guideIcon}>{ic}</span>
            <div><div className={styles.guideItemTitle}>{t}</div><div className={styles.guideItemDesc}>{d}</div></div>
          </div>
        ))}
        {step === 3 && [['✅','Review','Confirm settings before creating.'], ['🕒','Schedule','Time window controls when calls go out.']].map(([ic,t,d]) => (
          <div key={t as string} className={styles.guideItem}>
            <span className={styles.guideIcon}>{ic}</span>
            <div><div className={styles.guideItemTitle}>{t}</div><div className={styles.guideItemDesc}>{d}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BatchDetail({ batch, onClose, onDelete, onRefresh }: any) {
  const [showSched, setShowSched] = useState(false)
  const [sf, setSf] = useState({ start_datetime:'', end_datetime:'', window_start:'09:00', window_end:'18:00', base_timezone:'Asia/Kolkata', use_lead_timezone:true, allowed_days:['Monday','Tuesday','Wednesday','Thursday','Friday'] as string[], max_per_hour:'20', delay_s:'30' })
  const [saving, setSaving] = useState(false)
  const setSF = (k: string, v: any) => setSf(p => ({ ...p, [k]: v }))
  const toggleDay = (d: string) => setSF('allowed_days', sf.allowed_days.includes(d) ? sf.allowed_days.filter(x=>x!==d) : [...sf.allowed_days, d])
  const col = STATUS_COLOR[batch.status] || '#5a5d70'
  const pct = batch.lead_count > 0 ? Math.round((batch.leads_processed / batch.lead_count) * 100) : 0

  const saveSched = async () => {
    if (!sf.start_datetime) { toast.error('Start date required'); return }
    setSaving(true)
    try {
      await schedulesApi.create({ batch_id: batch.id, start_datetime: sf.start_datetime, end_datetime: sf.end_datetime||undefined, window_start_time: sf.window_start, window_end_time: sf.window_end, base_timezone: sf.base_timezone, use_lead_timezone: sf.use_lead_timezone, allowed_days: sf.allowed_days, max_per_hour: Number(sf.max_per_hour), delay_between_seconds: Number(sf.delay_s) })
      toast.success('Scheduled!'); setShowSched(false); onRefresh()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHead}>
          <div className={styles.modalHeadLeft}>
            <span className={styles.modalHeadIcon}>📞</span>
            <div>
              <div className={styles.modalHeadName}>{batch.name}</div>
              {batch.campaign_name && <div className={styles.modalHeadCampaign}>{batch.campaign_name}</div>}
            </div>
            <StatusBadge status={batch.status} />
          </div>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Progress */}
          <div>
            <div className={styles.progressRow}>
              <span className={styles.progressLabel}>Progress</span>
              <span className={styles.progressValue} style={{ color: col }}>{pct}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${pct}%`, background: col }} />
            </div>
          </div>
          {/* Stats */}
          <div className={styles.metricsGrid}>
            {[['Total',batch.lead_count,'#a594ff'],['Processed',batch.leads_processed,'#4da6ff'],['Won',batch.leads_succeeded,'#3ecf8e'],['Failed',batch.leads_failed,'#f25757']].map(([l,v,c]) => (
              <div key={l as string} className={styles.metricTile}>
                <div className={styles.metricLabel}>{l}</div>
                <div className={styles.metricValue} style={{ color: c as string }}>{v as number}</div>
              </div>
            ))}
          </div>
          {/* Details */}
          {[['Mode', batch.call_mode||'—'], ['Provider', batch.provider||'vobiz'], ['Product', batch.product_focus||'—']].map(([l,v]) => (
            <div key={l as string} className={styles.detailRow}>
              <span className={styles.detailLabel}>{l}</span>
              <span className={styles.detailValue}>{v}</span>
            </div>
          ))}

          {/* Schedule button */}
          {!['completed','running'].includes(batch.status) && !showSched && (
            <button onClick={() => setShowSched(true)} className={styles.scheduleToggleBtn}>
              ◷ Add / Update Schedule
            </button>
          )}

          {showSched && (
            <div className={styles.scheduleBox}>
              <div className={styles.scheduleBoxTitle}>Schedule Settings</div>
              <div className={styles.rowGrid2}>
                <div><div className={styles.scheduleFieldLabel}>Start *</div><input type="datetime-local" value={sf.start_datetime} onChange={e => setSF('start_datetime', e.target.value)} className={styles.fieldInput} /></div>
                <div><div className={styles.scheduleFieldLabel}>End</div><input type="datetime-local" value={sf.end_datetime} onChange={e => setSF('end_datetime', e.target.value)} className={styles.fieldInput} /></div>
              </div>
              <div className={styles.rowGrid2}>
                <div><div className={styles.scheduleFieldLabel}>Window start</div><input type="time" value={sf.window_start} onChange={e => setSF('window_start', e.target.value)} className={styles.fieldInput} /></div>
                <div><div className={styles.scheduleFieldLabel}>Window end</div><input type="time" value={sf.window_end} onChange={e => setSF('window_end', e.target.value)} className={styles.fieldInput} /></div>
              </div>
              <div className={styles.chipRow}>
                {DAYS.map(d => <button key={d} onClick={() => toggleDay(d)} className={`${styles.chip} ${styles.chipSmall} ${sf.allowed_days.includes(d) ? styles.chipActive : ''}`}>{d.slice(0,3)}</button>)}
              </div>
              <div className={styles.rowGrid2}>
                <div><div className={styles.scheduleFieldLabel}>Max/hr</div><input type="number" value={sf.max_per_hour} onChange={e => setSF('max_per_hour', e.target.value)} className={styles.fieldInput} /></div>
                <div><div className={styles.scheduleFieldLabel}>Delay (s)</div><input type="number" value={sf.delay_s} onChange={e => setSF('delay_s', e.target.value)} className={styles.fieldInput} /></div>
              </div>
              <div className={styles.scheduleActions}>
                <Button onClick={() => setShowSched(false)}>Cancel</Button>
                <Button variant="primary" loading={saving} onClick={saveSched} style={{ flex: 1, justifyContent: 'center' }}>Save Schedule</Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <Button variant="danger" onClick={onDelete}>Delete Batch</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}