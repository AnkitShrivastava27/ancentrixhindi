// src/store/index.ts
// Firebase Auth (Aug 2026) drives login/signup/session — replaces the old
// local email/password + backend-issued JWT. This backend no longer has
// /auth/login or /auth/register at all; loginWithEmail()/register() below
// call Firebase's client SDK directly, then hit GET /auth/me to fetch the
// canonical local profile (our internal user.id, which Company ownership
// etc. is keyed by — NOT the Firebase uid).
//
// `user`/`register`/`loginWithEmail`/`logout` keep the EXACT same names
// and signatures as before on purpose — login/page.tsx and
// register/page.tsx call these and needed zero changes for this switch.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onIdTokenChanged,
  sendEmailVerification,
  type ActionCodeSettings,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { apiClient, authApi, paymentsApi } from '@/lib/api'

interface AppUser {
  uid:            string   // our internal User.id (from GET /auth/me) — NOT the Firebase uid
  email:          string
  full_name:      string
  email_verified: boolean  // magic-link verification (Aug 2026) — see GET /auth/me
}

// Replaces the old LicenseInfo — see GET /payments/balance in the backend
// (app/services/plan_service.py:balance_summary()).
interface PlanBalance {
  plan_type:          string   // none | trial | basic | standard | custom
  minutes_total:      number
  minutes_used:       number
  minutes_remaining:  number
  rate_per_minute:    number
  amount_paid:        number
  purchased_at:       string | null
  expires_at:         string | null
  is_expired:         boolean
  trial_used:         boolean
  can_place_calls:    boolean
}

interface Company {
  id:                  string
  name:                string
  agent_name:          string
  vobiz_phone_number:  string | null
  voice_language:      string
  active_product:      string | null
}

interface AuthState {
  user:      AppUser | null
  token:     string | null
  company:   Company | null
  balance:   PlanBalance | null
  isLoading: boolean
  // BUG FIX (Aug 2026) — "have to log in again on every refresh": zustand's
  // `persist` middleware reads localStorage and rehydrates the store
  // ASYNCHRONOUSLY — on the very first render after a page reload, `user`/
  // `token` are still their initial `null` values even though a valid
  // session exists in localStorage. (app)/layout.tsx used to redirect to
  // /login the instant it saw `!token || !user`, which fired on that first
  // render, before rehydration had a chance to run — kicking a genuinely
  // logged-in person back to /login on every single refresh. `hasHydrated`
  // is set true (via onRehydrateStorage below) the moment rehydration
  // actually finishes, so callers know it's safe to trust `token`/`user`.
  hasHydrated: boolean

  loginWithEmail:    (email: string, password: string) => Promise<void>
  register:          (data: { email: string; password: string; full_name: string }) => Promise<void>
  logout:            () => Promise<void>
  refreshToken:      () => Promise<string | null>
  refreshSession:    () => Promise<void>
  fetchCompany:      () => Promise<void>
  fetchBalance:      () => Promise<void>
  setCompany:        (c: Company) => void
  setBalance:        (b: PlanBalance) => void
  setHasHydrated:    (v: boolean) => void

  // Internal, non-persisted marker used to prevent the protected layout's
  // Firebase listener from repeating /auth/me immediately after login/register.
  backendSessionToken: string | null

  // Email verification (Aug 2026) — Firebase Client SDK sends the
  // verification email directly. SendGrid is NOT involved in this flow.
  // The backend verification-status endpoint is still used to observe
  // Firebase's authoritative email_verified state from the original tab.
  sendVerificationEmail:   () => Promise<{ sent: boolean; already_verified: boolean; message: string }>
  checkVerificationStatus: () => Promise<boolean>
}

// Shared by loginWithEmail/register — takes a fresh Firebase ID token,
// wires it into apiClient, then asks OUR backend who this is (auto-
// provisioning the local User+Company row on first-ever sight of this
// Firebase account — see _get_or_create_user in app/core/security.py).
async function _adoptSession(idToken: string, set: (p: Partial<AuthState>) => void, get: () => AuthState) {
  apiClient.setToken(idToken)
  const me: any = await apiClient.get('/auth/me')
  set({
    user: { uid: me.id, email: me.email, full_name: me.full_name, email_verified: !!me.email_verified },
    token: idToken,
    backendSessionToken: idToken,
    isLoading: false,
  })
  await Promise.all([get().fetchCompany(), get().fetchBalance()])
}

