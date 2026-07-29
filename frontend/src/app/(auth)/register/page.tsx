'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../../store'
import VoiceRingVisual from '../../../components/shared/VoiceRingVisual'
import styles from '../login/login.module.css'

export default function RegisterPage() {
  const router = useRouter()
  const { registerWithLicense } = useAuthStore()

  const [fullName, setFullName]       = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [licenseKey, setLicenseKey]   = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  // Client-side checks mirror the backend's validators (app/api/routes/auth.py
  // RegisterRequest) so the person gets instant feedback instead of a round
  // trip for something this cheap to check locally. The backend re-validates
  // everything regardless — this is purely for a faster/friendlier UX, not
  // the actual security boundary.
  function validate(): string | null {
    if (fullName.trim().length < 2) return 'Please enter your full name.'
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    if (!licenseKey.trim()) return 'A license key is required to sign up.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true); setError('')
    try {
      await registerWithLicense({
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        license_key: licenseKey.trim().toUpperCase(),
      })
      router.push('/dashboard')
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>AV</div>
          <h1 className={styles.title}>Ancentrix Voice</h1>
          <p className={styles.subtitle}>Automated sales & support</p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardHeadTitle}>Create your account</h2>
            <p className={styles.cardHeadSub}>You'll need the license key you were given to sign up.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div>
              <label className={styles.label}>Full name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Jane Doe" required className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" required className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Confirm password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••" required className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>License key</label>
              <input type="text" value={licenseKey} onChange={e => setLicenseKey(e.target.value)}
                placeholder="AICAL-XXXX-XXXX-XXXX-XXXX" required className={styles.input}
                style={{ textTransform: 'uppercase' }} />
            </div>

            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className={`${styles.submitBtn} ${loading ? styles.submitBtnLoading : ''}`}>
              {loading && <span className={styles.spinner} />}
              Create account
            </button>
          </form>

          <p className={styles.hint}>
            Already have an account? <Link href="/login">Log in</Link>
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
