import type { Metadata } from 'next'
// @ts-ignore: CSS module declaration missing in this environment
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Ancentrix voice',
  description: 'AI-powered sales and support call center',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-right" toastOptions={{
          style: {
            background: '#1e1f28', color: '#f0f1f5',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', fontSize: '13px', padding: '10px 14px',
          },
        }} />
        {children}
      </body>
    </html>
  )
}