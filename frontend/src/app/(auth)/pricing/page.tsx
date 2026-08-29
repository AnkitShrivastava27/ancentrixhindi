'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useAuthStore } from '@/store'
import { paymentsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import VoiceRingVisual from '@/components/shared/VoiceRingVisual'
import styles from './pricing.module.css'

// Cashfree's hosted checkout JS SDK — loaded via <Script> below (see
// developers.cashfree.com, "Web Checkout"). No npm package needed; it
// attaches a global `window.Cashfree` constructor.
declare global {
  interface Window { Cashfree: any }
}

function Spinner({ white }: { white?: boolean }) {
  return <span className={styles.spinner} />
}

interface PlanDef {
  plan_type: string
  label: string
  minutes?: number
  rate_per_minute: number
  amount?: number
  min_amount?: number
  one_time_only?: boolean
  note?: string
}

export default function PricingPage() {
  const router = useRouter()
  const { user, hasHydrated, balance, fetchBalance, company, logout } = useAuthStore()

  const [plans, setPlans]           = useState<PlanDef[]>([])
  const [cashfreeEnv, setCashfreeEnv] = useState<'sandbox' | 'production'>('sandbox')
  const [sdkReady, setSdkReady]     = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selected, setSelected]     = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [phone, setPhone]           = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Wait for the persisted session to actually finish rehydrating
    // before deciding to bounce to /login — see hasHydrated in
    // store/index.ts and the matching fix in (app)/layout.tsx.
    if (!hasHydrated) return
    if (!user) { router.replace('/login'); return }
    // Magic-link email verification gate (Aug 2026) — this is a
    // convenience redirect only; the actual enforcement is server-side
    // in POST /payments/create-order, so this can't be bypassed by
    // skipping straight to this page.
    if (!user.email_verified) { router.replace('/register'); return }
  }, [hasHydrated, user, router])

  useEffect(() => {
    fetchBalance()
  }, [])

  // NOTE: there used to be a `useEffect` here that force-redirected to
  // /dashboard whenever `balance.can_place_calls` was true. That's exactly
  // the state of a company with an active plan trying to TOP UP ("Buy More
  // Minutes" on the Billing page routes here) — so it was bouncing anyone
  // who already had minutes straight back to the dashboard before they
  // could pick a plan or reach Cashfree checkout. Removed; this page has
  // no reason to refuse an already-active company a top-up.

  useEffect(() => {
    paymentsApi.listPlans()
      .then((res: any) => setPlans(res.plans || []))
      .catch(() => toast.error('Could not load plans'))
      .finally(() => setLoadingPlans(false))
    // Prefill from the company's own Vobiz number if there's nothing
    // better — just a convenience default, editable either way.
    if (company?.vobiz_phone_number) setPhone(company.vobiz_phone_number)
  }, [])

  if (!user) return null

  const trialAlreadyUsed = !!balance?.trial_used
  const customPlan = plans.find(p => p.plan_type === 'custom')
  const customMin = customPlan?.min_amount ?? 1000
  const customAmountNum = parseFloat(customAmount)
  const customMinutesPreview = customPlan && customAmountNum >= customMin
    ? (customAmountNum / customPlan.rate_per_minute)
    : null

  function selectablePrice(): { plan_type: string; amount: number; minutes: number } | null {
    if (!selected) return null
    if (selected === 'custom') {
      if (!customAmountNum || customAmountNum < customMin) return null
      return { plan_type: 'custom', amount: customAmountNum, minutes: customAmountNum / (customPlan?.rate_per_minute || 4.3) }
    }
    const p = plans.find(x => x.plan_type === selected)
    if (!p || p.amount == null || p.minutes == null) return null
    return { plan_type: selected, amount: p.amount, minutes: p.minutes }
  }

  const priced = selectablePrice()

  async function handlePay() {
    if (!priced) { toast.error('Choose a plan first'); return }
    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length !== 10) { toast.error('Enter a valid 10-digit phone number'); return }

    setSubmitting(true)
    try {
      const res: any = await paymentsApi.createOrder({
        plan_type: priced.plan_type,
        custom_amount: priced.plan_type === 'custom' ? priced.amount : undefined,
        customer_phone: cleanPhone,
        customer_email: user.email,
      })
      setCashfreeEnv(res.cashfree_env === 'production' ? 'production' : 'sandbox')

      if (!sdkReady || !window.Cashfree) {
        toast.error('Payment SDK still loading — try again in a second')
        setSubmitting(false)
        return
      }
      const cashfree = window.Cashfree({ mode: res.cashfree_env === 'production' ? 'production' : 'sandbox' })
      // redirectTarget: "_self" — full-page redirect to Cashfree's hosted
      // checkout, then back to return_url (set server-side to
      // /billing/return?order_id=... — see app/api/routes/payments.py
      // create_order()) once the payment completes either way.
      cashfree.checkout({
        paymentSessionId: res.payment_session_id,
        redirectTarget: '_self',
      })
    } catch (e: any) {
      toast.error(e.message || 'Could not start checkout — try again')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <Script
        src="https://sdk.cashfree.com/js/v3/cashfree.js"
        onLoad={() => setSdkReady(true)}
      />
      <div className={styles.col}>
        <div className={styles.head}>
          <div className={styles.visualWrap}>
            <VoiceRingVisual size={120} />
          </div>
          <div className={styles.logoMark}>AI</div>
          <h1 className={styles.title}>Choose Your Plan</h1>
          <p className={styles.subtitle}>
            Welcome, {user.full_name || user.email}! Pick a minutes plan to start placing calls — valid for 1 year from purchase.
          </p>
        </div>

        <div className={styles.card}>
          {loadingPlans ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><Spinner /></div>
          ) : (
            <>
              <div className={styles.plansGrid}>
                {plans.map(p => {
                  const disabled = p.plan_type === 'trial' && trialAlreadyUsed
                  const isSelected = selected === p.plan_type
                  return (
                    <div
                      key={p.plan_type}
                      onClick={() => !disabled && setSelected(p.plan_type)}
                      className={[
                        styles.planCard,
                        isSelected ? styles.planCardSelected : '',
                        disabled ? styles.planCardDisabled : '',
                      ].join(' ')}
                    >
                      <div className={styles.planLabel}>
                        {p.label}
                        {p.plan_type === 'trial' && <span className={styles.planBadge}>One-time</span>}
                      </div>

                      {p.plan_type === 'custom' ? (
                        <>
                          <div className={styles.planRate}>₹{p.rate_per_minute}/min · min ₹{customMin.toFixed(0)}</div>
                          <div className={styles.customAmountWrap} onClick={e => e.stopPropagation()}>
                            <input
                              type="number"
                              min={customMin}
                              value={customAmount}
                              onChange={e => { setCustomAmount(e.target.value); setSelected('custom') }}
                              placeholder={`Amount (min ₹${customMin.toFixed(0)})`}
                              className={styles.customAmountInput}
                            />
                          </div>
                          {customMinutesPreview != null && (
                            <div className={styles.planMinutes}>≈ {customMinutesPreview.toFixed(0)} minutes</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className={styles.planPrice}>
                            ₹{p.amount?.toLocaleString('en-IN')} <span className={styles.planPriceUnit}>one-time</span>
                          </div>
                          <div className={styles.planMinutes}>{p.minutes?.toLocaleString('en-IN')} minutes</div>
                          <div className={styles.planRate}>₹{p.rate_per_minute}/min</div>
                          {disabled && <div className={styles.planUsedNote}>Trial already used on this account</div>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className={styles.phoneField}>
                <label className={styles.label}>Phone number (for payment receipt)</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className={styles.phoneInput}
                  maxLength={10}
                />
              </div>

              {priced && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{priced.minutes.toFixed(0)} minutes</span>
                  <span className={styles.summaryValue}>₹{priced.amount.toLocaleString('en-IN')}</span>
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={!priced || submitting}
                className={`${styles.activateBtn} ${submitting ? styles.activateBtnLoading : ''}`}
              >
                {submitting ? <Spinner white /> : null}
                {priced ? `Pay ₹${priced.amount.toLocaleString('en-IN')}` : 'Choose a plan'}
              </button>
              <p className={styles.hint}>
                One-time payment via Cashfree · Minutes expire 365 days from purchase · No auto-renewal
              </p>
            </>
          )}
        </div>

        <p className={styles.footer}>
          <button onClick={() => logout()} className={styles.signOutLink}>Sign out</button>
        </p>
      </div>
    </div>
  )
}
