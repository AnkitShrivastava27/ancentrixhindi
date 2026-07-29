'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { knowledgeApi } from '@/lib/api'
import { Spinner, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './knowledge.module.css'

const FILE_ICON: Record<string, string> = { pdf:'📄', csv:'📊', docx:'📝', txt:'📃' }
const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  completed:  { color:'#3ecf8e', bg:'rgba(62,207,142,0.1)' },
  processing: { color:'#f5a623', bg:'rgba(245,166,35,0.1)' },
  pending:    { color:'#5a5d70', bg:'rgba(90,93,112,0.1)' },
  failed:     { color:'#f25757', bg:'rgba(242,87,87,0.1)' },
}

export default function KnowledgePage() {
  const [docs, setDocs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag]       = useState(false)
  const [deleting, setDeleting] = useState<string|null>(null)

  const load = useCallback(async () => {
    try { const d: any = await knowledgeApi.list(); setDocs(Array.isArray(d) ? d : []) }
    catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const upload = async (files: File[]) => {
    setUploading(true)
    let ok = 0
    for (const f of files) {
      try { const fd = new FormData(); fd.append('file', f); await knowledgeApi.upload(fd); ok++ }
      catch { toast.error(`Failed: ${f.name}`) }
    }
    if (ok) { toast.success(`${ok} file(s) uploaded`); load() }
    setUploading(false)
  }

  const del = async (id: string) => {
    if (!confirm('Remove this document?')) return
    setDeleting(id)
    try { await knowledgeApi.delete(id); setDocs(d => d.filter(x => x.id !== id)); toast.success('Removed') }
    catch { toast.error('Failed') }
    finally { setDeleting(null) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Knowledge Base</h1>
        <p className={styles.headSub}>Documents the AI uses during calls and emails</p>
      </div>

      {/* Drop zone */}
      <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const files = Array.from(e.dataTransfer.files); if (files.length) upload(files) }}
        className={`${styles.dropZone} ${drag ? styles.dropZoneActive : ''}`}>
        {uploading ? (
          <div className={styles.dropInner}>
            <Spinner size={28} /><p className={styles.uploadingText}>Uploading…</p>
          </div>
        ) : (
          <div className={styles.dropInner}>
            <div className={styles.dropIcon}>◈</div>
            <div className={styles.dropTitle}>{drag ? 'Drop to upload' : 'Drop files here or click Browse'}</div>
            <div className={styles.dropSub}>PDF, TXT, DOCX, CSV · max 50MB</div>
            <label className={styles.browseLabel}>
              <input type="file" multiple accept=".pdf,.txt,.docx,.csv" onChange={e => { const files = Array.from(e.target.files||[]); if(files.length) upload(files) }} style={{ display:'none' }} />
              <span className={styles.browseBtn}>Browse Files</span>
            </label>
          </div>
        )}
      </div>

      {/* Docs list */}
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={styles.panelHeadText}>Documents ({docs.length})</span>
        </div>
        {loading ? (
          <div className={styles.centerPad}><Spinner size={22} /></div>
        ) : docs.length === 0 ? (
          <EmptyState icon="◈" title="No documents yet" description="Upload PDFs, TXT, DOCX or CSV files to power your AI" />
        ) : (
          docs.map((doc, i) => {
            const sm = STATUS_STYLE[doc.status] || STATUS_STYLE.pending
            return (
              <div key={doc.id} className={i < docs.length-1 ? styles.docRow : styles.docRowLast}>
                <div className={styles.docIcon}>
                  {FILE_ICON[doc.file_type]||'📄'}
                </div>
                <div className={styles.docMeta}>
                  <div className={styles.docName}>{doc.filename}</div>
                  <div className={styles.docSubRow}>
                    <span className={styles.docSub}>{fmtSize(doc.file_size||0)}</span>
                    {doc.chunks_count > 0 && <span className={styles.docSub}>{doc.chunks_count} chunks</span>}
                  </div>
                </div>
                <div className={styles.docActions}>
                  {doc.status==='processing' && <Spinner size={12} />}
                  <span className={styles.statusPill} style={{ color:sm.color, background:sm.bg }}>{doc.status}</span>
                  <button onClick={() => del(doc.id)} disabled={deleting===doc.id} className={styles.deleteBtn}>
                    {deleting===doc.id ? <Spinner size={10} /> : '✕'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Tips */}
      <div className={styles.tipsGrid}>
        {[['◈','What to upload','Product catalogs, FAQs, pricing sheets, support docs'],['◉','Best format','Clean PDFs or plain text. CSV tables also work well.'],['⚡','How it works','Docs are chunked, embedded, and retrieved live during calls.']].map(([ic,t,d]) => (
          <div key={t as string} className={styles.tipCard}>
            <div className={styles.tipIcon}>{ic}</div>
            <div className={styles.tipTitle}>{t}</div>
            <div className={styles.tipDesc}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
