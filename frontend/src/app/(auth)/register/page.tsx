'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../../store'
import VoiceRingVisual from '../../../components/shared/VoiceRingVisual'
import styles from '../login/login.module.css'

// Magic-link email verification (Aug 2026)
// ─────────────────────────────────────────
// All decisions here are made by the backend (app/api/routes/auth.py) —
// this page only reflects whatever state it reports:
//
//   1. Submit the sign-up form (Firebase client SDK, unchanged) →
//      immediately ask the backend to send a verification email.
//   2. Show "check your email" and poll GET /auth/verification-status
//      every few seconds — the backend is the one actually confirming
//      with Firebase whether the link was clicked.
//   3. The moment it reports verified, navigate to /pricing on our own —
//      no user action needed.
//   4. If the verification link is opened in a DIFFERENT tab/browser
//      (its `continueUrl` points back at this same page with
//      ?verified=1), Firebase's own hosted page has already completed
//      the verification itself before redirecting here — this page just
//      confirms it and, if that tab happens to be logged in too,
//      forwards to /pricing; otherwise it tells the person to go back to
//      where they signed up (which is independently polling and will
//      pick the change up on its own).
const POLL_INTERVAL_MS = 3000

type Step = 'form' | 'awaiting-verification' | 'confirming-link'

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  )
}

function RegisterPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const cameFromEmailLink = params.get('verified') === '1'

  const { register, user, hasHydrated, sendVerificationEmail, checkVerificationStatus } = useAuthStore()

  const [step, setStep] = useState<Step>(cameFromEmailLink ? 'confirming-link' : 'form')

  const [fullName, setFullName]       = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending]     = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function validate(): string | null {
    if (fullName.trim().length < 2) return 'Please enter your full name.'
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    if (!termsAccepted) return 'Please accept the Terms and Conditions.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true); setError('')
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
      })
      await sendVerificationEmail()
      setStep('awaiting-verification')
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return
    setResending(true)
    try {
      const res = await sendVerificationEmail()
      if (res.already_verified) {
        // Backend says it's already verified (e.g. clicked in another
        // tab while this button sat idle) — just move forward.
        router.push('/pricing')
        return
      }
      setResendCooldown(30)
    } catch {
      // apiClient already toasts the error
    } finally {
      setResending(false)
    }
  }

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Poll the backend for verification while waiting — either right after
  // submitting the form, or after landing back here from the email link.
  useEffect(() => {
    if (step !== 'awaiting-verification' && step !== 'confirming-link') return

    let cancelled = false
    async function poll() {
      try {
        const verified = await checkVerificationStatus()
        if (cancelled) return
        if (verified) {
          router.push('/pricing')
          return
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled) pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS)
    }
    poll()
    return () => {
      cancelled = true
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [step])

  // If this tab landed here via the email link (?verified=1) but isn't
  // itself logged in (common — the link is usually opened in a fresh
  // tab), there's nothing more this tab can do; the original tab where
  // they signed up is already polling on its own and will move forward
  // by itself. Wait for hydration first so we don't flash this
  // incorrectly before the session has a chance to restore.
  const strandedOnLinkTab = step === 'confirming-link' && hasHydrated && !user

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>AV</div>
          <h1 className={styles.title}>Ancentrix Voice</h1>
          <p className={styles.subtitle}>Automated sales & support</p>
        </div>

        <div className={styles.card}>
          {step === 'form' && (
            <>
              <div className={styles.cardHead}>
                <h2 className={styles.cardHeadTitle}>Create your account</h2>
                <p className={styles.cardHeadSub}>Sign up free — verify your email, then pick a calling plan.</p>
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

                <label style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:12,color:'#aaa',lineHeight:1.5,cursor:'pointer'}}>
                  <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{marginTop:3}} />
                  <span>I agree to the Terms and Conditions. <a href="/term" target="_blank" rel="noreferrer" style={{textDecoration:'underline',color:'inherit'}}>read term and condition</a></span>
                </label>

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" disabled={loading} className={`${styles.submitBtn} ${loading ? styles.submitBtnLoading : ''}`}>
                  {loading && <span className={styles.spinner} />}
                  Create account
                </button>
              </form>

              <p className={styles.hint}>
                Already have an account? <Link href="/login">Log in</Link>
              </p>
            </>
          )}

          {step === 'awaiting-verification' && (
            <>
              <div className={styles.cardHead}>
                <h2 className={styles.cardHeadTitle}>Check your email</h2>
                <p className={styles.cardHeadSub}>
                  We sent a verification link to <strong>{email}</strong> — check your inbox
                  (and spam folder). Click it to continue to payment; this page will move on
                  automatically the moment it's verified.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <span className={styles.spinner} />
              </div>
              <p className={styles.hint}>
                Didn't get it?{' '}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resending}
                  style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: resendCooldown > 0 ? 'default' : 'pointer', padding: 0, font: 'inherit' }}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? 'Sending…' : 'Resend email'}
                </button>
              </p>
            </>
          )}

          {step === 'confirming-link' && !strandedOnLinkTab && (
            <>
              <div className={styles.cardHead}>
                <h2 className={styles.cardHeadTitle}>Confirming your email…</h2>
                <p className={styles.cardHeadSub}>One moment — we're confirming this with your account.</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <span className={styles.spinner} />
              </div>
            </>
          )}

          {strandedOnLinkTab && (
            <>
              <div className={styles.cardHead}>
                <h2 className={styles.cardHeadTitle}>✓ Email verified</h2>
                <p className={styles.cardHeadSub}>
                  Your email is confirmed. Go back to the tab where you signed up — it'll
                  continue on its own. Or log in here to carry on.
                </p>
              </div>
              <Link href="/login" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Log in
              </Link>
            </>
          )}
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
