'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { paymentsApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import styles from '../billing.module.css'

// Cashfree redirects here (return_url set server-side in
// app/api/routes/payments.py create_order()) after the person finishes
// checkout — success, failure, or they just closed the tab. The webhook
// (POST /payments/webhook) is the actual source of truth for whether the
// plan got credited; this page only POLLS for that having landed, since
// the webhook can arrive a second or two after the redirect.
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 15   // ~30s — Cashfree webhooks land almost immediately in practice

type PageStatus = 'polling' | 'paid' | 'failed' | 'timeout'

function Spinner() {
  return <span className={styles.spinner} />
}

export default function BillingReturnPage() {
  const router = useRouter()
  const params = useSearchParams()
  const orderId = params.get('order_id')
  const { refreshSession } = useAuthStore()

  const [status, setStatus] = useState<PageStatus>('polling')
  const [pollCount, setPollCount] = useState(0)

  useEffect(() => {
    if (!orderId) { setStatus('failed'); return }
    let cancelled = false

    async function poll() {
      try {
        const order: any = await paymentsApi.getOrder(orderId!)
        if (cancelled) return
        if (order.status === 'paid') {
          // Rebuild the complete Firebase/backend session before leaving
          // the return page. Cashfree is an external navigation, so relying
          // only on persisted Zustand state can leave the app layout with a
          // missing/stale token/user and render a blank page.
          try {
            await refreshSession()
          } catch (sessionErr) {
            console.error('Payment return: session refresh failed', sessionErr)
            // The payment is already confirmed. Keep the success screen
            // visible rather than trapping the user on a blank page.
          }
          setStatus('paid')
          return
        }
        if (order.status === 'failed') {
          setStatus('failed')
          return
        }
      } catch {
        // order not found yet / transient — keep polling until MAX_POLLS
      }
      setPollCount(c => {
        const next = c + 1
        if (next >= MAX_POLLS) {
          setStatus('timeout')
        } else {
          setTimeout(poll, POLL_INTERVAL_MS)
        }
        return next
      })
    }
    poll()
    return () => { cancelled = true }
  }, [orderId, refreshSession])

  // Automatically continue after a confirmed payment. The session refresh
  // above has already populated user/company/balance before this navigation.
  useEffect(() => {
    if (status !== 'paid') return
    const t = window.setTimeout(() => router.replace('/dashboard'), 900)
    return () => window.clearTimeout(t)
  }, [status, router])

  return (
    <div className={styles.page}>
      <div className={styles.stack} style={{ maxWidth: 480, margin: '80px auto' }}>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          {status === 'polling' && (
            <>
              <div style={{ padding: '12px 0' }}><Spinner /></div>
              <div className={styles.tierValue} style={{ marginTop: 8 }}>Confirming payment…</div>
              <p className={styles.accountHint}>This usually takes a couple of seconds.</p>
            </>
          )}
          {status === 'paid' && (
            <>
              <div className={styles.tierValue} style={{ color: '#3ecf8e' }}>✓ Payment confirmed</div>
              <p className={styles.accountHint}>Your minutes have been credited. Redirecting to Dashboard…</p>
              <button onClick={() => router.replace('/dashboard')} className={styles.primaryAction} style={{ marginTop: 16 }}>
                Go to Dashboard
              </button>
            </>
          )}
          {status === 'failed' && (
            <>
              <div className={styles.tierValue} style={{ color: '#f25757' }}>Payment failed</div>
              <p className={styles.accountHint}>No charge was completed. You can try again.</p>
              <button onClick={() => router.replace('/pricing')} className={styles.primaryAction} style={{ marginTop: 16 }}>
                Back to Plans
              </button>
            </>
          )}
          {status === 'timeout' && (
            <>
              <div className={styles.tierValue}>Still confirming…</div>
              <p className={styles.accountHint}>
                This is taking longer than expected. If the payment succeeded, your balance will update shortly —
                check the Billing page in a minute.
              </p>
              <button onClick={() => router.replace('/billing')} className={styles.primaryAction} style={{ marginTop: 16 }}>
                Go to Billing
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
