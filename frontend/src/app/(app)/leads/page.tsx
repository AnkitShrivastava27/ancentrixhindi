// 'use client'
// import React, { useEffect, useState, useCallback } from 'react'
// import { leadsApi } from '@/lib/api'
// import { Button, Input, Select, Textarea, Tabs, StatusBadge, Spinner, EmptyState, Modal } from '@/components/ui'
// import toast from 'react-hot-toast'

// const S = {
//   row: { display: 'grid', gridTemplateColumns: '1.4fr 130px 110px 60px 100px 36px', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s', cursor: 'pointer' } as React.CSSProperties,
//   hdr: { display: 'grid', gridTemplateColumns: '1.4fr 130px 110px 60px 100px 36px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' } as React.CSSProperties,
//   th: { fontSize: 10, fontWeight: 600, color: '#3a3d4e', textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
// }

// const STATUSES = [
//   { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' },
//   { value: 'interested', label: 'Hot / Interested' }, { value: 'warm', label: 'Warm' },
//   { value: 'cold', label: 'Cold' }, { value: 'closed_won', label: 'Won' },
//   { value: 'closed_lost', label: 'Lost' }, { value: 'do_not_call', label: 'Do Not Call' },
// ]

// function timeAgo(s: string) {
//   const d = Date.now() - new Date(s).getTime()
//   const m = Math.floor(d / 60000)
//   if (m < 60) return `${m}m ago`
//   if (m < 1440) return `${Math.floor(m/60)}h ago`
//   return `${Math.floor(m/1440)}d ago`
// }

// export default function LeadsPage() {
//   const [tab, setTab]         = useState('list')
//   const [leads, setLeads]     = useState<any[]>([])
//   const [total, setTotal]     = useState(0)
//   const [search, setSearch]   = useState('')
//   const [status, setStatus]   = useState('')
//   const [offset, setOffset]   = useState(0)
//   const [loading, setLoading] = useState(true)
//   const [detail, setDetail]   = useState<any>(null)
//   const LIMIT = 25

//   const load = useCallback(async () => {
//     setLoading(true)
//     try {
//       const r: any = await leadsApi.list({ search: search||undefined, status: status||undefined, limit: LIMIT, offset })
//       setLeads(r.leads || []); setTotal(r.total || 0)
//     } catch { toast.error('Failed to load') }
//     finally { setLoading(false) }
//   }, [search, status, offset])

//   useEffect(() => { load() }, [load])

//   const updateStatus = async (id: string, s: string) => {
//     try { await leadsApi.update(id, { status: s }); toast.success('Updated'); load() }
//     catch { toast.error('Failed') }
//   }
//   const deleteLead = async (id: string) => {
//     try { await leadsApi.delete(id); toast.success('Deleted'); load() }
//     catch { toast.error('Failed') }
//   }

//   const pages = Math.ceil(total / LIMIT)
//   const page  = Math.floor(offset / LIMIT) + 1

//   return (
//     <div style={{ maxWidth: 1000 }}>
//       <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
//         <div>
//           <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f0f1f5', margin: 0, letterSpacing: '-0.02em' }}>Leads</h1>
//           <p style={{ fontSize: 13, color: '#5a5d70', marginTop: 3 }}>{total} total leads</p>
//         </div>
//       </div>

//       <Tabs
//         active={tab}
//         onChange={setTab}
//         tabs={[
//           { id: 'list', label: 'All Leads', count: total },
//           { id: 'add',  label: '+ Add Lead' },
//           { id: 'csv',  label: '⬆ Import CSV' },
//         ]}
//       />

//       {/* ── LIST ── */}
//       {tab === 'list' && (
//         <div>
//           {/* Filters */}
//           <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
//             <div style={{ flex: 1, maxWidth: 300 }}>
//               <Input placeholder="Search name, phone, email…" value={search}
//                 onChange={e => { setSearch(e.target.value); setOffset(0) }} />
//             </div>
//             <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }} style={{
//               background: '#181920', border: '1px solid rgba(255,255,255,0.07)',
//               borderRadius: 8, padding: '7px 12px', fontSize: 13, color: status ? '#f0f1f5' : '#5a5d70',
//               outline: 'none', cursor: 'pointer',
//             }}>
//               <option value="">All Statuses</option>
//               {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
//             </select>
//           </div>

//           <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
//             {/* Header */}
//             <div style={S.hdr}>
//               {['Lead', 'Phone', 'Status', 'Calls', 'Last Call', ''].map(h => (
//                 <div key={h} style={S.th}>{h}</div>
//               ))}
//             </div>