// Deduplicate concurrent company/balance fetches. The protected layout and
// individual pages can legitimately ask for the same resource at the same
// time during navigation; only one HTTP request should be in flight.
let companyFetchInFlight: Promise<void> | null = null
let balanceFetchInFlight: Promise<void> | null = null

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:      null,
      token:     null,
      company:   null,
      balance:   null,
      isLoading: false,
      hasHydrated: false,
      backendSessionToken: null,

      loginWithEmail: async (email, password) => {
        set({ isLoading: true })
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password)
          const idToken = await cred.user.getIdToken()
          await _adoptSession(idToken, set, get)
        } catch (err: any) {
          set({ isLoading: false })
          // Firebase's raw "auth/wrong-password" etc. codes aren't
          // friendly to show directly — translate the common ones.
          const map: Record<string, string> = {
            'auth/invalid-credential': 'Invalid email or password',
            'auth/user-not-found':     'Invalid email or password',
            'auth/wrong-password':     'Invalid email or password',
            'auth/too-many-requests':  'Too many attempts — try again in a few minutes',
            'auth/user-disabled':      'Account disabled — contact your admin',
          }
          throw new Error(map[err?.code] || err?.message || 'Login failed')
        }
      },

      register: async (data) => {
        set({ isLoading: true })
        try {
          const cred = await createUserWithEmailAndPassword(auth, data.email, data.password)
          await updateProfile(cred.user, { displayName: data.full_name })
          // Force-refresh: the ID token minted at account-creation time
          // predates the updateProfile() call above, so it wouldn't carry
          // the display name yet. The backend reads `name` off the token
          // to seed User.full_name on first sight of this account (see
          // _get_or_create_user in app/core/security.py) — force a fresh
          // token so that claim is actually populated before /auth/me runs.
          const idToken = await cred.user.getIdToken(true)
          await _adoptSession(idToken, set, get)
        } catch (err: any) {
          set({ isLoading: false })
          const map: Record<string, string> = {
            'auth/email-already-in-use': 'An account with this email already exists',
            'auth/weak-password':        'Password is too weak — use at least 8 characters',
            'auth/invalid-email':        'Please enter a valid email address',
          }
          throw new Error(map[err?.code] || err?.message || 'Registration failed')
        }
      },

      logout: async () => {
        try { await signOut(auth) } catch {}
        apiClient.setToken(null)
        set({ user: null, token: null, company: null, balance: null, backendSessionToken: null })
        if (typeof window !== 'undefined') window.location.href = '/login'
      },

      // Called by lib/api.ts's 401-retry interceptor. Firebase ID tokens
      // expire hourly — force a real refresh (not just the SDK's cached
      // copy) since we're here specifically because the last one the
      // server saw was rejected.
      refreshToken: async () => {
        const current = auth.currentUser
        if (!current) return null
        try {
          const fresh = await current.getIdToken(true)
          apiClient.setToken(fresh)
          set({ token: fresh, backendSessionToken: null })
          return fresh
        } catch {
          return null
        }
      },

      // Rebuild the complete local session after external redirects such as
      // Cashfree returning to the app. This avoids relying on a possibly
      // stale persisted Zustand snapshot after the payment page/navigation.
      refreshSession: async () => {
        // Firebase browser persistence can restore asynchronously after the
        // Zustand localStorage snapshot has already hydrated. Retry briefly
        // instead of treating that normal race as a logged-out session.
        let current = auth.currentUser
        for (let attempt = 0; !current && attempt < 10; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 200))
          current = auth.currentUser
        }
        if (!current) throw new Error('Firebase session is not available')

        const fresh = await current.getIdToken(true)
        apiClient.setToken(fresh)
        const me: any = await apiClient.get('/auth/me')
        set({
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
      },

      fetchCompany: async () => {
        if (companyFetchInFlight) return companyFetchInFlight
        companyFetchInFlight = (async () => {
          try {
            const company: any = await apiClient.get('/company/')
            if (company) set({ company })
          } catch {} finally {
            companyFetchInFlight = null
          }
        })()
        return companyFetchInFlight
      },

      fetchBalance: async () => {
        if (balanceFetchInFlight) return balanceFetchInFlight
        balanceFetchInFlight = (async () => {
          try {
            const balance: any = await paymentsApi.getBalance()
            if (balance) set({ balance })
          } catch {} finally {
            balanceFetchInFlight = null
          }
        })()
        return balanceFetchInFlight
      },

      setCompany: (company) => set({ company }),
      setBalance: (balance) => set({ balance }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      sendVerificationEmail: async () => {
        const current = auth.currentUser
        if (!current) {
          throw new Error('Your Firebase session is not available. Please sign in again.')
        }

        // Firebase sends the verification email itself. No backend,
        // Admin SDK link generation, or SendGrid call is involved.
        const frontendBase =
          (typeof window !== 'undefined' ? window.location.origin : '') ||
          process.env.NEXT_PUBLIC_FRONTEND_PUBLIC_URL ||
          ''

        const actionCodeSettings: ActionCodeSettings = {
          url: `${frontendBase}/register?verified=1`,
          handleCodeInApp: false,
        }

        await sendEmailVerification(current, actionCodeSettings)

        return {
          sent: true,
          already_verified: false,
          message: `Verification email sent to ${current.email}`,
        }
      },

      checkVerificationStatus: async () => {
        const res: any = await authApi.verificationStatus()
        const verified = !!res?.email_verified
        if (verified) {
          const current = get().user
          if (current && !current.email_verified) {
            set({ user: { ...current, email_verified: true } })
          }
        }
        return verified
      },
    }),
    {
      name: 'callcenter-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state, error) => {
        // Bridge value only — avoids a flash of "logged out" while
        // Firebase's own session restoration (browserLocalPersistence,
        // separate from this zustand-persist storage) runs. The
        // onIdTokenChanged listener below fires moments later with a
        // verified, freshly-signed token and overwrites this.
        if (state?.token) apiClient.setToken(state.token)
        // Mark rehydration complete — MUST fire even on error or when
        // there was nothing in localStorage to restore (first-ever
        // visit), so pages waiting on hasHydrated don't hang forever.
        // See (app)/layout.tsx.
        useAuthStore.setState({ hasHydrated: true })
        if (error) console.error('Auth rehydration error:', error)
      },
    }
  )
)

