'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '../../store'
import styles from './Sidebar.module.css'

const NAV = [
  { section: null, items: [
    { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
    { href: '/calls',     label: 'Call Logs',  icon: '↗' },
    { href: '/live',      label: 'Live Calls', icon: '◉' },
    { href: '/human-calls', label: 'Human Call', icon: '🧑‍💼' },
    { href: '/appointments', label: 'Appointments', icon: '▣' },
  ]},
  { section: 'Campaigns', items: [
    { href: '/leads',     label: 'Leads',    icon: '◎' },
    { href: '/batches',   label: 'Batches',  icon: '▤' },
    { href: '/schedules', label: 'Schedules',icon: '◷' },
  ]},
  { section: 'Config', items: [
    { href: '/knowledge', label: 'Knowledge Base', icon: '◈' },
    { href: '/settings',  label: 'Settings',       icon: '⚙' },
  ]},
  { section: 'Account', items: [
    { href: '/billing', label: 'Billing', icon: '💳' },
  ]},
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { logout, user, balance } = useAuthStore()
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase()
  const planActive = !!balance?.can_place_calls

  return (
    <aside className={styles.aside}>
      {/* Logo */}
      <div className={styles.logoBlock}>
        <div className={styles.logoRow}>
          <div className={styles.logoMark}>Av</div>
          <div>
            <div className={styles.brandName}>Ancentrix Voice</div>
            <div className={styles.brandSub}>AI Sales Agent</div>
          </div>
        </div>
      </div>

      {/* Nav — no locking here; every page is browsable regardless of plan
          status (see app/(app)/layout.tsx for why). The plan banner at
          the top of each page and the server-side call-gate are what
          actually matter. */}
      <nav className={styles.nav}>
        {NAV.map((group, gi) => (
          <div key={gi} className={styles.navGroup}>
            {group.section && (
              <div className={styles.navSection}>{group.section}</div>
            )}
            {group.items.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
              return (
                <Link key={item.href} href={item.href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}>
                  <span className={`${styles.navIcon} ${active ? styles.navIconActive : ''}`}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Plan / minutes mini-widget — replaces the old license widget */}
      {balance && (
        planActive ? (
          <div className={styles.licenseWidget}>
            <div className={styles.licenseWidgetRow}>
              <span>Minutes left</span>
              <span className={styles.licenseWidgetStatus}>● {balance.minutes_remaining.toLocaleString('en-IN')}</span>
            </div>
            {balance.expires_at && (
              <div className={styles.licenseWidgetExpiry}>
                Expires {new Date(balance.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.licenseWarn}>
            <Link href="/pricing" className={styles.licenseWarnLink}>
              <div className={styles.licenseWarnTitle}>⚠ {balance.plan_type === 'none' ? 'No Plan' : balance.is_expired ? 'Plan Expired' : 'Out of Minutes'}</div>
              <div className={styles.licenseWarnSub}>Click to buy minutes</div>
            </Link>
          </div>
        )
      )}

      {/* Profile */}
      <div className={styles.profileBlock}>
        <Link href="/settings" className={styles.profileLink}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.profileMeta}>
            <div className={styles.profileName}>{user?.full_name || 'My Account'}</div>
            <div className={styles.profileEmail}>{user?.email}</div>
          </div>
        </Link>
        <button onClick={() => { logout(); }} className={styles.signOutBtn}>
          <span>↩</span> Sign out
        </button>
      </div>
    </aside>
  )
}
