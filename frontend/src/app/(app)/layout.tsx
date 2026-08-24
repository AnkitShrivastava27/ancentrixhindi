'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store'
import { apiClient } from '@/lib/api'
import { useLiveCallStore } from '@/store/liveCallStore'
import Sidebar from '@/components/layout/Sidebar'
import AnimatedBackground from '@/components/shared/AnimatedBackground'
import styles from './app-layout.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const { token, user, company, balance, hasHydrated, backendSessionToken, fetchCompany, fetchBalance } = useAuthStore()
  const [authBootstrapping, setAuthBootstrapping] = useState(true)
  const connectLiveCalls = useLiveCallStore(s => s.connect)

  useEffect(() => {
    // IMPORTANT: keep exactly one auth bootstrap listener in the protected
    // layout. The store used to install a second module-level
    // onIdTokenChanged listener, which raced this one and could leave the
    // UI in its loading state even though /auth/me had already returned 200.
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let unsubscribe: (() => void) | null = null

    const finish = () => {
      if (!cancelled) setAuthBootstrapping(false)
    }

    const redirectToLogin = () => {
      if (cancelled) return
      apiClient.setToken(null)
      useAuthStore.setState({ token: null, user: null, company: null, balance: null, backendSessionToken: null })
      finish()
      router.replace('/login')
    }

    const bootstrapFirebaseSession = async (firebaseUser: typeof auth.currentUser) => {
      if (cancelled || !firebaseUser) return

      try {
        const fresh = await firebaseUser.getIdToken()
        if (cancelled) return

        // Login/register already exchanged this exact Firebase token for the
        // backend session. Don't immediately repeat GET /auth/me when the
        // Firebase listener fires as a consequence of that login. On a full
        // page load backendSessionToken is null (it is intentionally not
        // persisted), so the first restored session is still validated.
        const state = useAuthStore.getState()
        if (state.backendSessionToken === fresh && state.user && state.token === fresh) {
          apiClient.setToken(fresh)
          void state.fetchCompany()
          void state.fetchBalance()
          console.debug('[auth] Session already adopted; skipping duplicate /auth/me')
          finish()
          return
        }

        console.debug('[auth] Firebase user restored; rebuilding backend session')
        apiClient.setToken(fresh)
        const me: any = await apiClient.get('/auth/me')
        if (cancelled) return

        useAuthStore.setState({
          user: {
            uid: me.id,
            email: me.email,
            full_name: me.full_name,
            email_verified: !!me.email_verified,
          },
          token: fresh,
          backendSessionToken: fresh,
          isLoading: false,
        })

        // These are useful data, but NEVER prerequisites for rendering the
        // authenticated shell.
        void useAuthStore.getState().fetchCompany()
        void useAuthStore.getState().fetchBalance()

        console.debug('[auth] Session ready; rendering protected app')
        finish()
      } catch (err) {
        console.error('[auth] Session bootstrap failed:', err)
        // If we already have a persisted authenticated snapshot, keep the
        // app usable while the backend/Firebase session recovers. Otherwise
        // the timeout below will send the user to login.
        const state = useAuthStore.getState()
        if (state.token && state.user) finish()
      }
    }

    // Subscribe immediately. Do NOT wait for Zustand hydration here: Firebase
    // has its own asynchronous persistence and this listener is the reliable
    // signal that Firebase has finished restoring the auth session.
    unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        void bootstrapFirebaseSession(firebaseUser)
        return
      }

      // The initial Firebase null event can occur before Zustand hydration.
      // Do not redirect until hydration has completed.
      const state = useAuthStore.getState()
      if (state.hasHydrated) {
        const persistedSession = !!state.token && !!state.user
        if (!persistedSession) redirectToLogin()
      }
    })

    // Safety net: never leave the UI on "Loading your account…" forever.
    timeoutId = setTimeout(() => {
      if (cancelled) return
      const state = useAuthStore.getState()
      if (auth.currentUser || (state.hasHydrated && state.token && state.user)) {
        console.warn('[auth] Bootstrap timeout reached but a session exists; rendering app')
        finish()
      } else {
        console.warn('[auth] No Firebase session after 8 seconds; redirecting to login')
        redirectToLogin()
      }
    }, 8000)

    return () => {
      cancelled = true
      unsubscribe?.()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [router])

  // Company and balance are not authentication prerequisites. Load them
  // independently so a slow/stuck balance/company request can never keep the
  // entire application behind the authentication loading screen.
  useEffect(() => {
    if (!token || !user) return
    if (!company) void fetchCompany()
    if (!balance) void fetchBalance()
  }, [hasHydrated, token, user, company, balance, fetchCompany, fetchBalance])

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
  // browsable even without minutes on the plan — viewing/managing your
  // own data costs nothing and shouldn't break because of it. The thing
  // that actually needs gating (sending calls) is enforced server-side in
  // app/tasks/tasks.py (plan_service.has_minutes_available()), which runs
  // regardless of what this page shows. The banner below is just a
  // visible nudge to buy/renew a plan, not a wall.

  // Never render a completely empty page while auth is being restored.
  // A black/empty page here is especially confusing after Cashfree returns
  // because the browser has just crossed an external navigation boundary.
  if (authBootstrapping || !token || !user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#050505',
        color: '#c8cad8',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◌</div>
          <div>Loading your account…</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <AnimatedBackground variant="subtle" />
      <Sidebar />
      <main className={styles.main}>
        {/* Plan expired / out of minutes banner */}
        {balance && !balance.can_place_calls && (
          <div className={styles.licenseBanner}>
            <div className={styles.licenseBannerText}>
              ⚠ {balance.plan_type === 'none'
                ? 'No plan purchased yet.'
                : balance.is_expired
                  ? 'Your plan has expired.'
                  : 'You\'re out of minutes.'} Outbound calls and campaigns are paused until you {balance.plan_type === 'none' ? 'buy a plan' : 'renew'}.
            </div>
            <button onClick={() => router.push('/pricing')} className={styles.activateBtn}>
              {balance.plan_type === 'none' ? 'Buy a Plan' : 'Renew Plan'}
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
