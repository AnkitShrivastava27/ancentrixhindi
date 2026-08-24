'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import styles from './billing.module.css'

function Spinner() {
  return <span className={styles.spinner} />
}

export default function BillingPage() {
  const router   = useRouter()
  const { balance, fetchBalance, user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchBalance().finally(() => setLoading(false))
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    await fetchBalance()
    setRefreshing(false)
    toast.success('Balance refreshed')
  }

  const hasPlan   = !!balance && balance.plan_type !== 'none'
  const isActive  = !!balance?.can_place_calls
  const isBlocked = !isActive

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>Billing</h1>
        <p className={styles.headSub}>Minute-based plans — one-time payment, no monthly billing</p>
      </div>

      {loading ? (
        <div className={styles.loadingWrap}><Spinner /></div>
      ) : (
        <div className={styles.stack}>

          <div className={`${styles.card} ${isActive ? styles.cardActive : styles.cardExpired}`}>
            <div className={styles.cardTop}>
              <div>
                <div className={styles.tierLabel}>Current Plan</div>
                <div className={styles.tierValue}>
                  {!hasPlan ? 'No Plan' : balance!.plan_type}
                </div>
              </div>
              <span className={styles.statusPill} style={{
                color: isActive ? '#3ecf8e' : '#f25757',
                background: isActive ? 'rgba(62,207,142,0.1)' : 'rgba(242,87,87,0.1)' }}>
                {isActive ? '● Active' : '● ' + (hasPlan ? (balance?.is_expired ? 'Expired' : 'Out of minutes') : 'No Plan')}
              </span>
            </div>

            {isBlocked && (
              <div className={styles.warnBox}>
                <div className={styles.warnTitle}>
                  ⚠ {!hasPlan ? 'No active plan' : balance?.is_expired ? 'Plan expired' : 'Out of minutes'}
                </div>
                <div className={styles.warnSub}>Scheduled calls, batches, and campaigns are paused. Buy a plan to resume.</div>
              </div>
            )}

            {hasPlan && balance && (
              <>
                <div className={styles.metricsRow}>
                  <div>
                    <div className={styles.metricValue}>{balance.minutes_remaining.toLocaleString('en-IN')}</div>
                    <div className={styles.metricLabel}>minutes left</div>
                  </div>
                  <div>
                    <div className={styles.metricValueDim}>{balance.minutes_total.toLocaleString('en-IN')}</div>
                    <div className={styles.metricLabel}>total purchased</div>
                  </div>
                  <div>
                    <div className={styles.metricValueDim}>₹{balance.rate_per_minute}</div>
                    <div className={styles.metricLabel}>per minute</div>
                  </div>
                </div>

                {balance.expires_at && (
                  <div className={styles.expiryText}>
                    {balance.is_expired ? 'Expired' : 'Expires'}: {new Date(balance.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </>
            )}

            <div className={styles.actionsRow}>
              <button onClick={() => router.push('/pricing')} className={styles.primaryAction}>
                {isBlocked ? '💳 Buy a Plan' : '🔄 Buy More Minutes'}
              </button>
              <button onClick={refresh} disabled={refreshing} className={styles.refreshAction}>
                {refreshing ? <Spinner /> : '↻'} Refresh
              </button>
            </div>
          </div>

          {isBlocked && (
            <div className={styles.card}>
              <div className={styles.lockedTitle}>What's locked without minutes</div>
              <div className={styles.lockedList}>
                {[
                  ['🔒', 'Outbound AI and human calls'],
                  ['🔒', 'Batches and scheduled campaigns'],
                  ['✅', 'Dashboard and call logs — view only'],
                  ['✅', 'Settings and knowledge base editing'],
                  ['✅', 'Leads and schedules — view/manage only'],
                ].map(([icon, label], i) => (
                  <div key={i} className={styles.lockedItem}>
                    <span>{icon}</span>
                    <span style={{ color: icon === '✅' ? '#3ecf8e' : '#8a8d9e' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.card}>
            <div className={styles.accountLabel}>Account</div>
            <div className={styles.accountEmail}>{user?.email}</div>
            <div className={styles.accountHint}>Payments processed by Cashfree — for billing questions, contact support</div>
          </div>
        </div>
      )}
    </div>
  )
}
