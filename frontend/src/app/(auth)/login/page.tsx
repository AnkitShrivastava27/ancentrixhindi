'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../../store'
import VoiceRingVisual from '../../../components/shared/VoiceRingVisual'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { loginWithEmail } = useAuthStore()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await loginWithEmail(email, password)
      router.push('/dashboard')
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong'
      setError(msg.toLowerCase().includes('invalid') ? 'Invalid email or password.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>AV</div>
          <h1 className={styles.title}>Ancentrix Voice</h1>
          <p className={styles.subtitle}>Automated sales & support</p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardHeadTitle}>Login</h2>
            <p className={styles.cardHeadSub}>Use the credentials you were given for this account.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div>
              <label className={styles.label}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required className={styles.input} />
            </div>

            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className={`${styles.submitBtn} ${loading ? styles.submitBtnLoading : ''}`}>
              {loading && <span className={styles.spinner} />}
              Login
            </button>
          </form>

          <p className={styles.hint}>
            Don't have login details? Contact whoever set up this deployment for you.
          </p>
          <p className={styles.hint}>
            New here? <Link href="/register">Create an account</Link>
          </p>
        </div>

        <p className={styles.footer}>
          New Age Tech
        </p>
      </div>

      <div className={styles.visualCol}>
        <VoiceRingVisual size={320} />
      </div>
    </div>
  )
}
