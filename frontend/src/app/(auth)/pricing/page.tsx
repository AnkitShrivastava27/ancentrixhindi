'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { licenseApi } from '@/lib/api'
import toast from 'react-hot-toast'
import VoiceRingVisual from '@/components/shared/VoiceRingVisual'
import styles from './pricing.module.css'

function Spinner({ white }: { white?: boolean }) {
  return <span className={styles.spinner} />
}

const TIERS = [
  { id: 'starter',    label: 'Starter',    leads: '1,000',  calls: '500 / month' },
  { id: 'pro',        label: 'Pro',        leads: '10,000', calls: '5,000 / month' },
  { id: 'enterprise', label: 'Enterprise', leads: 'Unlimited', calls: 'Unlimited' },
]

export default function PricingPage() {
  const router = useRouter()
  const { user, license, fetchLicense, logout } = useAuthStore()
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (license?.valid) router.replace('/dashboard')
  }, [license, router])

  if (!user) { router.replace('/login'); return null }

  async function handleActivate() {
    if (!key.trim()) { toast.error('Enter your activation key'); return }
    setLoading(true)
    try {
      await licenseApi.activate({ license_key: key.trim() })
      await fetchLicense()
      toast.success('License activated!')
      router.replace('/dashboard')
    } catch (e: any) {
      toast.error(e.message || 'Activation failed — check your key and try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <div className={styles.head}>
          <div className={styles.visualWrap}>
            <VoiceRingVisual size={120} />
          </div>
          <div className={styles.logoMark}>AI</div>
          <h1 className={styles.title}>Activate Your License</h1>
          <p className={styles.subtitle}>Welcome, {user.full_name || user.email}! Enter your one-time activation key to unlock your account for the year.</p>
        </div>

        <div className={styles.card}>
          <label className={styles.label}>Activation Key</label>
          <input
            value={key}
            onChange={e => setKey(e.target.value.toUpperCase())}
            placeholder="AICAL-XXXX-XXXX-XXXX-XXXX"
            className={styles.keyInput}
          />
          <button onClick={handleActivate} disabled={loading} className={`${styles.activateBtn} ${loading ? styles.activateBtnLoading : ''}`}>
            {loading ? <Spinner white /> : null}
            Activate
          </button>
          <p className={styles.hint}>
            Don't have a key yet? Contact us to purchase one — it's a single one-time payment, valid for 1 year, no recurring billing.
          </p>
        </div>

        <div className={styles.tiersGrid}>
          {TIERS.map(t => (
            <div key={t.id} className={styles.tierCard}>
              <div className={styles.tierLabel}>{t.label}</div>
              <div className={styles.tierMeta}>{t.leads} leads</div>
              <div className={styles.tierMeta}>{t.calls} calls</div>
            </div>
          ))}
        </div>

        <p className={styles.footer}>
          One-time payment · Valid for 1 year · No auto-renewal
          {' · '}
          <button onClick={() => logout()} className={styles.signOutLink}>Sign out</button>
        </p>
      </div>
    </div>
  )
}
