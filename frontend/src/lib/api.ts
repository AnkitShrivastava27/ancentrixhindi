// src/lib/api.ts
import axios, { AxiosInstance } from 'axios'
import toast from 'react-hot-toast'

// Priority: explicit env var → same-origin /api/v1 (works when Next.js and FastAPI
// are proxied together, e.g. via next.config rewrites) → localhost fallback.
// ERR_CONNECTION_REFUSED on delete/patch means BASE_URL is wrong for your setup.
// Set NEXT_PUBLIC_API_URL in .env.local to fix it, e.g.:
//   NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

class ApiClient {
  private client: AxiosInstance
  private token: string | null = null

  constructor() {
    this.client = axios.create({ baseURL: BASE_URL, timeout: 30000 })

    this.client.interceptors.request.use((config) => {
      if (this.token) config.headers.Authorization = `Bearer ${this.token}`
      return config
    })

    this.client.interceptors.response.use(
      (res) => res.data,
      async (err) => {
        // ERR_CONNECTION_REFUSED / network errors have no response object
        if (!err.response) {
          const url = err.config?.url || ''
          console.error(`Network error calling ${url} — is the backend running? BASE_URL=${BASE_URL}`)
          toast.error('Cannot reach server. Check that the backend is running.')
          return Promise.reject(new Error('Network error — server unreachable'))
        }

        const msg = err.response?.data?.detail || err.message || 'Request failed'
        if (err.response?.status === 401) {
          try {
            const { useAuthStore } = await import('@/store')
            const newToken = await useAuthStore.getState().refreshToken()
            if (newToken) {
              err.config.headers.Authorization = `Bearer ${newToken}`
              return this.client.request(err.config)
            }
          } catch {}
          if (typeof window !== 'undefined') window.location.href = '/login'
        } else if (err.response?.status !== 422) {
          toast.error(msg)
        }
        return Promise.reject(new Error(msg))
      }
    )
  }

  setToken(t: string | null) { this.token = t }

  async get<T = any>(path: string, params?: object): Promise<T> { return this.client.get(path, { params }) as any }
  async post<T = any>(path: string, data?: object): Promise<T> { return this.client.post(path, data) as any }
  async patch<T = any>(path: string, data?: object): Promise<T> { return this.client.patch(path, data) as any }
  async put<T = any>(path: string, data?: object): Promise<T> { return this.client.put(path, data) as any }
  async delete<T = any>(path: string): Promise<T> { return this.client.delete(path) as any }
  async upload<T = any>(path: string, formData: FormData): Promise<T> {
    return this.client.post(path, formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any
  }
}

export const apiClient = new ApiClient()

// Rehydrate token on load
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('callcenter-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.state?.token) apiClient.setToken(parsed.state.token)
    }
  } catch {}
}

// ── Auth ──────────────────────────────────────────────────────────────────────
// login/register/changePassword removed — Firebase Auth (client SDK, see
// src/lib/firebase.ts + store/index.ts) handles all three directly now.
// /me is the one thing that still goes through our own backend: it's how
// we find out our INTERNAL user.id/full_name for a given Firebase session
// (see GET /auth/me in the backend, and _adoptSession() in store/index.ts).
export const authApi = {
  me: () => apiClient.get('/auth/me'),
  // Firebase Client SDK sends verification emails directly (Option B).
  // The backend endpoint remains only for legacy clients.
  sendVerificationEmail: () => apiClient.post('/auth/send-verification-email'),
  verificationStatus:    () => apiClient.get('/auth/verification-status'),
}

// ── Company ───────────────────────────────────────────────────────────────────
export const companyApi = {
  get:    () => apiClient.get('/company/'),
  create: (d: object) => apiClient.post('/company/', d),
  update: (d: object) => apiClient.patch('/company/', d),
}

// ── Billing (Cashfree minute-based plans) — replaces licenseApi ────────────────
export const paymentsApi = {
  listPlans:   () => apiClient.get('/payments/plans'),
  getBalance:  () => apiClient.get('/payments/balance'),
  createOrder: (d: { plan_type: string; custom_amount?: number; customer_phone: string; customer_email?: string }) =>
    apiClient.post('/payments/create-order', d),
  getOrder:    (orderId: string) => apiClient.get(`/payments/orders/${orderId}`),
}

// ── Leads ─────────────────────────────────────────────────────────────────────
export const leadsApi = {
  list:      (p?: object) => apiClient.get('/leads/', p),
  get:       (id: string) => apiClient.get(`/leads/${id}`),
  create:    (d: object)  => apiClient.post('/leads/', d),
  update:    (id: string, d: object) => apiClient.patch(`/leads/${id}`, d),
  delete:    (id: string) => apiClient.delete(`/leads/${id}`),
  stats:     () => apiClient.get('/leads/stats'),
  importCsv: (form: FormData) => apiClient.upload('/leads/import/csv', form),
}

// ── Calls ─────────────────────────────────────────────────────────────────────
export const callsApi = {
  list:           (p?: object) => apiClient.get('/calls/', p),
  get:            (id: string) => apiClient.get(`/calls/${id}`),
  stats:          () => apiClient.get('/calls/stats'),
  hangup:         (cid: string) => apiClient.post(`/telephony/calls/${cid}/hangup`),
  liveTranscript: (cid: string) => apiClient.get(`/telephony/calls/${cid}/transcript`),
  numbers:        () => apiClient.get('/telephony/numbers'),
}

// ── Batches ───────────────────────────────────────────────────────────────────
export const batchesApi = {
  list:    (p?: object) => apiClient.get('/batches/', p),
  get:     (id: string) => apiClient.get(`/batches/${id}`),
  create:  (d: object)  => apiClient.post('/batches/', d),
  delete:  (id: string) => apiClient.delete(`/batches/${id}`),
  preview: (p: object)  => apiClient.get('/batches/preview', p),
  reuse:   (id: string) => apiClient.post(`/batches/${id}/reuse`, {}),
}

// ── Schedules ─────────────────────────────────────────────────────────────────
export const schedulesApi = {
  list:   (p?: object) => apiClient.get('/schedules/', p),
  create: (d: object)  => apiClient.post('/schedules/', d),
  update: (id: string, d: object) => apiClient.patch(`/schedules/${id}`, d),
  delete: (id: string) => apiClient.delete(`/schedules/${id}`),
}

// ── Human Calls (click-to-call bridge) ──────────────────────────────────────
export const humanCallsApi = {
  listLeads: (p?: { batch_id?: string }) => apiClient.get('/human-calls/leads', p),
  dial:      (d: { lead_id: string; agent_phone: string }) => apiClient.post('/human-calls/dial', d),
  complete:  (callLogId: string, d: { lead_status: string; summary: string; notes?: string }) =>
    apiClient.post(`/human-calls/${callLogId}/complete`, d),
}


// ── Appointments ──────────────────────────────────────────────────────────────
export const appointmentsApi = {
  list: (p?: object) => apiClient.get('/appointments/', p),
  create: (d: object) => apiClient.post('/appointments/', d),
  update: (id: string, d: object) => apiClient.patch(`/appointments/${id}`, d),
  cancel: (id: string) => apiClient.post(`/appointments/${id}/cancel`, {}),
}

// ── Knowledge ─────────────────────────────────────────────────────────────────
export const knowledgeApi = {
  list:   () => apiClient.get('/knowledge/'),
  upload: (form: FormData) => apiClient.upload('/knowledge/upload', form),
  delete: (id: string) => apiClient.delete(`/knowledge/${id}`),
}