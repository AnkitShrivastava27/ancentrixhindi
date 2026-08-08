// src/store/index.ts
// Local email/password auth against our own backend — no Firebase.
// This is an individual/single-tenant product, so a full external identity
// provider was unnecessary overhead. Sessions are plain JWTs (30-day expiry)
// issued by app/core/security.py and stored in this persisted store.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient, authApi, licenseApi } from '@/lib/api'

interface AppUser {
  uid:       string
  email:     string
  full_name: string
}

interface LicenseInfo {
  activated:        boolean
  valid:            boolean
  tier:             string | null
  expires_at:       string | null
  max_leads?:       number
  max_calls_month?: number
  message?:         string
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
  license:   LicenseInfo | null
  isLoading: boolean
  hasHydrated: boolean

  loginWithEmail:    (email: string, password: string) => Promise<void>
  registerWithLicense: (data: { email: string; password: string; full_name: string; license_key: string }) => Promise<void>
  logout:            () => Promise<void>
  refreshToken:      () => Promise<string | null>
  fetchCompany:      () => Promise<void>
  fetchLicense:      (opts?: { refresh?: boolean }) => Promise<void>
  setCompany:        (c: Company) => void
  setLicense:        (l: LicenseInfo) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:      null,
      token:     null,
      company:   null,
      license:   null,
      isLoading: false,
      hasHydrated: false,

      loginWithEmail: async (email, password) => {
        set({ isLoading: true })
        try {
          const res: any = await authApi.login({ email, password })
          apiClient.setToken(res.access_token)
          set({
            user: { uid: res.user_id, email: res.email, full_name: res.full_name },
            token: res.access_token,
            isLoading: false,
          })
          await Promise.all([get().fetchCompany(), get().fetchLicense()])
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      registerWithLicense: async (data) => {
        set({ isLoading: true })
        try {
          // One step: creates the account AND activates the license key —
          // see POST /auth/register in the backend.
          const res: any = await authApi.register(data)
          apiClient.setToken(res.access_token)
          set({
            user: { uid: res.user_id, email: res.email, full_name: res.full_name },
            token: res.access_token,
            isLoading: false,
          })
          await Promise.all([get().fetchCompany(), get().fetchLicense()])
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        apiClient.setToken(null)
        set({ user: null, token: null, company: null, license: null })
        if (typeof window !== 'undefined') window.location.href = '/login'
      },

      // No refresh mechanism — sessions are 30-day JWTs. On 401, the API
      // client falls through to a login redirect (see lib/api.ts).
      refreshToken: async () => null,

      fetchCompany: async () => {
        try {
          const company: any = await apiClient.get('/company/')
          if (company) set({ company })
        } catch {}
      },

      fetchLicense: async (opts) => {
        try {
          const license: any = await licenseApi.getStatus(opts)
          if (license) set({ license })
        } catch {}
      },

      setCompany: (company) => set({ company }),
      setLicense: (license) => set({ license }),
    }),
    {
      name: 'callcenter-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) apiClient.setToken(state.token)
        // Runs after zustand-persist finishes reading localStorage,
        // whether or not there was anything to restore. AppLayout was
        // checking `!token || !user` and redirecting to /login on the
        // very FIRST render — before this async read completes — so it
        // redirected on every single page refresh even with a perfectly
        // valid stored session, since `token`/`user` are still null at
        // that point regardless of what's actually in localStorage.
        useAuthStore.setState({ hasHydrated: true })
      },
    }
  )
)
