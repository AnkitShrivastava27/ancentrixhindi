'use client'
import React from 'react'
import styles from './ui.module.css'

const T = {
  surface: '#131520', card: '#171926', hover: '#1e2130',
  border: 'rgba(255,255,255,0.08)', border2: 'rgba(255,255,255,0.14)',
  text: '#f4f4f7', text2: '#9799ab', text3: '#5c5f72',
  accent: '#c5c8d0', green: '#3ecf8e', blue: '#4da6ff', amber: '#f5a623', red: '#f25757',
}
export { T }

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}
export function Button({ variant = 'secondary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const sizeClass = size === 'sm' ? styles.btnSm : size === 'lg' ? styles.btnLg : styles.btnMd
  const variantClass =
    variant === 'primary' ? styles.btnPrimary :
    variant === 'danger'  ? styles.btnDanger :
    variant === 'ghost'   ? styles.btnGhost :
                             styles.btnSecondary
  return (
    <button className={[styles.btn, sizeClass, variantClass, className].filter(Boolean).join(' ')} disabled={disabled || loading} {...props}>
      {loading && <span className={styles.btnSpinner} />}
      {children}
    </button>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string }
export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className={styles.fieldWrap}>
      {label && <label className={styles.fieldLabel}>{label}</label>}
      <input className={[styles.input, error ? styles.inputErrorState : '', className].filter(Boolean).join(' ')} {...props} />
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string }
export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <div className={styles.fieldWrap}>
      {label && <label className={styles.fieldLabel}>{label}</label>}
      <textarea className={[styles.textarea, className].filter(Boolean).join(' ')} {...props} />
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string; label: string }[] }
export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className={styles.fieldWrap}>
      {label && <label className={styles.fieldLabel}>{label}</label>}
      <select className={[styles.select, className].filter(Boolean).join(' ')} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function Card({ children, title, action, style }: { children: React.ReactNode; title?: string; action?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={styles.card} style={style}>
      {(title || action) && (
        <div className={styles.cardHeader}>
          {title && <span className={styles.cardHeaderTitle}>{title}</span>}
          {action}
        </div>
      )}
      <div className={styles.cardBody}>{children}</div>
    </div>
  )
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className={styles.tabs}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={[styles.tab, active === tab.id ? styles.tabActive : ''].filter(Boolean).join(' ')}>
          {tab.label}
          {tab.count !== undefined && (
            <span className={styles.tabCount}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

const STATUS_MAP: Record<string, { color: string; bg: string; label: string }> = {
  new: { color: '#a594ff', bg: 'rgba(165,148,255,0.1)', label: 'New' },
  contacted: { color: '#4da6ff', bg: 'rgba(77,166,255,0.1)', label: 'Contacted' },
  interested: { color: '#ff9f6b', bg: 'rgba(255,159,107,0.1)', label: 'Interested' },
  warm: { color: '#f5a623', bg: 'rgba(245,166,35,0.1)', label: 'Warm' },
  hot: { color: '#f25757', bg: 'rgba(242,87,87,0.1)', label: 'Hot 🔥' },
  cold: { color: '#6b6e80', bg: 'rgba(107,110,128,0.1)', label: 'Cold' },
  closed_won: { color: '#3ecf8e', bg: 'rgba(62,207,142,0.1)', label: 'Won ✓' },
  closed_lost: { color: '#4a4d5e', bg: 'rgba(74,77,94,0.15)', label: 'Lost' },
  do_not_call: { color: '#f25757', bg: 'rgba(242,87,87,0.1)', label: 'DNC' },
  completed: { color: '#3ecf8e', bg: 'rgba(62,207,142,0.1)', label: 'Completed' },
  failed: { color: '#f25757', bg: 'rgba(242,87,87,0.1)', label: 'Failed' },
  running: { color: '#3ecf8e', bg: 'rgba(62,207,142,0.1)', label: 'Running' },
  scheduled: { color: '#4da6ff', bg: 'rgba(77,166,255,0.1)', label: 'Scheduled' },
  draft: { color: '#6b6e80', bg: 'rgba(107,110,128,0.1)', label: 'Draft' },
  paused: { color: '#f5a623', bg: 'rgba(245,166,35,0.1)', label: 'Paused' },
}
export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_MAP[status] || { color: '#9799ab', bg: 'rgba(151,153,171,0.1)', label: status }
  return (
    <span className={styles.badge} style={{ color: m.color, background: m.bg }}>
      <span className={[styles.badgeDot, m.label === 'Running' ? styles.badgeDotGlow : ''].filter(Boolean).join(' ')} style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  if (!open) return null
  const maxW = size === 'sm' ? 440 : size === 'lg' ? 760 : 560
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} style={{ maxWidth: maxW }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer && <div className={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner({ size = 16, color = '#c5c8d0' }: { size?: number; color?: string }) {
  return <span className={styles.spinner} style={{ width: size, height: size, borderWidth: 2, borderColor: color }} />
}

export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <div className={styles.emptyTitle}>{title}</div>
      {description && <div className={styles.emptyDesc}>{description}</div>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  )
}

export function StatCard({ label, value, color, loading }: { label: string; value: number | string; color: string; loading?: boolean }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color: loading ? '#5c5f72' : color }}>{loading ? '—' : value}</div>
    </div>
  )
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageHeaderTitle}>{title}</h1>
        {description && <p className={styles.pageHeaderDesc}>{description}</p>}
      </div>
      {action}
    </div>
  )
}

// Row component for table-style lists
export function ListRow({ onClick, last, children, highlighted }: { onClick?: () => void; last?: boolean; children: React.ReactNode; highlighted?: boolean }) {
  return (
    <div onClick={onClick} style={{
      display: 'contents',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {children}
    </div>
  )
}
