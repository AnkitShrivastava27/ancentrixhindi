'use client'
import React from 'react'
import styles from './AnimatedBackground.module.css'

/**
 * Ambient "voice agent" animation — concentric pulse rings around a glowing
 * orb plus a small audio waveform, echoing the listening/talking motif from
 * ancentrix.com/p/ai-voice-agent.html.
 *
 * variant="full"    -> centered hero animation for the login screen
 * variant="subtle"  -> small, low-opacity corner version used as an ambient
 *                      background layer behind every app screen
 *
 * Purely decorative: pointer-events are disabled and it renders behind all
 * content (z-index: 0), so it never interferes with app functionality.
 */
/**
 * Ambient background wash — soft drifting graphite/silver glow blobs, plus
 * (for app screens) a small watermark ring band. Purely decorative:
 * pointer-events are disabled and it renders behind all content (z-index: 0).
 *
 * variant="blobs"   -> auth pages (login/pricing) — glow wash only. The
 *                      actual ring/waveform animation lives in the separate
 *                      <VoiceRingVisual /> component, placed explicitly in
 *                      the page layout so it can never overlap the logo,
 *                      title, or card.
 * variant="subtle"  -> low-opacity top-band ring watermark used behind
 *                      every app screen.
 */
export default function AnimatedBackground({ variant = 'subtle' }: { variant?: 'blobs' | 'subtle' }) {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={`${styles.blob} ${styles.blobA}`} />
      <div className={`${styles.blob} ${styles.blobB}`} />
      <div className={`${styles.blob} ${styles.blobC}`} />

      {variant === 'subtle' && (
        <div className={styles.subtleBand}>
          <span className={styles.subtleGlow} />
          <div className={styles.subtleOrbStage}>
            <span className={`${styles.subtleRing} ${styles.subtleRing1}`} />
            <span className={`${styles.subtleRing} ${styles.subtleRing2}`} />
            <span className={`${styles.subtleRing} ${styles.subtleRing3}`} />
          </div>
        </div>
      )}
    </div>
  )
}
