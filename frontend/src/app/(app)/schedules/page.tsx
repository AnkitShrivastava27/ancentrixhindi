'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { schedulesApi, batchesApi } from '@/lib/api'
import { Button, Input, Tabs, StatusBadge, Spinner, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './schedules.module.css'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

export default function SchedulesPage() {
  const [tab, setTab]           = useState('list')
  const [schedules, setSchedules] = useState<any[]>([])
  const [batches, setBatches]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<any>(null)
  const [form, setForm]         = useState(defaultForm())

  function defaultForm() {
    return { batch_id:'', start_datetime:'', end_datetime:'', window_start_time:'09:00', window_end_time:'18:00', base_timezone:'Asia/Kolkata', use_lead_timezone:true, allowed_days:['Monday','Tuesday','Wednesday','Thursday','Friday'] as string[], max_per_hour:'20', delay_between_seconds:'30' }
  }
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const toggleDay = (d: string) => set('allowed_days', form.allowed_days.includes(d) ? form.allowed_days.filter(x=>x!==d) : [...form.allowed_days, d])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, b] = await Promise.all([schedulesApi.list(), batchesApi.list()])
      setSchedules(Array.isArray(s) ? s : [])
      setBatches(Array.isArray(b) ? b : [])
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const batchName = (id: string) => batches.find(b => b.id === id)?.name || id.slice(0,8)

  const openEdit = (s: any) => {
    setEditing(s)
    setForm({ batch_id:s.batch_id, start_datetime:s.start_datetime?.slice(0,16)||'', end_datetime:s.end_datetime?.slice(0,16)||'', window_start_time:s.window_start_time||'09:00', window_end_time:s.window_end_time||'18:00', base_timezone:s.base_timezone||'Asia/Kolkata', use_lead_timezone:s.use_lead_timezone??true, allowed_days:s.allowed_days||['Monday','Tuesday','Wednesday','Thursday','Friday'], max_per_hour:String(s.max_per_hour||20), delay_between_seconds:String(s.delay_between_seconds||30) })
    setTab('form')
  }

  const resetAndList = () => { setEditing(null); setForm(defaultForm()); setTab('list') }

  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.batch_id || !form.start_datetime) { toast.error('Batch and start date required'); return }
    setSaving(true)
    try {
      const payload = { batch_id:form.batch_id, start_datetime:form.start_datetime, end_datetime:form.end_datetime||undefined, window_start_time:form.window_start_time, window_end_time:form.window_end_time, base_timezone:form.base_timezone, use_lead_timezone:form.use_lead_timezone, allowed_days:form.allowed_days, max_per_hour:Number(form.max_per_hour), delay_between_seconds:Number(form.delay_between_seconds) }
      if (editing) { await schedulesApi.update(editing.id, payload); toast.success('Updated') }
      else { await schedulesApi.create(payload); toast.success('Created') }
      resetAndList(); load()
    } catch (e: any) { toast.error(e.message||'Failed') } finally { setSaving(false) }
  }

  const deleteS = async (id: string) => {
    if (!confirm('Delete schedule?')) return
    try { await schedulesApi.delete(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed') }
  }

  const toggleActive = async (s: any) => {
    try { await schedulesApi.update(s.id, { is_active: !s.is_active }); toast.success(s.is_active ? 'Paused' : 'Activated'); load() }
    catch { toast.error('Failed') }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Schedules</h1>
        <p className={styles.headSub}>Control when batches run — time windows, days, rate limits</p>
      </div>

      <Tabs active={tab} onChange={t => { if (t === 'list') resetAndList(); else setTab(t) }}
        tabs={[{ id:'list', label:'All Schedules', count:schedules.length }, { id:'form', label: editing ? '✏ Edit Schedule' : '+ New Schedule' }]} />

      {/* ── LIST ── */}
      {tab === 'list' && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={`${styles.gridCols} ${styles.rowHead}`}>
            {['Batch','Window','Days','Rate','Actions'].map(h => (
              <div key={h} className={styles.rowHeadCell}>{h}</div>
            ))}
          </div>
          {loading ? (
            <div className={styles.centerPad}><Spinner size={24} /></div>
          ) : schedules.length === 0 ? (
            <EmptyState icon="◷" title="No schedules yet" description="Attach a schedule to a batch to control when it runs"
              action={<Button variant="primary" onClick={() => setTab('form')}>+ New Schedule</Button>} />
          ) : schedules.map((s, i) => {
            const batch = batches.find(b => b.id === s.batch_id)
            return (
              <div key={s.id} className={`${styles.gridCols} ${i < schedules.length-1 ? styles.row : styles.rowLast} ${s.is_active ? styles.rowActive : ''}`}>
                {/* Batch */}
                <div>
                  <div className={styles.batchTop}>
                    <span className={styles.batchIcon}>{batch?.batch_type==='voice'?'📞':'✉️'}</span>
                    <span className={styles.batchName}>{batchName(s.batch_id)}</span>
                    {batch && <StatusBadge status={batch.status} />}
                    {!s.is_active && <span className={styles.pausedPill}>paused</span>}
                  </div>
                  <div className={styles.batchDates}>
                    {new Date(s.start_datetime).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                    {s.end_datetime && ` → ${new Date(s.end_datetime).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}`}
                  </div>
                </div>
                {/* Window */}
                <div>
                  <div className={styles.cellPrimary}>{s.window_start_time}–{s.window_end_time}</div>
                  <div className={styles.cellSecondary}>{s.base_timezone}</div>
                </div>
                {/* Days */}
                <div>
                  <div className={styles.daysText}>{(s.allowed_days||[]).map((d: string)=>d.slice(0,3)).join(', ')}</div>
                  {s.use_lead_timezone && <div className={styles.tzGood}>✓ per-lead TZ</div>}
                </div>
                {/* Rate */}
                <div>
                  <div className={styles.cellPrimary}>{s.max_per_hour}/hr</div>
                  <div className={styles.cellSecondary}>{s.delay_between_seconds}s gap</div>
                </div>
                {/* Actions */}
                <div className={styles.actionsRow}>
                  <button onClick={() => toggleActive(s)} title={s.is_active?'Pause':'Activate'} className={`${styles.iconBtn} ${s.is_active ? styles.iconBtnPause : styles.iconBtnPlay}`}>{s.is_active?'⏸':'▶'}</button>
                  <button onClick={() => openEdit(s)} className={`${styles.iconBtn} ${styles.iconBtnEdit}`}>✏</button>
                  <button onClick={() => deleteS(s.id)} className={`${styles.iconBtn} ${styles.iconBtnDelete}`}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── FORM ── */}
      {tab === 'form' && (
        <div className={styles.formGrid}>
          <div className={styles.formCard}>
            <div className={styles.formTitle}>{editing ? 'Edit Schedule' : 'New Schedule'}</div>

            {/* Batch picker */}
            <div>
              <label className={styles.label}>Batch *</label>
              <select value={form.batch_id} onChange={e => set('batch_id', e.target.value)} disabled={!!editing} className={`${styles.fieldInput} ${editing ? styles.fieldInputDisabled : ''}`}>
                <option value="">Select a batch…</option>
                {batches.filter(b => !['completed','failed'].includes(b.status)).map(b => (
                  <option key={b.id} value={b.id}>{b.batch_type==='voice'?'📞':'✉️'} {b.name} ({b.lead_count} leads · {b.status})</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className={styles.rowGrid2}>
              <div><label className={styles.label}>Start *</label><input type="datetime-local" value={form.start_datetime} onChange={e => set('start_datetime', e.target.value)} className={styles.fieldInput} /></div>
              <div><label className={styles.label}>End (optional)</label><input type="datetime-local" value={form.end_datetime} onChange={e => set('end_datetime', e.target.value)} className={styles.fieldInput} /></div>
            </div>

            {/* Window */}
            <div className={styles.rowGrid2}>
              <div><label className={styles.label}>Window start</label><input type="time" value={form.window_start_time} onChange={e => set('window_start_time', e.target.value)} className={styles.fieldInput} /></div>
              <div><label className={styles.label}>Window end</label><input type="time" value={form.window_end_time} onChange={e => set('window_end_time', e.target.value)} className={styles.fieldInput} /></div>
            </div>

            {/* Timezone */}
            <div>
              <label className={styles.label}>Timezone</label>
              <select value={form.base_timezone} onChange={e => set('base_timezone', e.target.value)} className={styles.fieldInput}>
                {['Asia/Kolkata','Asia/Dubai','Asia/Singapore','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles','UTC'].map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>

            {/* Per-lead TZ */}
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={form.use_lead_timezone} onChange={e => set('use_lead_timezone', e.target.checked)} className={styles.checkbox} />
              <div>
                <div className={styles.checkboxTitle}>Per-lead timezone</div>
                <div className={styles.checkboxSub}>Override base TZ with each lead's own timezone</div>
              </div>
            </label>

            {/* Days */}
            <div>
              <label className={styles.label}>Allowed days</label>
              <div className={styles.dayChips}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => toggleDay(d)} className={`${styles.dayChip} ${form.allowed_days.includes(d) ? styles.dayChipActive : ''}`}>{d.slice(0,3)}</button>
                ))}
              </div>
            </div>

            {/* Rate */}
            <div className={styles.rowGrid2}>
              <Input label="Max per hour" type="number" value={form.max_per_hour} onChange={e => set('max_per_hour', e.target.value)} />
              <Input label="Delay between (sec)" type="number" value={form.delay_between_seconds} onChange={e => set('delay_between_seconds', e.target.value)} />
            </div>

            <div className={styles.formActions}>
              <Button onClick={resetAndList}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!form.batch_id || !form.start_datetime} onClick={save} style={{ flex:1, justifyContent:'center' }}>
                {editing ? 'Save Changes' : 'Create Schedule'}
              </Button>
            </div>
          </div>

          {/* Preview panel */}
          <div className={styles.previewStack}>
            {form.batch_id && (
              <div className={styles.previewCard}>
                <div className={styles.previewTitle}>Preview</div>
                {[['Batch', batchName(form.batch_id)], ['Window', `${form.window_start_time}–${form.window_end_time}`], ['Days', form.allowed_days.map(d=>d.slice(0,3)).join(', ')||'—'], ['Rate', `${form.max_per_hour}/hr · ${form.delay_between_seconds}s`]].map(([l,v]) => (
                  <div key={l as string} className={styles.previewRow}>
                    <span className={styles.previewRowLabel}>{l}</span>
                    <span className={styles.previewRowValue}>{v}</span>
                  </div>
                ))}
                {form.use_lead_timezone && <div className={styles.previewGood}>✓ Per-lead timezone enabled</div>}
              </div>
            )}
            <div className={styles.previewCard}>
              <div className={styles.previewTitle}>How it works</div>
              {[['🕒','Window','Calls only go out in the set daily window'],['🗓','Days','Block weekends or specific days'],['🌏','Lead TZ','Call each lead in their own timezone'],['⚡','Rate','Cap calls/hr and add delay between']].map(([ic,t,d]) => (
                <div key={t as string} className={styles.howItem}>
                  <span className={styles.howIcon}>{ic}</span>
                  <div><div className={styles.howTitle}>{t}</div><div className={styles.howDesc}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
