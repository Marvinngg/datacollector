'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Plus, Pencil, Trash2, AlertCircle, Loader2, Check, MoreHorizontal, Clock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Source, SourceType } from '@/types'

interface BiliFollowing {
  mid: number
  name: string
  avatar: string
  sign: string
  tag: string | null
}

interface ZsxqGroup {
  group_id: string
  name: string
  description: string
  member_count: number
  topic_count: number
  owner_name: string
}

interface YouTubeChannel {
  channel_id: string
  name: string
  avatar: string
  subscriber_count: string
}

const cronLabels: Record<string, string> = {
  '0 */6 * * *': '每 6 小时',
  '0 */12 * * *': '每 12 小时',
  '0 8 * * *': '每天 08:00',
  '0 8,20 * * *': '每天 08:00 和 20:00',
  '0 8 * * 1,4': '每周一、周四 08:00',
}

const platformConfig: Record<SourceType, {
  label: string
  color: string
  icon: string
  description: string
  fields?: { key: string; label: string; placeholder: string; help?: string; required?: boolean }[]
}> = {
  bilibili: {
    label: 'B站',
    color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
    icon: '📺',
    description: '导入你的 B站 关注列表，采集 UP 主视频字幕',
  },
  youtube: {
    label: 'YouTube',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: '▶️',
    description: '关注 YouTube 频道或播放列表',
    fields: [
      { key: 'channel_id', label: '频道 ID', placeholder: '例: UCxxxxxxx', help: '在频道页面 URL 中获取' },
      { key: 'playlist_id', label: '播放列表 ID', placeholder: '例: PLxxxxxxx', help: '和频道 ID 填一个即可' },
    ],
  },
  zsxq: {
    label: '知识星球',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    icon: '🌍',
    description: '导入你已加入的知识星球，采集帖子内容',
  },
  rss: {
    label: 'RSS',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    icon: '📡',
    description: '订阅 RSS/Atom 信息源',
    fields: [
      { key: 'feed_url', label: '订阅地址', placeholder: '例: https://example.com/feed.xml', required: true },
    ],
  },
  web: {
    label: '网页',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    icon: '🌐',
    description: '采集单个网页正文内容',
    fields: [
      { key: 'url', label: '网页地址', placeholder: 'https://...', required: true },
    ],
  },
}

