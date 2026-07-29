import AnimatedBackground from '@/components/shared/AnimatedBackground'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnimatedBackground variant="blobs" />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </>
  )
}
