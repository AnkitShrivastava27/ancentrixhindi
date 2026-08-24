'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { appointmentsApi, companyApi, leadsApi } from '@/lib/api'
import { Spinner, EmptyState, Tabs, Button } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './appointments.module.css'

const fmtDate = (v: string) => new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
const fmtTime = (v: string) => new Date(v).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })

export default function AppointmentsPage() {
  const [items, setItems] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({ lead_id:'', appointment_type:'site_visit', product:'', location:'', date:'', time:'', duration_minutes:30, notes:'' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r:any = await appointmentsApi.list({ status: status || undefined })
      setItems(r.appointments || [])
    } catch { toast.error('Failed to load appointments') }
    finally { setLoading(false) }
  }, [status])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    ;(async () => {
      try {
        const [l, c]: any = await Promise.all([leadsApi.list({ limit: 500 }), companyApi.get()])
        setLeads(l.leads || l.items || [])
        setCompany(c)
      } catch {}
    })()
  }, [])

  const selectedLead = useMemo(() => leads.find(l => l.id === form.lead_id), [leads, form.lead_id])
  const products = company?.products || []

  const schedule = async () => {
    if (!form.lead_id || !form.date || !form.time) { toast.error('Lead, date and time are required'); return }
    setSaving(true)
    try {
      await appointmentsApi.create({
        lead_id: form.lead_id,
        appointment_type: form.appointment_type,
        product: form.product || null,
        location: form.location || null,
        scheduled_at: new Date(`${form.date}T${form.time}:00`).toISOString(),
        duration_minutes: Number(form.duration_minutes) || 30,
        notes: form.notes || null,
        status: 'confirmed',
      })
      toast.success('Appointment scheduled manually')
      setShowForm(false)
      setForm({ lead_id:'', appointment_type:'site_visit', product:'', location:'', date:'', time:'', duration_minutes:30, notes:'' })
      load()
    } catch (e:any) { toast.error(e?.message || 'Failed to schedule appointment') }
    finally { setSaving(false) }
  }

  const cancel = async (id: string) => {
    try { await appointmentsApi.cancel(id); toast.success('Appointment cancelled'); load() }
    catch { toast.error('Failed to cancel appointment') }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div><h1 className={styles.title}>Appointments</h1><p className={styles.sub}>Admin-managed site visits, meetings, demos and callbacks</p></div>
        <Button variant="primary" onClick={() => setShowForm(v => !v)}>+ Schedule Manually</Button>
      </div>

      {showForm && (
        <div className={styles.panel} style={{marginBottom:20}}>
          <div style={{padding:'18px 20px',borderBottom:'1px solid rgba(255,255,255,.08)'}}><strong>Schedule appointment manually</strong><div className={styles.sub}>The AI never books a slot. Admin confirms the actual appointment here.</div></div>
          <div style={{padding:20,display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:14}}>
            <label>Lead<select value={form.lead_id} onChange={e => setForm({...form,lead_id:e.target.value})}><option value="">Select lead</option>{leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>)}</select></label>
            <label>Type<select value={form.appointment_type} onChange={e => setForm({...form,appointment_type:e.target.value})}><option value="site_visit">Site Visit</option><option value="office_meeting">Office Meeting</option><option value="product_demo">Product Demo</option><option value="callback">Callback</option><option value="other">Other</option></select></label>
            <label>Product/service<select value={form.product} onChange={e => setForm({...form,product:e.target.value})}><option value="">Not specified</option>{products.map((p:any) => <option key={p.name} value={p.name}>{p.name_hi || p.name}</option>)}</select></label>
            <label>Location<input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="Site / office address" /></label>
            <label>Date<input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} /></label>
            <label>Time<input type="time" value={form.time} onChange={e => setForm({...form,time:e.target.value})} /></label>
            <label>Duration (minutes)<input type="number" min={5} max={480} value={form.duration_minutes} onChange={e => setForm({...form,duration_minutes:e.target.value})} /></label>
            <label>Notes<textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder={selectedLead ? `Notes for ${selectedLead.name}` : 'Admin notes'} /></label>
          </div>
          <div style={{padding:'0 20px 20px',display:'flex',gap:10}}><Button variant="primary" loading={saving} onClick={schedule}>Schedule Appointment</Button><Button onClick={() => setShowForm(false)}>Cancel</Button></div>
        </div>
      )}

      <div className={styles.tabs}><Tabs active={status || 'all'} onChange={v => setStatus(v === 'all' ? '' : v)} tabs={[{id:'all',label:'All'}, {id:'confirmed',label:'Confirmed'}, {id:'pending',label:'Pending'}, {id:'completed',label:'Completed'}, {id:'cancelled',label:'Cancelled'}, {id:'no_show',label:'No-show'}]} /></div>
      <div className={styles.panel}>
        <div className={styles.headerRow}><span>Lead</span><span>Type</span><span>Product</span><span>Date</span><span>Time</span><span>Status</span><span>Created by</span><span></span></div>
        {loading ? <div className={styles.empty}><Spinner size={24}/></div> : items.length === 0 ? <EmptyState icon="▣" title="No appointments" description="AI follow-up requests and manually scheduled appointments will appear here."/> : items.map(a => (
          <div className={styles.row} key={a.id}>
            <div><div className={styles.lead}>{a.lead_name || 'Unknown lead'}</div><div className={styles.phone}>{a.lead_phone || ''}</div></div>
            <div className={styles.muted}>{({site_visit:'Site Visit',office_meeting:'Office Meeting',product_demo:'Product Demo',callback:'Callback',other:'Other'} as any)[a.appointment_type] || a.appointment_type}</div>
            <div className={styles.muted}>{a.product || '—'}</div>
            <div className={styles.muted}>{fmtDate(a.scheduled_at)}</div><div className={styles.muted}>{fmtTime(a.scheduled_at)}</div>
            <div><span className={`${styles.pill} ${styles[a.status] || ''}`}>{a.status}</span></div>
            <div className={styles.muted}>{a.created_by === 'ai' ? '🤖 AI' : 'Admin'}</div>
            <div>{['confirmed','pending'].includes(a.status) && <button className={styles.cancel} onClick={() => cancel(a.id)}>Cancel</button>}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
