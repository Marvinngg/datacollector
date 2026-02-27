import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeProvider } from '@/components/layout/theme-provider'

export const metadata: Metadata = {
  title: 'Predict Collector',
  description: '数据采集管理',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {/* Top drag region for Electron window dragging */}
          <div className="drag-region h-8 fixed top-0 left-0 right-0 z-50" />
          <div className="flex h-screen pt-8">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
