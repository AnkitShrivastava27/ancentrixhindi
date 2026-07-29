'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store'
import Sidebar from '@/components/layout/Sidebar'
import AnimatedBackground from '@/components/shared/AnimatedBackground'
import styles from './app-layout.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const pathname = usePathname()
  const { token, user, company, license, fetchCompany, fetchLicense } = useAuthStore()

  useEffect(() => {
    if (!token || !user) { router.replace('/login'); return }
    // `company` (and therefore company_id) is deliberately NOT persisted
    // to localStorage — only `user`/`token` are (see store/index.ts
    // partialize). It was previously only ever fetched right after
    // loginWithEmail(), so on any page reload or direct navigation to an
    // app route, `company` stayed null for the rest of the session. Pages
    // that key off companyId (e.g. the Live Call tab's WebSocket connect
    // effect) silently no-op forever in that case — the Live tab looked
    // stuck on "Connecting…" with no visible error. Fetch it here too,
    // same as license, so it's always populated after a fresh page load.
    if (!company) fetchCompany()
    if (!license) fetchLicense()
  }, [token, user])

  // No hard redirect here on purpose. Leads/Batches/Schedules etc. stay
  // browsable even without a valid license — viewing/managing your own
  // data costs nothing and shouldn't break because of a license-server
  // hiccup. The thing that actually needs gating (sending calls) is
  // enforced server-side in app/tasks/tasks.py's is_call_allowed(), which
  // runs regardless of what this page shows. The banner below is just a
  // visible nudge to renew, not a wall.

  if (!token || !user) return null

  return (
    <div className={styles.shell}>
      <AnimatedBackground variant="subtle" />
      <Sidebar />
      <main className={styles.main}>
        {/* License expired / not activated banner */}
        {license && !license.valid && (
          <div className={styles.licenseBanner}>
            <div className={styles.licenseBannerText}>
              ⚠ {license.activated ? 'Your license has expired.' : 'No license activated.'} Outbound calls and campaigns are paused until you activate/renew.
            </div>
            <button onClick={() => router.push('/pricing')} className={styles.activateBtn}>
              Activate License
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
