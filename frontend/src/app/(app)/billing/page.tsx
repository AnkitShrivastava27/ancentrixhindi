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
  const { license, fetchLicense, user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchLicense().finally(() => setLoading(false))
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    await fetchLicense({ refresh: true })
    setRefreshing(false)
    toast.success('License status refreshed')
  }

  const isActive  = !!license?.valid
  const isExpired = !isActive

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.headTitle}>License</h1>
        <p className={styles.headSub}>One-time activation key — no monthly billing</p>
      </div>

      {loading ? (
        <div className={styles.loadingWrap}><Spinner /></div>
      ) : (
        <div className={styles.stack}>

          <div className={`${styles.card} ${isActive ? styles.cardActive : styles.cardExpired}`}>
            <div className={styles.cardTop}>
              <div>
                <div className={styles.tierLabel}>Current Tier</div>
                <div className={styles.tierValue}>
                  {!license?.activated ? 'No License' : (license.tier || 'Unknown')}
                </div>
              </div>
              <span className={styles.statusPill} style={{
                color: isActive ? '#3ecf8e' : '#f25757',
                background: isActive ? 'rgba(62,207,142,0.1)' : 'rgba(242,87,87,0.1)' }}>
                {isActive ? '● Active' : '● ' + (license?.activated ? 'Expired' : 'Not Activated')}
              </span>
            </div>

            {isExpired && (
              <div className={styles.warnBox}>
                <div className={styles.warnTitle}>⚠ {license?.message || 'No active license'}</div>
                <div className={styles.warnSub}>Scheduled calls, batches, and campaigns are paused. Activate a key to resume.</div>
              </div>
            )}

            {isActive && license && (
              <>
                <div className={styles.metricsRow}>
                  {license.max_leads != null && (
                    <div>
                      <div className={styles.metricValue}>{license.max_leads.toLocaleString()}</div>
                      <div className={styles.metricLabel}>max leads</div>
                    </div>
                  )}
                  {license.max_calls_month != null && (
                    <div>
                      <div className={styles.metricValueDim}>{license.max_calls_month.toLocaleString()}</div>
                      <div className={styles.metricLabel}>calls / month</div>
                    </div>
                  )}
                </div>

                {license.expires_at && (
                  <div className={styles.expiryText}>
                    Expires: {new Date(license.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </>
            )}

            <div className={styles.actionsRow}>
              <button onClick={() => router.push('/pricing')} className={styles.primaryAction}>
                {isExpired ? '🔑 Activate a Key' : '🔄 Renew / Change Key'}
              </button>
              <button onClick={refresh} disabled={refreshing} className={styles.refreshAction}>
                {refreshing ? <Spinner /> : '↻'} Refresh
              </button>
            </div>
          </div>

          {isExpired && (
            <div className={styles.card}>
              <div className={styles.lockedTitle}>What's locked without a license</div>
              <div className={styles.lockedList}>
                {[
                  ['🔒', 'Outbound batch calls and schedules'],
                  ['🔒', 'Email campaign sending'],
                  ['🔒', 'Lead import (CSV)'],
                  ['✅', 'Dashboard and call logs — view only'],
                  ['✅', 'Settings and knowledge base editing'],
                  ['✅', 'Inbound calls — still receive calls'],
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
            <div className={styles.accountHint}>For a new activation key, contact support</div>
          </div>
        </div>
      )}
    </div>
  )
}
