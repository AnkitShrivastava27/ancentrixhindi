'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { companyApi, knowledgeApi } from '@/lib/api'
import { Spinner, EmptyState, Input, Textarea, Tabs } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './knowledge.module.css'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const FILE_ICON: Record<string,string> = { pdf:'📄', csv:'📊', docx:'📝', txt:'📃' }
const fmtSize = (b:number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`

const defaults = {
  office_address:'', city:'', state:'', country:'India', service_areas:[] as string[], languages:['Hindi','English','Hinglish'] as string[],
  appointments:{ enabled:true, site_visits:true, office_meetings:true, days:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], start_time:'09:00', end_time:'18:00', duration_minutes:30, max_per_slot:1, minimum_notice_hours:2, site_visit_locations:[] as string[], cancellation_policy:'', rescheduling_policy:'' },
  policies:{ consultation_fee:'', payment_policy:'', documents_required:'', human_transfer_available:true },
  additional_notes:''
}

export default function KnowledgePage() {
  const [company, setCompany] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [tab, setTab] = useState('business')
  const [k, setK] = useState<any>(defaults)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c,d]:any[] = await Promise.all([companyApi.get(), knowledgeApi.list()])
      setCompany(c)
      setK({ ...defaults, ...(c?.business_knowledge || {}), appointments:{...defaults.appointments, ...(c?.business_knowledge?.appointments || {})}, policies:{...defaults.policies, ...(c?.business_knowledge?.policies || {})} })
      setDocs(Array.isArray(d) ? d : [])
    } catch { toast.error('Failed to load knowledge') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (key:string, value:any) => setK((p:any) => ({...p,[key]:value}))
  const setAppt = (key:string, value:any) => setK((p:any) => ({...p, appointments:{...p.appointments,[key]:value}}))
  const setPolicy = (key:string, value:any) => setK((p:any) => ({...p, policies:{...p.policies,[key]:value}}))

  const save = async () => {
    if (!company?.name) { toast.error('Create the company first in Settings'); return }
    setSaving(true)
    try { await companyApi.update({ business_knowledge:k }); toast.success('Business knowledge saved') }
    catch(e:any){ toast.error(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const upload = async (files:File[]) => {
    setUploading(true); let ok=0
    for(const f of files){ try { const fd=new FormData(); fd.append('file',f); await knowledgeApi.upload(fd); ok++ } catch { toast.error(`Failed: ${f.name}`) } }
    if(ok){toast.success(`${ok} file(s) uploaded`); load()}; setUploading(false)
  }
  const del = async(id:string) => { if(!confirm('Remove this document?'))return; try{await knowledgeApi.delete(id);setDocs(d=>d.filter(x=>x.id!==id));toast.success('Removed')}catch{toast.error('Failed')} }

  if(loading) return <div className={styles.loading}><Spinner size={28}/></div>
  const toggleDay = (day:string) => setAppt('days', k.appointments.days.includes(day) ? k.appointments.days.filter((x:string)=>x!==day) : [...k.appointments.days,day])

  return <div className={styles.page}>
    <div className={styles.head}><div><h1 className={styles.title}>Knowledge</h1><p className={styles.sub}>Structured facts are authoritative; documents remain optional supporting knowledge.</p></div><button className={styles.save} disabled={saving} onClick={save}>{saving?'Saving…':'Save Knowledge'}</button></div>
    <Tabs active={tab} onChange={setTab} tabs={[{id:'business',label:'Business'}, {id:'appointments',label:'Meetings & Site Visits'}, {id:'policies',label:'Policies'}, {id:'documents',label:'Documents'}]} />

    {tab==='business' && <div className={styles.card}>
      <h2>Company information</h2>
      <div className={styles.grid2}><Input label="Office Address" value={k.office_address} onChange={e=>set('office_address',e.target.value)} placeholder="Full address"/><Input label="City" value={k.city} onChange={e=>set('city',e.target.value)}/></div>
      <div className={styles.grid2}><Input label="State" value={k.state} onChange={e=>set('state',e.target.value)}/><Input label="Country" value={k.country} onChange={e=>set('country',e.target.value)}/></div>
      <Textarea label="Cities / areas where you operate" value={k.service_areas.join(', ')} onChange={e=>set('service_areas',e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean))} rows={2} placeholder="Delhi, Gurgaon, Noida"/>
      <Textarea label="Languages your team supports" value={k.languages.join(', ')} onChange={e=>set('languages',e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean))} rows={2}/>
      <Textarea label="Additional facts the AI may need" value={k.additional_notes} onChange={e=>set('additional_notes',e.target.value)} rows={5} placeholder="Payment methods, escalation rules, service boundaries, important do-not-say facts…"/>
    </div>}

    {tab==='appointments' && <div className={styles.card}>
      <h2>Appointment rules</h2>
      <div className={styles.checkGrid}>
        {([['enabled','Appointments available'],['site_visits','Site visits available'],['office_meetings','Office meetings available']] as any[]).map(([key,label])=><label key={key} className={styles.check}><input type="checkbox" checked={!!k.appointments[key]} onChange={e=>setAppt(key,e.target.checked)}/>{label}</label>)}
      </div>
      <div className={styles.days}><span className={styles.label}>Available days</span>{DAYS.map(d=><button type="button" key={d} onClick={()=>toggleDay(d)} className={`${styles.day} ${k.appointments.days.includes(d)?styles.dayOn:''}`}>{d.slice(0,3)}</button>)}</div>
      <div className={styles.grid4}><Input label="Start" value={k.appointments.start_time} onChange={e=>setAppt('start_time',e.target.value)}/><Input label="End" value={k.appointments.end_time} onChange={e=>setAppt('end_time',e.target.value)}/><Input label="Duration (min)" type="number" value={k.appointments.duration_minutes} onChange={e=>setAppt('duration_minutes',Number(e.target.value))}/><Input label="Max / slot" type="number" value={k.appointments.max_per_slot} onChange={e=>setAppt('max_per_slot',Number(e.target.value))}/></div>
      <Input label="Minimum booking notice (hours)" type="number" value={k.appointments.minimum_notice_hours} onChange={e=>setAppt('minimum_notice_hours',Number(e.target.value))}/>
      <Textarea label="Site visit locations" value={k.appointments.site_visit_locations.join(', ')} onChange={e=>setAppt('site_visit_locations',e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean))} rows={2} placeholder="Property locations or areas"/>
      <div className={styles.grid2}><Textarea label="Cancellation policy" value={k.appointments.cancellation_policy} onChange={e=>setAppt('cancellation_policy',e.target.value)} rows={3}/><Textarea label="Rescheduling policy" value={k.appointments.rescheduling_policy} onChange={e=>setAppt('rescheduling_policy',e.target.value)} rows={3}/></div>
    </div>}

    {tab==='policies' && <div className={styles.card}>
      <h2>Operational policies</h2>
      <Textarea label="Consultation / service charges" value={k.policies.consultation_fee} onChange={e=>setPolicy('consultation_fee',e.target.value)} rows={2}/>
      <Textarea label="Payment policy" value={k.policies.payment_policy} onChange={e=>setPolicy('payment_policy',e.target.value)} rows={3}/>
      <Textarea label="Documents normally required" value={k.policies.documents_required} onChange={e=>setPolicy('documents_required',e.target.value)} rows={3}/>
      <label className={styles.check}><input type="checkbox" checked={!!k.policies.human_transfer_available} onChange={e=>setPolicy('human_transfer_available',e.target.checked)}/> Human transfer is available</label>
    </div>}

    {tab==='documents' && <>
      <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const fs=Array.from(e.dataTransfer.files);if(fs.length)upload(fs)}} className={`${styles.drop} ${drag?styles.dropOn:''}`}>
        {uploading?<><Spinner size={26}/><p>Uploading…</p></>:<><div className={styles.dropIcon}>◈</div><strong>Drop documents here or browse</strong><span>PDF, TXT, DOCX, CSV · supporting knowledge only</span><label className={styles.browse}><input hidden type="file" multiple accept=".pdf,.txt,.docx,.csv" onChange={e=>{const fs=Array.from(e.target.files||[]);if(fs.length)upload(fs)}}/><span>Browse Files</span></label></>}
      </div>
      <div className={styles.card}><h2>Documents ({docs.length})</h2>{docs.length===0?<EmptyState icon="◈" title="No documents" description="Upload brochures, detailed FAQs, policies and other long-form material."/>:docs.map(d=><div className={styles.doc} key={d.id}><span className={styles.fileIcon}>{FILE_ICON[d.file_type]||'📄'}</span><div className={styles.docMeta}><b>{d.filename}</b><span>{fmtSize(d.file_size||0)} · {d.status}</span></div><button className={styles.remove} onClick={()=>del(d.id)}>✕</button></div>)}</div>
    </>}
  </div>
}