//             {loading ? (
//               <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={24} /></div>
//             ) : leads.length === 0 ? (
//               <EmptyState icon="◎" title="No leads found" description="Add leads manually or import a CSV"
//                 action={<Button variant="primary" onClick={() => setTab('add')}>+ Add Lead</Button>} />
//             ) : (
//               leads.map((lead, i) => (
//                 <div key={lead.id}
//                   style={{ ...S.row, background: 'transparent' }}
//                   onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1e1f28' }}
//                   onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
//                   onClick={() => setDetail(lead)}>
//                   {/* Name */}
//                   <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
//                     <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(124,110,255,0.12)', color: '#a594ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
//                       {lead.name?.[0]?.toUpperCase() || '?'}
//                     </div>
//                     <div style={{ minWidth: 0 }}>
//                       <div style={{ fontSize: 13, fontWeight: 500, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
//                       {lead.email && <div style={{ fontSize: 11, color: '#4a4d5e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</div>}
//                     </div>
//                   </div>
//                   {/* Phone */}
//                   <div style={{ fontSize: 12, color: '#6a6d7e', fontFamily: 'monospace' }}>{lead.phone}</div>
//                   {/* Status */}
//                   <div onClick={e => e.stopPropagation()}>
//                     <select value={lead.status} onChange={e => updateStatus(lead.id, e.target.value)}
//                       style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: '#8a8d9e', padding: 0, fontFamily: 'inherit' }}>
//                       {STATUSES.map(s => <option key={s.value} value={s.value} style={{ background: '#181920' }}>{s.label}</option>)}
//                     </select>
//                   </div>
//                   {/* Calls */}
//                   <div style={{ fontSize: 12, color: '#5a5d70', textAlign: 'center' }}>{lead.call_attempts || 0}</div>
//                   {/* Last call */}
//                   <div style={{ fontSize: 11, color: '#4a4d5e' }}>{lead.last_called_at ? timeAgo(lead.last_called_at) : '—'}</div>
//                   {/* Delete */}
//                   <div onClick={e => { e.stopPropagation(); if(confirm('Delete lead?')) deleteLead(lead.id) }}>
//                     <div style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#3a3d4e', transition: 'all 0.1s', fontSize: 12 }}
//                       onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(242,87,87,0.1)'; el.style.color = '#f25757' }}
//                       onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = '#3a3d4e' }}>✕</div>
//                   </div>
//                 </div>
//               ))
//             )}

//             {/* Pagination */}
//             {pages > 1 && (
//               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
//                 <Button size="sm" disabled={page === 1} onClick={() => setOffset(offset - LIMIT)}>← Prev</Button>
//                 <span style={{ fontSize: 12, color: '#5a5d70' }}>Page {page} of {pages}</span>
//                 <Button size="sm" disabled={page === pages} onClick={() => setOffset(offset + LIMIT)}>Next →</Button>
//               </div>
//             )}
//           </div>
//         </div>
//       )}

//       {/* ── ADD ── */}
//       {tab === 'add' && (
//         <AddLeadForm onDone={() => { setTab('list'); load() }} />
//       )}

//       {/* ── CSV ── */}
//       {tab === 'csv' && (
//         <ImportCsvForm onDone={() => { setTab('list'); load() }} />
//       )}

//       {/* Detail modal */}
//       {detail && (
//         <Modal open title={detail.name} onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Close</Button>}>
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//             {[['Phone', detail.phone], ['Email', detail.email||'—'], ['Status', detail.status], ['Language', detail.language||'hinglish'], ['Campaign', detail.campaign_name||'—'], ['Calls', detail.call_attempts||0], ['Interest', detail.interest_level ? `${Math.round(detail.interest_level*100)}%` : '—']].map(([l,v]) => (
//               <div key={l as string} style={{ display: 'flex', gap: 16 }}>
//                 <span style={{ fontSize: 11, color: '#4a4d5e', width: 80, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 2 }}>{l}</span>
//                 <span style={{ fontSize: 13, color: '#c8cad8' }}>{String(v)}</span>
//               </div>
//             ))}
//             {detail.notes && (
//               <div style={{ display: 'flex', gap: 16 }}>
//                 <span style={{ fontSize: 11, color: '#4a4d5e', width: 80, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 2 }}>Notes</span>
//                 <span style={{ fontSize: 13, color: '#c8cad8' }}>{detail.notes}</span>
//               </div>
//             )}
//           </div>
//         </Modal>
//       )}
//     </div>
//   )
// }

