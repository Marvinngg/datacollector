'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

interface TaskItem {
  id: number
  source_id: number
  source_name: string
  status: string
  items_found: number
  items_new: number
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

const statusConfig: Record<string, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', label: '等待中', icon: Clock },
  running: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', label: '运行中', icon: Loader2 },
  completed: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: '已完成', icon: CheckCircle2 },
  failed: { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', label: '失败', icon: XCircle },
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [collecting, setCollecting] = useState(false)

  const fetchTasks = async () => {
    const res = await fetch('/api/tasks')
    const data = await res.json()
    setTasks(data.tasks || [])
  }

  useEffect(() => { fetchTasks() }, [])

  const handleCollectAll = async () => {
    setCollecting(true)
    try {
      await fetch('/api/collect', { method: 'POST' })
      fetchTasks()
    } finally {
      setCollecting(false)
    }
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '-'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  }

  const formatTime = (ts: string | null) => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">采集任务</h2>
          <p className="text-sm text-muted-foreground mt-1">查看历次采集记录</p>
        </div>
        <Button onClick={handleCollectAll} disabled={collecting} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${collecting ? 'animate-spin' : ''}`} />
          {collecting ? '采集中...' : '全量采集'}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无采集任务记录，添加数据源后点击「全量采集」开始
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const cfg = statusConfig[task.status] || statusConfig.pending
            const Icon = cfg.icon
            return (
              <Card key={task.id}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <Badge className={cfg.color}>
                      <Icon className={`h-3 w-3 mr-1 ${task.status === 'running' ? 'animate-spin' : ''}`} />
                      {cfg.label}
                    </Badge>
                    <span className="text-sm font-medium truncate">{task.source_name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>发现 {task.items_found}</span>
                      <span>新增 {task.items_new}</span>
                      <span>耗时 {formatDuration(task.started_at, task.completed_at)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-muted-foreground">
                      {formatTime(task.created_at)}
                    </p>
                    {task.error && (
                      <p className="text-xs text-destructive mt-1 max-w-xs truncate" title={task.error}>
                        {task.error}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