const maxItemsOptions = [
  { value: '10', label: '最新 10 条' },
  { value: '20', label: '最新 20 条' },
  { value: '50', label: '最新 50 条' },
  { value: '100', label: '最新 100 条' },
]

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStep, setDialogStep] = useState<'platform' | 'bili-import' | 'zsxq-import' | 'youtube-import' | 'fields'>('platform')
  const [editing, setEditing] = useState<Source | null>(null)
  const [selectedType, setSelectedType] = useState<SourceType | null>(null)
  const [configFields, setConfigFields] = useState<Record<string, string>>({})
  const [collectingAll, setCollectingAll] = useState(false)
  const [collectAllProgress, setCollectAllProgress] = useState<{ done: number; total: number; newItems: number } | null>(null)
  const [collectAllResult, setCollectAllResult] = useState<{ total: number; newItems: number; duration: number } | null>(null)
  const [cronSchedule, setCronSchedule] = useState('0 8 * * *')

  // B站关注列表导入
  const [biliFollowings, setBiliFollowings] = useState<BiliFollowing[]>([])
  const [biliLoading, setBiliLoading] = useState(false)
  const [biliError, setBiliError] = useState('')
  const [biliSelected, setBiliSelected] = useState<Set<number>>(new Set())
  const [biliImporting, setBiliImporting] = useState(false)

  // YouTube 订阅导入
  const [ytChannels, setYtChannels] = useState<YouTubeChannel[]>([])
  const [ytLoading, setYtLoading] = useState(false)
  const [ytError, setYtError] = useState('')
  const [ytSelected, setYtSelected] = useState<Set<string>>(new Set())
  const [ytImporting, setYtImporting] = useState(false)

  // 知识星球导入
  const [zsxqGroups, setZsxqGroups] = useState<ZsxqGroup[]>([])
  const [zsxqLoading, setZsxqLoading] = useState(false)
  const [zsxqError, setZsxqError] = useState('')
  const [zsxqSelected, setZsxqSelected] = useState<Set<string>>(new Set())
  const [zsxqImporting, setZsxqImporting] = useState(false)

  const fetchSources = async () => {
    const res = await fetch('/api/sources')
    const data = await res.json()
    setSources(data.sources || [])
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings?.cron_schedule) {
        setCronSchedule(data.settings.cron_schedule)
      }
    } catch {}
  }

  useEffect(() => {
    fetchSources()
    fetchSettings()
  }, [])

  const existingBiliMids = new Set(
    sources.filter((s) => s.type === 'bilibili').map((s) => String(s.config.mid))
  )

  const existingZsxqGroupIds = new Set(
    sources.filter((s) => s.type === 'zsxq').map((s) => String(s.config.group_id))
  )

  const existingYtChannelIds = new Set(
    sources.filter((s) => s.type === 'youtube').map((s) => String(s.config.channel_id))
  )

  const openCreate = () => {
    setEditing(null)
    setDialogStep('platform')
    setSelectedType(null)
    setConfigFields({})
    setDialogOpen(true)
  }

  const selectPlatform = (type: SourceType) => {
    setSelectedType(type)
    setConfigFields({ max_items: '20' })
    if (type === 'bilibili') {
      setDialogStep('bili-import')
      loadBiliFollowings()
    } else if (type === 'zsxq') {
      setDialogStep('zsxq-import')
      loadZsxqGroups()
    } else if (type === 'youtube') {
      setDialogStep('youtube-import')
      loadYouTubeSubscriptions()
    } else {
      setDialogStep('fields')
    }
  }

  const loadYouTubeSubscriptions = async () => {
    setYtLoading(true)
    setYtError('')
    setYtChannels([])
    setYtSelected(new Set())
    try {
      const res = await fetch('/api/youtube/subscriptions')
      const data = await res.json()
      if (data.error) {
        setYtError(data.error)
      } else {
        setYtChannels(data.channels || [])
      }
    } catch (err: any) {
      setYtError(err.message)
    } finally {
      setYtLoading(false)
    }
  }

  const toggleYtSelect = (channelId: string) => {
    setYtSelected((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }

  const selectAllYt = () => {
    const notImported = ytChannels.filter((c) => !existingYtChannelIds.has(c.channel_id))
    if (ytSelected.size === notImported.length) setYtSelected(new Set())
    else setYtSelected(new Set(notImported.map((c) => c.channel_id)))
  }

  const importSelectedYt = async () => {
    setYtImporting(true)
    try {
      const selected = ytChannels.filter((c) => ytSelected.has(c.channel_id))
      for (const channel of selected) {
        await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `YouTube ${channel.name}`,
            type: 'youtube',
            config: { channel_id: channel.channel_id, max_items: '20', channel_name: channel.name },
          }),
        })
      }
      setDialogOpen(false)
      fetchSources()
    } finally {
      setYtImporting(false)
    }
  }

  const loadBiliFollowings = async () => {
    setBiliLoading(true)
    setBiliError('')
    setBiliFollowings([])
    setBiliSelected(new Set())
    try {
      const res = await fetch('/api/bilibili/followings')
      const data = await res.json()
      if (data.error) {
        setBiliError(data.error)
      } else {
        setBiliFollowings(data.users || [])
      }
    } catch (err: any) {
      setBiliError(err.message)
    } finally {
      setBiliLoading(false)
    }
  }

  const toggleBiliSelect = (mid: number) => {
    setBiliSelected((prev) => {
      const next = new Set(prev)
      if (next.has(mid)) {
        next.delete(mid)
      } else {
        next.add(mid)
      }
      return next
    })
  }

  const selectAllBili = () => {
    const notImported = biliFollowings.filter((u) => !existingBiliMids.has(String(u.mid)))
    if (biliSelected.size === notImported.length) {
      setBiliSelected(new Set())
    } else {
      setBiliSelected(new Set(notImported.map((u) => u.mid)))
    }
  }

  const importSelectedBili = async () => {
    setBiliImporting(true)
    try {
      const selected = biliFollowings.filter((u) => biliSelected.has(u.mid))
      for (const user of selected) {
        await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `B站 ${user.name}`,
            type: 'bilibili',
            config: { mid: String(user.mid), max_items: '20', up_name: user.name },
          }),
        })
      }
      setDialogOpen(false)
      fetchSources()
    } finally {
      setBiliImporting(false)
    }
  }

  // 知识星球导入
  const loadZsxqGroups = async () => {
    setZsxqLoading(true)
    setZsxqError('')
    setZsxqGroups([])
    setZsxqSelected(new Set())
    try {
      const res = await fetch('/api/zsxq/groups')
      const data = await res.json()
      if (data.error) {
        setZsxqError(data.error)
      } else {
        setZsxqGroups(data.groups || [])
      }
    } catch (err: any) {
      setZsxqError(err.message)
    } finally {
      setZsxqLoading(false)
    }
  }

  const toggleZsxqSelect = (groupId: string) => {
    setZsxqSelected((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const selectAllZsxq = () => {
    const notImported = zsxqGroups.filter((g) => !existingZsxqGroupIds.has(g.group_id))
    if (zsxqSelected.size === notImported.length) {
      setZsxqSelected(new Set())
    } else {
      setZsxqSelected(new Set(notImported.map((g) => g.group_id)))
    }
  }

  const importSelectedZsxq = async () => {
    setZsxqImporting(true)
    try {
      const selected = zsxqGroups.filter((g) => zsxqSelected.has(g.group_id))
      for (const group of selected) {
        await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `知识星球 ${group.name}`,
            type: 'zsxq',
            config: { group_id: group.group_id, max_items: '20', group_name: group.name },
          }),
        })
      }
      setDialogOpen(false)
      fetchSources()
    } finally {
      setZsxqImporting(false)
    }
  }

  const openEdit = (source: Source) => {
    setEditing(source)
    setSelectedType(source.type)
    setConfigFields(source.config as Record<string, string>)
    setDialogStep('fields')
    setDialogOpen(true)
  }

  const getSourceName = (type: SourceType, fields: Record<string, string>) => {
    switch (type) {
      case 'bilibili': return `B站 ${fields.up_name || `UP主 ${fields.mid}`}`
      case 'youtube': return `YouTube ${fields.channel_name || fields.channel_id || fields.playlist_id || ''}`
      case 'zsxq': return `知识星球 ${fields.group_id || ''}`
      case 'rss': {
        try { return `RSS ${new URL(fields.feed_url).hostname}` } catch { return 'RSS 订阅' }
      }
      case 'web': {
        try { return `网页 ${new URL(fields.url).hostname}` } catch { return '网页' }
      }
      default: return type
    }
  }

  const handleSave = async () => {
    if (!selectedType) return
    const name = editing?.name || getSourceName(selectedType, configFields)
    const body = { name, type: selectedType, config: configFields }

    if (editing) {
      await fetch(`/api/sources/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    setDialogOpen(false)
    fetchSources()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认取消关注？已采集的内容不会删除。')) return
    await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    fetchSources()
  }

  const handleToggleActive = async (source: Source) => {
    await fetch(`/api/sources/${source.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !source.is_active }),
    })
    fetchSources()
  }

  const handleCollectAll = async () => {
    setCollectingAll(true)
    setCollectAllResult(null)
    const activeSources = sources.filter(s => s.is_active)
    setCollectAllProgress({ done: 0, total: activeSources.length, newItems: 0 })
    const startTime = Date.now()
    try {
      const res = await fetch('/api/collect', { method: 'POST' })
      const data = await res.json()
      const results = data.results || []
      const total = results.reduce((sum: number, r: any) => sum + (r.items_found || 0), 0)
      const newItems = results.reduce((sum: number, r: any) => sum + (r.items_new || 0), 0)
      const duration = Math.round((Date.now() - startTime) / 1000)
      setCollectAllResult({ total, newItems, duration })
      setCollectAllProgress(null)
      fetchSources()
    } finally {
      setCollectingAll(false)
    }
  }

  const hasRequired = () => {
    if (!selectedType) return false
    const fields = platformConfig[selectedType]?.fields
    if (!fields) return true
    return fields.filter((f) => f.required).every((f) => configFields[f.key]?.trim())
  }

  const activeCount = sources.filter(s => s.is_active).length
  const cronLabel = cronLabels[cronSchedule] || cronSchedule

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      {/* 采集说明横幅 */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">自动采集：{cronLabel}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{activeCount} 个数据源启用中</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>增量模式：只获取新内容，已采集的自动跳过，不会重复</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={handleCollectAll} disabled={collectingAll} size="sm" variant="outline">
                {collectingAll ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {collectingAll ? '采集中...' : '全部采集'}
              </Button>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                添加源
              </Button>
            </div>
          </div>
          {/* 采集进度/结果反馈 */}
          {collectingAll && collectAllProgress && (
            <div className="mt-3 space-y-1.5">
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-muted-foreground">
                采集中... {collectAllProgress.total} 个数据源
              </p>
            </div>
          )}
          {collectAllResult && !collectingAll && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              采集完成：{sources.filter(s => s.is_active).length} 个数据源，新增 {collectAllResult.newItems} 条，耗时 {collectAllResult.duration}s
            </p>
          )}
        </CardContent>
      </Card>

      {/* 数据源列表 */}
      {sources.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">还没有数据源</p>
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />
              添加第一个
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {sources.map((source) => {
            const p = platformConfig[source.type]
            const statusDot = source.last_error
              ? 'bg-red-500'
              : source.last_collected_at && source.is_active
                ? 'bg-green-500'
                : 'bg-muted-foreground/30'
            return (
              <Card key={source.id} className={cn('transition-shadow hover:shadow-md', !source.is_active && 'opacity-50')}>
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <span className="text-xl shrink-0">{p?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{source.name}</span>
                      <span className={cn('h-2 w-2 rounded-full shrink-0', statusDot)} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{p?.label}</span>
                      {source.config.max_items && (
                        <>
                          <span>·</span>
                          <span>每次 {source.config.max_items} 条</span>
                        </>
                      )}
                      {source.last_collected_at && (
                        <>
                          <span>·</span>
                          <span>上次 {source.last_collected_at.replace('T', ' ').slice(5, 16)}</span>
                        </>
                      )}
                    </div>
                    {source.last_error && (
                      <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span className="truncate">{source.last_error.slice(0, 100)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={source.is_active}
                      onCheckedChange={() => handleToggleActive(source)}
                      className="scale-75"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(source)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(source.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog 保持原有逻辑 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={cn('sm:max-w-md', (dialogStep === 'bili-import' || dialogStep === 'zsxq-import' || dialogStep === 'youtube-import') && 'sm:max-w-lg')}>
          {dialogStep === 'platform' && (
            <>
              <DialogHeader>
                <DialogTitle>添加数据源</DialogTitle>
                <DialogDescription>选择平台类型</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 py-2">
                {(Object.entries(platformConfig) as [SourceType, typeof platformConfig[SourceType]][]).map(([type, p]) => (
                  <button
                    key={type}
                    onClick={() => selectPlatform(type)}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                  >
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {dialogStep === 'bili-import' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>📺</span>
                  导入 B站 关注列表
                </DialogTitle>
                <DialogDescription>
                  从你的 B站 账号导入已关注的 UP 主，勾选要采集的
                </DialogDescription>
              </DialogHeader>

              {biliLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-3">正在获取关注列表...</p>
                </div>
              ) : biliError ? (
                <div className="py-8 text-center space-y-3">
                  <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
                  <p className="text-sm text-destructive">{biliError}</p>
                  <p className="text-xs text-muted-foreground">
                    请先到「设置」页面登录 B站
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      共 {biliFollowings.length} 个关注，已导入 {existingBiliMids.size} 个
                    </span>
                    <Button variant="ghost" size="sm" onClick={selectAllBili} className="text-xs h-7">
                      {biliSelected.size === biliFollowings.filter((u) => !existingBiliMids.has(String(u.mid))).length
                        ? '取消全选' : '全选未导入'}
                    </Button>
                  </div>
                  <div className="space-y-0.5 max-h-96 overflow-y-auto -mx-1 px-1">
                    {biliFollowings.map((user) => {
                      const imported = existingBiliMids.has(String(user.mid))
                      const selected = biliSelected.has(user.mid)
                      return (
                        <button
                          key={user.mid}
                          onClick={() => !imported && toggleBiliSelect(user.mid)}
                          disabled={imported}
                          className={cn(
                            'flex items-center gap-3 w-full p-2 rounded-lg transition-colors text-left',
                            imported ? 'opacity-50 cursor-default' : 'hover:bg-muted cursor-pointer',
                            selected && !imported && 'bg-primary/5 ring-1 ring-primary/20'
                          )}
                        >
                          <div className={cn(
                            'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors',
                            imported ? 'bg-muted border-muted-foreground/20' : selected ? 'bg-primary border-primary' : 'border-input'
                          )}>
                            {(imported || selected) && <Check className={cn('h-3 w-3', imported ? 'text-muted-foreground' : 'text-primary-foreground')} />}
                          </div>
                          <img
                            src={user.avatar}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover bg-muted shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{user.name}</span>
                              {imported && <Badge variant="secondary" className="text-[10px] shrink-0">已导入</Badge>}
                              {user.tag && !imported && (
                                <span className="text-[10px] text-muted-foreground shrink-0">{user.tag}</span>
                              )}
                            </div>
                            {user.sign && (
                              <p className="text-xs text-muted-foreground truncate">{user.sign}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogStep('platform')} className="mr-auto">
                  返回
                </Button>
                {!biliError && !biliLoading && (
                  <Button
                    onClick={importSelectedBili}
                    disabled={biliSelected.size === 0 || biliImporting}
                  >
                    {biliImporting ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />导入中...</>
                    ) : (
                      <>导入 {biliSelected.size} 个 UP 主</>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {dialogStep === 'zsxq-import' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>🌍</span>
                  导入知识星球
                </DialogTitle>
                <DialogDescription>
                  从你的账号导入已加入的知识星球，勾选要采集的
                </DialogDescription>
              </DialogHeader>

              {zsxqLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-3">正在获取星球列表...</p>
                </div>
              ) : zsxqError ? (
                <div className="py-8 text-center space-y-3">
                  <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
                  <p className="text-sm text-destructive">{zsxqError}</p>
                  <p className="text-xs text-muted-foreground">
                    请先到「设置」页面登录知识星球
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      共 {zsxqGroups.length} 个星球，已导入 {existingZsxqGroupIds.size} 个
                    </span>
                    <Button variant="ghost" size="sm" onClick={selectAllZsxq} className="text-xs h-7">
                      {zsxqSelected.size === zsxqGroups.filter((g) => !existingZsxqGroupIds.has(g.group_id)).length
                        ? '取消全选' : '全选未导入'}
                    </Button>
                  </div>
                  <div className="space-y-0.5 max-h-96 overflow-y-auto -mx-1 px-1">
                    {zsxqGroups.map((group) => {
                      const imported = existingZsxqGroupIds.has(group.group_id)
                      const selected = zsxqSelected.has(group.group_id)
                      return (
                        <button
                          key={group.group_id}
                          onClick={() => !imported && toggleZsxqSelect(group.group_id)}
                          disabled={imported}
                          className={cn(
                            'flex items-center gap-3 w-full p-2.5 rounded-lg transition-colors text-left',
                            imported ? 'opacity-50 cursor-default' : 'hover:bg-muted cursor-pointer',
                            selected && !imported && 'bg-primary/5 ring-1 ring-primary/20'
                          )}
                        >
                          <div className={cn(
                            'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors',
                            imported ? 'bg-muted border-muted-foreground/20' : selected ? 'bg-primary border-primary' : 'border-input'
                          )}>
                            {(imported || selected) && <Check className={cn('h-3 w-3', imported ? 'text-muted-foreground' : 'text-primary-foreground')} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{group.name}</span>
                              {imported && <Badge variant="secondary" className="text-[10px] shrink-0">已导入</Badge>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span>{group.owner_name}</span>
                              <span>·</span>
                              <span>{group.member_count} 成员</span>
                              <span>·</span>
                              <span>{group.topic_count} 帖子</span>
                            </div>
                            {group.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{group.description}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogStep('platform')} className="mr-auto">
                  返回
                </Button>
                {!zsxqError && !zsxqLoading && (
                  <Button
                    onClick={importSelectedZsxq}
                    disabled={zsxqSelected.size === 0 || zsxqImporting}
                  >
                    {zsxqImporting ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />导入中...</>
                    ) : (
                      <>导入 {zsxqSelected.size} 个星球</>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {dialogStep === 'youtube-import' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>▶️</span>
                  导入 YouTube 订阅
                </DialogTitle>
                <DialogDescription>
                  从你的 YouTube 账号导入已订阅的频道，勾选要采集的
                </DialogDescription>
              </DialogHeader>

              {ytLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-3">正在获取订阅列表...</p>
                </div>
              ) : ytError ? (
                <div className="py-8 text-center space-y-3">
                  <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
                  <p className="text-sm text-destructive">{ytError}</p>
                  <p className="text-xs text-muted-foreground">
                    请先到「设置」页面登录 YouTube
                  </p>
                  <button
                    className="text-xs text-primary underline underline-offset-2"
                    onClick={() => { setSelectedType('youtube'); setDialogStep('fields') }}
                  >
                    或手动输入频道 ID
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      共 {ytChannels.length} 个订阅，已导入 {existingYtChannelIds.size} 个
                    </span>
                    <Button variant="ghost" size="sm" onClick={selectAllYt} className="text-xs h-7">
                      {ytSelected.size === ytChannels.filter((c) => !existingYtChannelIds.has(c.channel_id)).length
                        ? '取消全选' : '全选未导入'}
                    </Button>
                  </div>
                  <div className="space-y-0.5 max-h-96 overflow-y-auto -mx-1 px-1">
                    {ytChannels.map((channel) => {
                      const imported = existingYtChannelIds.has(channel.channel_id)
                      const selected = ytSelected.has(channel.channel_id)
                      return (
                        <button
                          key={channel.channel_id}
                          onClick={() => !imported && toggleYtSelect(channel.channel_id)}
                          disabled={imported}
                          className={cn(
                            'flex items-center gap-3 w-full p-2 rounded-lg transition-colors text-left',
                            imported ? 'opacity-50 cursor-default' : 'hover:bg-muted cursor-pointer',
                            selected && !imported && 'bg-primary/5 ring-1 ring-primary/20'
                          )}
                        >
                          <div className={cn(
                            'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors',
                            imported ? 'bg-muted border-muted-foreground/20' : selected ? 'bg-primary border-primary' : 'border-input'
                          )}>
                            {(imported || selected) && <Check className={cn('h-3 w-3', imported ? 'text-muted-foreground' : 'text-primary-foreground')} />}
                          </div>
                          {channel.avatar ? (
                            <img
                              src={channel.avatar}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover bg-muted shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0 text-red-600 text-xs font-bold">
                              {channel.name[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{channel.name}</span>
                              {imported && <Badge variant="secondary" className="text-[10px] shrink-0">已导入</Badge>}
                            </div>
                            {channel.subscriber_count && (
                              <p className="text-xs text-muted-foreground">{channel.subscriber_count}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogStep('platform')} className="mr-auto">
                  返回
                </Button>
                {!ytError && !ytLoading && (
                  <Button
                    onClick={importSelectedYt}
                    disabled={ytSelected.size === 0 || ytImporting}
                  >
                    {ytImporting ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />导入中...</>
                    ) : (
                      <>导入 {ytSelected.size} 个频道</>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {dialogStep === 'fields' && selectedType && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>{platformConfig[selectedType].icon}</span>
                  {editing ? `编辑 ${platformConfig[selectedType].label}` : `添加 ${platformConfig[selectedType].label}`}
                </DialogTitle>
                <DialogDescription>{platformConfig[selectedType].description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {platformConfig[selectedType].fields?.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      value={configFields[field.key] || ''}
                      onChange={(e) => setConfigFields({ ...configFields, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="text-sm"
                    />
                    {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                  </div>
                ))}

                {selectedType !== 'web' && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <Label className="text-sm">首次采集数量</Label>
                    <Select
                      value={configFields.max_items || '20'}
                      onValueChange={(v) => setConfigFields({ ...configFields, max_items: v })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {maxItemsOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">仅首次添加时生效，之后自动增量采集所有新内容</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                {!editing && (
                  <Button variant="ghost" onClick={() => setDialogStep('platform')} className="mr-auto">
                    返回
                  </Button>
                )}
                <Button onClick={handleSave} disabled={!hasRequired()}>
                  {editing ? '保存修改' : '添加'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