// function AddLeadForm({ onDone }: { onDone: () => void }) {
//   const [f, setF] = useState({ name: '', phone: '', email: '', campaign_name: '', language: 'hinglish', notes: '' })
//   const [saving, setSaving] = useState(false)
//   const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

//   const submit = async () => {
//     if (!f.name || !f.phone) { toast.error('Name and phone required'); return }
//     setSaving(true)
//     try { await leadsApi.create(f); toast.success('Lead added!'); onDone() }
//     catch (e: any) { toast.error(e.message || 'Failed') }
//     finally { setSaving(false) }
//   }

//   return (
//     <div style={{ maxWidth: 480 }}>
//       <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
//         <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f1f5' }}>New Lead</div>
//         <Input label="Full Name *" value={f.name} onChange={e => set('name', e.target.value)} />
//         <Input label="Phone *" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
//         <Input label="Email" type="email" value={f.email} onChange={e => set('email', e.target.value)} />
//         <Input label="Campaign" value={f.campaign_name} onChange={e => set('campaign_name', e.target.value)} />
//         <Select label="Language" value={f.language} onChange={e => set('language', e.target.value)}
//           options={[{ value: 'hinglish', label: 'Hinglish' }, { value: 'hindi', label: 'Hindi' }, { value: 'english', label: 'English' }]} />
//         <Textarea label="Notes" value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} />
//         <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
//           <Button onClick={onDone}>Cancel</Button>
//           <Button variant="primary" loading={saving} onClick={submit} style={{ flex: 1, justifyContent: 'center' }}>Add Lead</Button>
//         </div>
//       </div>
//     </div>
//   )
// }

// function ImportCsvForm({ onDone }: { onDone: () => void }) {
//   const [file, setFile] = useState<File | null>(null)
//   const [loading, setLoading] = useState(false)

//   const submit = async () => {
//     if (!file) { toast.error('Select a file'); return }
//     setLoading(true)
//     try {
//       const fd = new FormData(); fd.append('file', file)
//       const r: any = await leadsApi.importCsv(fd)
//       toast.success(`Imported ${r.imported}, skipped ${r.skipped}`); onDone()
//     } catch (e: any) { toast.error(e.message || 'Failed') }
//     finally { setLoading(false) }
//   }

//   return (
//     <div style={{ maxWidth: 480 }}>
//       <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
//         <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f1f5' }}>Import CSV</div>
//         <div style={{ border: '2px dashed rgba(255,255,255,0.08)', borderRadius: 10, padding: '32px 20px', textAlign: 'center' }}>
//           <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>📊</div>
//           <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)}
//             style={{ color: '#8a8d9e', fontSize: 12, width: 'auto', background: 'transparent', border: 'none', padding: 0 }} />
//           {file && <div style={{ fontSize: 12, color: '#3ecf8e', marginTop: 8 }}>✓ {file.name}</div>}
//         </div>
//         <div style={{ background: 'rgba(124,110,255,0.06)', border: '1px solid rgba(124,110,255,0.15)', borderRadius: 8, padding: '10px 14px' }}>
//           <div style={{ fontSize: 11, fontWeight: 600, color: '#a594ff', marginBottom: 4 }}>Required columns</div>
//           <div style={{ fontSize: 12, color: '#5a5d70' }}>name, phone</div>
//           <div style={{ fontSize: 11, color: '#4a4d5e', marginTop: 3 }}>Optional: email, status, language, timezone, notes</div>
//         </div>
//         <div style={{ display: 'flex', gap: 8 }}>
//           <Button onClick={onDone}>Cancel</Button>
//           <Button variant="primary" loading={loading} disabled={!file} onClick={submit} style={{ flex: 1, justifyContent: 'center' }}>Import</Button>
//         </div>
//       </div>
//     </div>
//   )
// }

'use client'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { leadsApi, batchesApi } from '@/lib/api'
import { Button, Input, Select, Textarea, Tabs, StatusBadge, Spinner, EmptyState, Modal } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './leads.module.css'

