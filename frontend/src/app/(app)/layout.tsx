'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store'
import { useLiveCallStore } from '@/store/liveCallStore'
import Sidebar from '@/components/layout/Sidebar'
import AnimatedBackground from '@/components/shared/AnimatedBackground'
import styles from './app-layout.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const pathname = usePathname()
  const { token, user, company, license, hasHydrated, fetchCompany, fetchLicense } = useAuthStore()
  const connectLiveCalls = useLiveCallStore(s => s.connect)

  useEffect(() => {
    // Don't make any login/redirect decision until zustand-persist has
    // actually finished reading localStorage. Before this flag existed,
    // token/user were still at their default `null` on the very first
    // render — regardless of what was actually stored — because that
    // read is async (required for SSR safety in Next.js). This effect
    // used to fire on that first render and redirect to /login every
    // single time, even with a perfectly valid stored session, because
    // it couldn't yet tell "no session" apart from "haven't checked yet".
    if (!hasHydrated) return
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
  }, [hasHydrated, token, user])

  // Connect the Live Call WebSocket here — at the layout level, which
  // stays mounted for the whole app session — instead of inside
  // live/page.tsx. That page used to own the socket itself, so navigating
  // to Batches/Schedules/anywhere else unmounted it, closed the
  // connection, and wiped all session/message history. Connecting here
  // means the socket (and the conversation history in useLiveCallStore)
  // survives regardless of which tab is currently open.
  useEffect(() => {
    const companyId = (company as any)?.id
    if (companyId) connectLiveCalls(companyId)
  }, [(company as any)?.id])

  // No hard redirect here on purpose. Leads/Batches/Schedules etc. stay
  // browsable even without a valid license — viewing/managing your own
  // data costs nothing and shouldn't break because of a license-server
  // hiccup. The thing that actually needs gating (sending calls) is
  // enforced server-side in app/tasks/tasks.py's is_call_allowed(), which
  // runs regardless of what this page shows. The banner below is just a
  // visible nudge to renew, not a wall.

  if (!hasHydrated || !token || !user) return null

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
