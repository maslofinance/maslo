// app/layout.tsx
import type { Metadata } from 'next'
import Header from './components/header'   // <— add this
// If you already import global styles (e.g. './globals.css'), keep that import too.

export const metadata: Metadata = {
  title: 'Maslo',
  description: 'Auth + Notes + Realtime',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Header />
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px' }}>
          {children}
        </div>
      </body>
    </html>
  )
}
