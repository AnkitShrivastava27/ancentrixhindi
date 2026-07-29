'use client'
import React from 'react'
import styles from './VoiceRingVisual.module.css'

const RING_DELAYS = [0, 0.75, 1.5, 2.25,,2.5,2.75,3,3.25]
const WAVE_COUNT  = 14

/**
 * Standalone voice-agent ring + waveform visual, matching the structure of
 * the reference site's `.hero-visual` block:
 *   voice-ring-container > voice-ring ×4 + voice-core + waveform > wave-bar ×7
 *
 * Unlike AnimatedBackground, this is a normal in-flow element (not a fixed
 * full-screen overlay) — drop it into a flex/grid column next to your
 * content and it will never overlap text, logos, or cards.
 */
export default function VoiceRingVisual({ size = 620 }: { size?: number }) {
  return (
    <div className={styles.voiceRingContainer} style={{ width: size, height: size }} aria-hidden="true">
      {RING_DELAYS.map((d, i) => (
        <span key={i} className={styles.voiceRing} style={{ animationDelay: `${d}s` }} />
      ))}
      <div className={styles.voiceCore}>
        <div className={styles.waveform}>
          {Array.from({ length: WAVE_COUNT }).map((_, i) => (
            <span key={i} className={styles.waveBar} style={{ animationDelay: `${-i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
