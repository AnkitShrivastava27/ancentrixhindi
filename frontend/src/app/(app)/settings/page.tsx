'use client'
import React, { useEffect, useState } from 'react'
import { companyApi, authApi } from '@/lib/api'
import { Button, Input, Textarea, Select, Spinner, Tabs } from '@/components/ui'
import toast from 'react-hot-toast'
import styles from './settings.module.css'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [isNew, setIsNew]     = useState(false)
  const [tab, setTab]         = useState('company')
  const [f, setF] = useState({
    name:'', industry:'', description:'', description_hi:'', services:'', services_hi:'', faqs:'', faqs_hi:'', location:'', contact_number:'', forward_number:'', website:'',
    agent_name:'Aria', voice_gender:'female', voice_language:'hi-IN', tts_provider:'vobiz',
    greeting_inbound:'', greeting_outbound:'', greeting_inbound_hi:'', greeting_outbound_hi:'',
    inbound_system_prompt:'', outbound_sales_prompt:'',
    vobiz_auth_id:'', vobiz_auth_token:'', vobiz_phone_number:'',
    email_from_address:'', email_from_name:'', email_reply_to:'', email_signature:'',
    active_product:'',
    business_hours:{} as Record<string,string>,
    products:[] as any[],
  })

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)

  const changePassword = async () => {
    if (pw.next.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (!/[a-zA-Z]/.test(pw.next) || !/[0-9]/.test(pw.next)) { toast.error('New password must contain a letter and a number'); return }
    if (pw.next !== pw.confirm) { toast.error('New passwords do not match'); return }
    setPwSaving(true)
    try {
      await authApi.changePassword({ current_password: pw.current, new_password: pw.next })
      toast.success('Password updated')
      setPw({ current: '', next: '', confirm: '' })
    } catch (e: any) {
      toast.error(e.message || 'Failed to update password')
    } finally {
      setPwSaving(false)
    }
  }

  useEffect(() => {
    ;(async () => {
      try { const d: any = await companyApi.get(); if (d) setF(p => ({ ...p, ...d, products:d.products||[] })); else setIsNew(true) }
      catch { setIsNew(true) }
      finally { setLoading(false) }
    })()
  }, [])

  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      if (isNew) { await companyApi.create(f); setIsNew(false); toast.success('Company created!') }
      else { await companyApi.update(f); toast.success('Saved!') }
    } catch (e: any) { toast.error(e.message||'Failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className={styles.loadingWrap}><Spinner size={28} /></div>

  const card = (children: React.ReactNode, title?: string) => (
    <div className={styles.card}>
      {title && <div className={styles.cardHead}>{title}</div>}
      <div className={styles.cardBody}>{children}</div>
    </div>
  )
  const grid2 = (a: React.ReactNode, b: React.ReactNode) => (
    <div className={styles.grid2}>{a}{b}</div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Settings</h1>
        <p className={styles.headSub}>Company profile, AI agent, telephony, and prompts</p>
      </div>

      {isNew && (
        <div className={styles.welcomeBanner}>
          👋 Welcome! Fill in your company details and click Save to get started.
        </div>
      )}

      <Tabs active={tab} onChange={setTab}
        tabs={[{ id:'company', label:'Company' }, { id:'agent', label:'AI Agent' }, { id:'products', label:'Products' }, { id:'telephony', label:'Telephony' }, { id:'prompts', label:'Prompts' }, { id:'security', label:'Security' }]} />

      {tab === 'company' && card(<>
        {grid2(
          <Input label="Company Name *" value={f.name} onChange={e => set('name', e.target.value)} />,
          <Input label="Industry" value={f.industry} onChange={e => set('industry', e.target.value)} placeholder="SaaS, Real Estate…" />
        )}
        <Textarea label="Description" value={f.description_hi} onChange={e => set('description_hi', e.target.value)} rows={3} placeholder="Hindi/Hinglish — what your company does…" />
        <Textarea label="Services" value={f.services_hi} onChange={e => set('services_hi', e.target.value)} rows={3} />
        <Textarea label="FAQs" value={f.faqs_hi} onChange={e => set('faqs_hi', e.target.value)} rows={4} placeholder={"Q: Aapke office ka time kya hai?\nA: Mon–Sat subah 9 se shaam 6"} />
        {grid2(
          <Input label="Location" value={f.location} onChange={e => set('location', e.target.value)} placeholder="Mumbai, India" />,
          <Input label="Website" value={f.website} onChange={e => set('website', e.target.value)} placeholder="https://…" />
        )}
        {grid2(
          <Input label="Contact Number" value={f.contact_number} onChange={e => set('contact_number', e.target.value)} />,
          <Input label="Fallback Transfer Number" value={f.forward_number} onChange={e => set('forward_number', e.target.value)} />
        )}
        <div>
          <div className={styles.hoursLabel}>Business Hours</div>
          <div className={styles.hoursList}>
            {DAYS.map(day => (
              <div key={day} className={styles.hoursRow}>
                <span className={styles.hoursDay}>{day}</span>
                <input value={f.business_hours?.[day]||''} onChange={e => setF(p => ({ ...p, business_hours:{ ...p.business_hours, [day]:e.target.value } }))}
                  placeholder="9:00 AM – 6:00 PM  or  Closed"
                  className={styles.hoursInput} />
              </div>
            ))}
          </div>
        </div>
      </>)}

      {tab === 'agent' && card(<>
        <Input label="Agent Name" value={f.agent_name} onChange={e => set('agent_name', e.target.value)} placeholder="Aria" />
        <div className={styles.grid2}>
          <Select label="Voice Gender" value={f.voice_gender} onChange={e => set('voice_gender', e.target.value)}
            options={[{ value:'female', label:'Female' }, { value:'male', label:'Male' }]} />
          <Select label="TTS Provider" value={f.tts_provider} onChange={e => set('tts_provider', e.target.value)}
            options={[{ value:'sarvam', label:'Sarvam AI (Hindi/Hinglish — recommended)' },{ value:'vobiz', label:'Vobiz (native Speak)' }, { value:'gtts', label:'gTTS (fallback)' }]} />
        </div>
        <p className={styles.smallNote}>Calls are always Hindi/Hinglish via Vobiz's native voices.</p>
        <div className={styles.subLabel}>🇮🇳 Greetings (Hindi/Hinglish)</div>
        <Textarea label="Inbound Greeting" value={f.greeting_inbound_hi} onChange={e => set('greeting_inbound_hi', e.target.value)} rows={2}
          placeholder={`Namaste! Main ${f.agent_name} hoon, ${f.name||'your company'} se…`} />
        <Textarea label="Outbound Greeting" value={f.greeting_outbound_hi} onChange={e => set('greeting_outbound_hi', e.target.value)} rows={2}
          placeholder="Namaste {lead_name} ji! Main {agent_name} bol raha hoon…" />
      </>)}

      {tab === 'products' && <>
        {card(<>
          <p className={styles.helperText}>Add your products below. The AI references these during calls and emails.</p>
          <Input label="Active Product to Pitch" value={f.active_product} onChange={e => set('active_product', e.target.value)} placeholder="Must match a product name below" />
        </>, 'Catalogue')}

        {f.products.map((p, i) => (
          <div key={i} className={styles.productCard}>
            <div className={styles.productHead}>
              <span className={styles.productHeadTitle}>Product {i+1}: {p.name_hi || p.name || 'Unnamed'}</span>
              <button onClick={() => set('products', f.products.filter((_: any, idx: number) => idx !== i))} className={styles.productRemoveBtn}>Remove</button>
            </div>
            <div className={styles.productBody}>
              {grid2(
                // Backend requires `name` (plain string) and also matches
                // "Active Product to Pitch" + builds the AI's outbound
                // sales prompt off `name`/`description`, not the _hi
                // variants (see llm_service.build_outbound_prompt). This
                // form only shows one Hindi/Hinglish-labeled input, so we
                // mirror every keystroke into both fields — otherwise
                // saving 422s (name/description missing) and, even if
                // that were relaxed, the AI would pitch a blank product.
                <Input label="Name *" value={p.name_hi||''} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, name_hi:e.target.value, name:e.target.value} : x))} placeholder="Namaste Package" />,
                <Input label="Price" value={p.price} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, price:e.target.value} : x))} placeholder="₹999/month" />
              )}
              <Textarea label="Description" value={p.description_hi||''} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, description_hi:e.target.value, description:e.target.value} : x))} rows={2} placeholder="Hindi/Hinglish — used on Vobiz calls" />
              <Input label="Features (comma separated)"
                value={Array.isArray(p.features_hi) ? p.features_hi.join(', ') : ''}
                onChange={e => { const feats = e.target.value.split(',').map((s: string) => s.trim()); set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, features_hi:feats, features:feats} : x)) }}
                placeholder="Feature 1, Feature 2, Feature 3" />
            </div>
          </div>
        ))}
        <button onClick={() => set('products', [...f.products, { name:'', name_hi:'', description:'', description_hi:'', price:'', features:[], features_hi:[] }])}
          className={styles.addProductBtn}>
          + Add Product
        </button>
      </>}

      {tab === 'telephony' && <>
        {card(<>
          <Input label="Vobiz Auth ID" value={f.vobiz_auth_id} onChange={e => set('vobiz_auth_id', e.target.value)} placeholder="From your Vobiz dashboard" />
          <Input label="Vobiz Auth Token" type="password" value={f.vobiz_auth_token} onChange={e => set('vobiz_auth_token', e.target.value)} placeholder="From your Vobiz dashboard" />
          <Input label="Vobiz Phone Number" value={f.vobiz_phone_number} onChange={e => set('vobiz_phone_number', e.target.value)} placeholder="+91XXXXXXXXXX" />
          <div className={styles.infoBox}>
            <div className={styles.infoBoxTitle}>No webhook URL to configure</div>
            <div className={styles.infoBoxText}>Vobiz doesn't need a static webhook registered in their dashboard — the answer/hangup URLs are sent automatically with every call.</div>
          </div>
        </>, 'Vobiz — sole telephony provider')}
        {card(<>
          {grid2(
            <Input label="From Email" value={f.email_from_address} onChange={e => set('email_from_address', e.target.value)} placeholder="hello@yourdomain.com" />,
            <Input label="From Name" value={f.email_from_name} onChange={e => set('email_from_name', e.target.value)} placeholder="AI Sales Team" />
          )}
          <Input label="Reply-To" value={f.email_reply_to} onChange={e => set('email_reply_to', e.target.value)} placeholder="replies@yourdomain.com" />
          <Textarea label="Email Signature" value={f.email_signature} onChange={e => set('email_signature', e.target.value)} rows={3} placeholder={"Best regards,\nAria\nAI Sales Executive"} />
        </>, 'Email (SendGrid)')}
      </>}

      {tab === 'prompts' && card(<>
        <p className={styles.helperText}>Leave blank to use auto-generated prompts. Custom prompts override defaults entirely.</p>
        <Textarea label="Inbound Support Prompt" value={f.inbound_system_prompt} onChange={e => set('inbound_system_prompt', e.target.value)} rows={9}
          placeholder={"You are {agent_name}, support agent at {company_name}.\nKnowledge: {rag_context}\n\n[Your custom instructions…]"} />
        <Textarea label="Outbound Sales Prompt" value={f.outbound_sales_prompt} onChange={e => set('outbound_sales_prompt', e.target.value)} rows={9}
          placeholder={"You are {agent_name}, sales executive at {company_name}.\nProduct: {product_info}\nLead: {lead_name}\n\n[Your custom instructions…]"} />
      </>, 'Custom Prompts')}

      {tab === 'security' && card(<>
        <p className={styles.helperText}>
          Locked out? There's no self-serve password reset by design (no email system) — contact your admin to reset it, then come back here to set a new one.
        </p>
        <Input label="Current Password" type="password" value={pw.current}
          onChange={e => setPw(p => ({ ...p, current: e.target.value }))} placeholder="••••••••" />
        <Input label="New Password" type="password" value={pw.next}
          onChange={e => setPw(p => ({ ...p, next: e.target.value }))} placeholder="At least 8 characters, one letter and one number" />
        <Input label="Confirm New Password" type="password" value={pw.confirm}
          onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" />
        <div className={styles.footerRow}>
          <Button variant="primary" loading={pwSaving} onClick={changePassword}>
            Update Password
          </Button>
        </div>
      </>, 'Change Password')}

      {tab !== 'security' && (
        <div className={styles.footerRow}>
          <Button variant="primary" size="lg" loading={saving} onClick={save}>
            {isNew ? '🚀 Create Company' : '💾 Save Settings'}
          </Button>
        </div>
      )}
    </div>
  )
}