const STATUSES = [
  { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' },
  { value: 'called', label: '\ud83d\udcf5 Called \u2014 No Answer' },
  { value: 'human_callback_requested', label: '\u260E Wants Human Callback' },
  { value: 'interested', label: 'Hot / Interested' }, { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' }, { value: 'closed_won', label: 'Won' },
  { value: 'closed_lost', label: 'Lost' }, { value: 'do_not_call', label: 'Do Not Call' },
]

function timeAgo(s: string) {
  const d = Date.now() - new Date(s).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m/60)}h ago`
  return `${Math.floor(m/1440)}d ago`
}

export default function LeadsPage() {
  const [tab, setTab]         = useState('list')
  const [leads, setLeads]     = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [offset, setOffset]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail]   = useState<any>(null)
  const LIMIT = 25

  // ── Sorting (by Notes) ──
  const [sortKey, setSortKey] = useState<'notes' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // ── Manual selection for batch creation ──
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBatchModal, setShowBatchModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r: any = await leadsApi.list({ search: search||undefined, status: status||undefined, limit: LIMIT, offset })
      setLeads(r.leads || []); setTotal(r.total || 0)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [search, status, offset])

  useEffect(() => { load() }, [load])

  // Clear selection when the underlying page/filter changes so stale ids don't linger
  useEffect(() => { setSelected(new Set()) }, [search, status, offset])

  const updateStatus = async (id: string, s: string) => {
    try {
      const payload: any = { status: s }
      // When a lead rings out with no pickup, offer to leave a note for
      // whoever tries this lead next — optional, skip with Cancel/blank.
      if (s === 'called') {
        const q = window.prompt('Add a follow-up question/note for the next call attempt (optional):', '')
        if (q && q.trim()) payload.follow_up_question = q.trim()
      }
      await leadsApi.update(id, payload)
      toast.success('Updated')
      load()
    }
    catch { toast.error('Failed') }
  }
  const deleteLead = async (id: string) => {
    try { await leadsApi.delete(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed') }
  }

  // Sort leads so identical Notes values are grouped together. Empty notes always sink to the bottom.
  const sortedLeads = useMemo(() => {
    if (sortKey !== 'notes') return leads
    const copy = [...leads]
    copy.sort((a, b) => {
      const an = (a.notes || '').trim()
      const bn = (b.notes || '').trim()
      if (!an && !bn) return 0
      if (!an) return 1
      if (!bn) return -1
      const cmp = an.localeCompare(bn)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [leads, sortKey, sortDir])

  const toggleNotesSort = () => {
    if (sortKey !== 'notes') { setSortKey('notes'); setSortDir('asc') }
    else if (sortDir === 'asc') { setSortDir('desc') }
    else { setSortKey(null) }
  }

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const allOnPageSelected = sortedLeads.length > 0 && sortedLeads.every(l => selected.has(l.id))
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelected(prev => { const next = new Set(prev); sortedLeads.forEach(l => next.delete(l.id)); return next })
    } else {
      setSelected(prev => { const next = new Set(prev); sortedLeads.forEach(l => next.add(l.id)); return next })
    }
  }

  const pages = Math.ceil(total / LIMIT)
  const page  = Math.floor(offset / LIMIT) + 1

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.headTitle}>Leads</h1>
          <p className={styles.headSub}>{total} total leads</p>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'list', label: 'All Leads', count: total },
          { id: 'add',  label: '+ Add Lead' },
          { id: 'csv',  label: '⬆ Import CSV' },
        ]}
      />

      {/* ── LIST ── */}
      {tab === 'list' && (
        <div>
          {/* Filters */}
          <div className={styles.filtersRow}>
            <div className={styles.searchWrap}>
              <Input placeholder="Search name, phone, email…" value={search}
                onChange={e => { setSearch(e.target.value); setOffset(0) }} />
            </div>
            <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }} className={styles.statusSelect} style={{ color: status ? '#f0f1f5' : '#5a5d70' }}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Bulk selection bar */}
          {selected.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkBarText}>{selected.size} contact{selected.size > 1 ? 's' : ''} selected</span>
              <div className={styles.bulkBarActions}>
                <Button onClick={() => setSelected(new Set())}>Clear</Button>
                <Button variant="primary" onClick={() => setShowBatchModal(true)}>🚀 Create Batch from Selected</Button>
              </div>
            </div>
          )}

          <div className={styles.panel}>
            <div className={`${styles.gridCols} ${styles.rowHead}`}>
              <div onClick={toggleSelectAll} className={styles.checkboxCell}>
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} className={styles.checkbox} />
              </div>
              <div className={styles.rowHeadCell}>Lead</div>
              <div className={styles.rowHeadCell}>Phone</div>
              <div className={styles.rowHeadCell}>Status</div>
              <div className={styles.rowHeadCell}>Calls</div>
              <div className={styles.rowHeadCell}>Last Call</div>
              <div className={`${styles.rowHeadCell} ${styles.rowHeadSortable}`} onClick={toggleNotesSort} title="Sort by notes">
                Notes {sortKey === 'notes' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
              </div>
              <div />
            </div>

            {loading ? (
              <div className={styles.centerPad}><Spinner size={24} /></div>
            ) : sortedLeads.length === 0 ? (
              <EmptyState icon="◎" title="No leads found" description="Add leads manually or import a CSV"
                action={<Button variant="primary" onClick={() => setTab('add')}>+ Add Lead</Button>} />
            ) : (
              sortedLeads.map((lead) => (
                <div key={lead.id}
                  className={`${styles.gridCols} ${styles.row} ${selected.has(lead.id) ? styles.rowSelected : ''}`}
                  onClick={() => setDetail(lead)}>
                  {/* Select */}
                  <div onClick={e => { e.stopPropagation(); toggleSelect(lead.id) }} className={styles.checkboxCell}>
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} onClick={e => e.stopPropagation()} className={styles.checkbox} />
                  </div>
                  {/* Name */}
                  <div className={styles.nameCell}>
                    <div className={styles.avatar}>
                      {lead.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className={styles.nameMeta}>
                      <div className={styles.leadName}>{lead.name}</div>
                      {lead.email && <div className={styles.leadEmail}>{lead.email}</div>}
                    </div>
                  </div>
                  {/* Phone */}
                  <div className={styles.phoneCell}>{lead.phone}</div>
                  {/* Status */}
                  <div onClick={e => e.stopPropagation()}>
                    <select value={lead.status} onChange={e => updateStatus(lead.id, e.target.value)} className={styles.statusSelectInline}>
                      {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  {/* Calls */}
                  <div className={styles.callsCell}>{lead.call_attempts || 0}</div>
                  {/* Last call */}
                  <div className={styles.lastCallCell}>{lead.last_called_at ? timeAgo(lead.last_called_at) : '—'}</div>
                  {/* Notes (shows follow-up question first if this lead rang out unanswered) */}
                  <div className={styles.notesCell} style={{ color: lead.notes || lead.follow_up_question ? '#8a8d9e' : '#3a3d4e' }}
                       title={lead.follow_up_question ? `Follow-up: ${lead.follow_up_question}` : (lead.notes || '')}>
                    {lead.follow_up_question ? `\u21bb ${lead.follow_up_question}` : (lead.notes || '—')}
                  </div>
                  {/* Delete */}
                  <div onClick={e => { e.stopPropagation(); if(confirm('Delete lead?')) deleteLead(lead.id) }}>
                    <div className={styles.deleteBtn}>✕</div>
                  </div>
                </div>
              ))
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div className={styles.pager}>
                <Button size="sm" disabled={page === 1} onClick={() => setOffset(offset - LIMIT)}>← Prev</Button>
                <span className={styles.pagerText}>Page {page} of {pages}</span>
                <Button size="sm" disabled={page === pages} onClick={() => setOffset(offset + LIMIT)}>Next →</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD ── */}
      {tab === 'add' && (
        <AddLeadForm onDone={() => { setTab('list'); load() }} />
      )}

      {/* ── CSV ── */}
      {tab === 'csv' && (
        <ImportCsvForm onDone={() => { setTab('list'); load() }} />
      )}

      {/* Detail modal */}
      {detail && (
        <Modal open title={detail.name} onClose={() => setDetail(null)}>
          <div className={styles.detailStack}>
            {[['Phone', detail.phone], ['Email', detail.email||'—'], ['Status', detail.status], ['Language', detail.language||'hinglish'], ['Campaign', detail.campaign_name||'—'], ['Calls', detail.call_attempts||0], ['Interest', detail.interest_level ? `${Math.round(detail.interest_level*100)}%` : '—']].map(([l,v]) => (
              <div key={l as string} className={styles.detailRow}>
                <span className={styles.detailLabel}>{l}</span>
                <span className={styles.detailValue}>{String(v)}</span>
              </div>
            ))}
            {detail.notes && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Notes</span>
                <span className={styles.detailValue}>{detail.notes}</span>
              </div>
            )}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Follow-up</span>
              <span className={detail.follow_up_question ? styles.detailValueFlex : styles.detailValueDim}>
                {detail.follow_up_question || 'No follow-up note set — add one for the next call attempt'}
              </span>
              <button onClick={async () => {
                const q = window.prompt('Follow-up question/note for the next call attempt:', detail.follow_up_question || '')
                if (q === null) return
                try {
                  await leadsApi.update(detail.id, { follow_up_question: q.trim() })
                  toast.success('Saved')
                  setDetail({ ...detail, follow_up_question: q.trim() })
                  load()
                } catch { toast.error('Failed') }
              }} className={styles.editLink}>
                Edit
              </button>
            </div>
            <div className={styles.detailFooter}>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create batch from selected leads */}
      {showBatchModal && (
        <CreateBatchFromSelectedModal
          selectedIds={Array.from(selected)}
          onClose={() => setShowBatchModal(false)}
          onDone={() => { setShowBatchModal(false); setSelected(new Set()) }}
        />
      )}
    </div>
  )
}

function CreateBatchFromSelectedModal({ selectedIds, onClose, onDone }: { selectedIds: string[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [batchType, setBatchType] = useState<'voice' | 'email'>('voice')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name) { toast.error('Batch name required'); return }
    setSaving(true)
    try {
      const b: any = await batchesApi.create({
        name,
        batch_type: batchType,
        call_mode: 'sales',
        filter_criteria: { lead_ids: selectedIds },
      })
      toast.success(`Batch created — ${b.lead_count ?? selectedIds.length} leads`)
      onDone()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create batch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title="Create Batch" onClose={onClose}>
      <div className={styles.formCard} style={{ background: 'none', border: 'none', padding: 0 }}>
        <div className={styles.formSubText}>{selectedIds.length} contact{selectedIds.length > 1 ? 's' : ''} selected</div>
        <Input label="Batch Name *" value={name} onChange={e => setName(e.target.value)} />
        <div>
          <label className={styles.formLabel}>Type</label>
          <div className={styles.typeRow}>
            {[{ v: 'voice', l: '📞 Voice' }, { v: 'email', l: '✉️ Email' }].map(t => (
              <button key={t.v} onClick={() => setBatchType(t.v as 'voice' | 'email')} className={`${styles.typeBtn} ${batchType === t.v ? styles.typeBtnActive : ''}`}>{t.l}</button>
            ))}
          </div>
        </div>
        <div className={styles.formActions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit} style={{ flex: 1, justifyContent: 'center' }}>🚀 Create Batch</Button>
        </div>
      </div>
    </Modal>
  )
}

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', campaign_name: '', language: 'hinglish', notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!f.name || !f.phone) { toast.error('Name and phone required'); return }
    setSaving(true)
    try { await leadsApi.create(f); toast.success('Lead added!'); onDone() }
    catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className={styles.smallForm}>
      <div className={styles.formCard}>
        <div className={styles.formTitle}>New Lead</div>
        <Input label="Full Name *" value={f.name} onChange={e => set('name', e.target.value)} />
        <Input label="Phone *" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
        <Input label="Email" type="email" value={f.email} onChange={e => set('email', e.target.value)} />
        <Input label="Campaign" value={f.campaign_name} onChange={e => set('campaign_name', e.target.value)} />
        <Select label="Language" value={f.language} onChange={e => set('language', e.target.value)}
          options={[{ value: 'hinglish', label: 'Hinglish' }, { value: 'hindi', label: 'Hindi' }, { value: 'english', label: 'English' }]} />
        <Textarea label="Notes" value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} />
        <div className={styles.formActions}>
          <Button onClick={onDone}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit} style={{ flex: 1, justifyContent: 'center' }}>Add Lead</Button>
        </div>
      </div>
    </div>
  )
}

function ImportCsvForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!file) { toast.error('Select a file'); return }
    setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r: any = await leadsApi.importCsv(fd)
      toast.success(`Imported ${r.imported}, skipped ${r.skipped}`); onDone()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className={styles.smallForm}>
      <div className={styles.formCardGap16}>
        <div className={styles.formTitle}>Import CSV</div>
        <div className={styles.dropBox}>
          <div className={styles.dropBoxIcon}>📊</div>
          <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)}
            className={styles.fileInput} />
          {file && <div className={styles.fileOk}>✓ {file.name}</div>}
        </div>
        <div className={styles.infoBox}>
          <div className={styles.infoBoxTitle}>Required columns</div>
          <div className={styles.infoBoxText}>name, phone</div>
          <div className={styles.infoBoxSub}>Optional: email, status, language, timezone, notes</div>
        </div>
        <div className={styles.formActions} style={{ paddingTop: 0 }}>
          <Button onClick={onDone}>Cancel</Button>
          <Button variant="primary" loading={loading} disabled={!file} onClick={submit} style={{ flex: 1, justifyContent: 'center' }}>Import</Button>
        </div>
      </div>
    </div>
  )
}