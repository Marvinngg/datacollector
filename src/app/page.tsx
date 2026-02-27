'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FolderOpen, RefreshCw, Database, Plus, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Stats {
  total: number
  today: number
  byPlatform: Record<string, number>
  recentItems: Array<{
    id: number
    title: string
    author: string | null
    source_type: string
    source_name: string
    collected_at: string
    url: string | null
  }>
  sourcesCount: number
  activeSourcesCount: number
  dataDir: string
}

const platformLabels: Record<string, string> = {
  bilibili: 'B站',
  youtube: 'YouTube',
  zsxq: '知识星球',
  rss: 'RSS',
  web: '网页',
}

const platformColors: Record<string, string> = {
  bilibili: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  youtube: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  zsxq: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  rss: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  web: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

export default function OverviewPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [collecting, setCollecting] = useState(false)
  const [collectResult, setCollectResult] = useState<{ total: number; newItems: number; duration: number } | null>(null)

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch {
      setStats(null)
    }
  }

  useEffect(() => { fetchStats() }, [])

  const handleCollectAll = async () => {
    setCollecting(true)
    setCollectResult(null)
    const startTime = Date.now()
    try {
      const res = await fetch('/api/collect', { method: 'POST' })
      const data = await res.json()
      const results = data.results || []
      const total = results.reduce((sum: number, r: any) => sum + (r.items_found || 0), 0)
      const newItems = results.reduce((sum: number, r: any) => sum + (r.items_new || 0), 0)
      const duration = Math.round((Date.now() - startTime) / 1000)
      setCollectResult({ total, newItems, duration })
      await fetchStats()
    } finally {
      setCollecting(false)
    }
  }

  /** 点击内容行 → 跳到内容库并定位到该条 */
  const handleItemClick = (id: number) => {
    router.push(`/contents?id=${id}`)
  }

  /** 阻止行点击冒泡，只打开原链接 */
  const handleOpenUrl = (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    const needsElectron = url.includes('zsxq.com') || url.includes('bilibili.com')
    if (needsElectron && (window as any).electronAPI?.openUrl) {
      (window as any).electronAPI.openUrl(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const isEmpty = stats && stats.sourcesCount === 0

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">概览</h2>
        {!isEmpty && (
          <div className="flex items-center gap-3">
            {collectResult && (
              <span className="text-sm text-green-600 dark:text-green-400">
                发现 {collectResult.total} 条，新增 {collectResult.newItems} 条，耗时 {collectResult.duration}s
              </span>
            )}
            <Button onClick={handleCollectAll} disabled={collecting} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${collecting ? 'animate-spin' : ''}`} />
              {collecting ? '采集中...' : '立即采集'}
            </Button>
          </div>
        )}
      </div>

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Database className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-1">开始使用</p>
            <p className="text-sm text-muted-foreground mb-6">
              添加你要关注的数据源，开始自动采集内容
            </p>
            <div className="flex flex-col items-center gap-3">
              <Link href="/sources">
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" />
                  添加第一个数据源
                </Button>
              </Link>
              <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground">
                先去完成平台登录
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">总采集量</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats?.total ?? '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">今日新增</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats?.today ?? '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">数据源</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {stats?.activeSourcesCount ?? '-'}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / {stats?.sourcesCount ?? '-'}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">平台分布</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {stats && Object.entries(stats.byPlatform).map(([platform, count]) => (
                    <Badge key={platform} variant="secondary" className={platformColors[platform] || ''}>
                      {platformLabels[platform] || platform}: {count}
                    </Badge>
                  ))}
                  {stats && Object.keys(stats.byPlatform).length === 0 && (
                    <span className="text-sm text-muted-foreground">暂无数据</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">最近采集</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  暂无采集内容，点击「立即采集」开始
                </p>
              ) : (
                <div className="space-y-1">
                  {stats?.recentItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${platformColors[item.source_type] || ''}`}>
                          {platformLabels[item.source_type] || item.source_type}
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.author && <span>{item.author} · </span>}
                            {item.source_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {item.collected_at?.split('T')[0]}
                        </span>
                        {/* 原链接按钮：不触发行跳转 */}
                        {item.url && (
                          <button
                            onClick={(e) => handleOpenUrl(e, item.url!)}
                            className="text-muted-foreground hover:text-foreground p-1 rounded"
                            title="打开原链接"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                数据目录
              </CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-sm bg-muted px-3 py-1.5 rounded-md">
                {stats?.dataDir || './data/'}
              </code>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
