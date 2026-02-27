'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Database, FolderOpen, Clock, Settings, Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from './theme-provider'

const navItems = [
  { href: '/', label: '概览', icon: BarChart3 },
  { href: '/sources', label: '数据源', icon: Database },
  { href: '/contents', label: '内容库', icon: FolderOpen },
  { href: '/tasks', label: '任务', icon: Clock },
  { href: '/settings', label: '设置', icon: Settings },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const options = [
    { value: 'light' as const, icon: Sun, title: '浅色' },
    { value: 'dark' as const, icon: Moon, title: '深色' },
    { value: 'system' as const, icon: Monitor, title: '跟随系统' },
  ]

  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.title}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            theme === opt.value
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 border-r bg-card flex flex-col no-drag">
      <div className="px-4 py-3 border-b">
        <h1 className="text-base font-semibold tracking-tight">Predict Collector</h1>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t flex items-center justify-between">
        <ThemeToggle />
        <span className="text-[10px] text-muted-foreground">v0.1.0</span>
      </div>
    </aside>
  )
}
