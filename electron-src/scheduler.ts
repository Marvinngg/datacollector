import cron from 'node-cron'
import { Notification } from 'electron'

let scheduledTask: cron.ScheduledTask | null = null

export function startScheduler(port: number, cronExpr: string = '0 8 * * *') {
  if (scheduledTask) {
    scheduledTask.stop()
  }

  scheduledTask = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] 开始自动采集 ${new Date().toISOString()}`)
    try {
      const res = await fetch(`http://localhost:${port}/api/collect`, {
        method: 'POST',
      })
      const data = await res.json()
      const results = data.results || []
      const totalNew = results.reduce((sum: number, r: any) => sum + (r.items_new || 0), 0)
      console.log('[Scheduler] 采集完成:', JSON.stringify(results.length), '个数据源')
      if (Notification.isSupported()) {
        new Notification({
          title: '采集完成',
          body: `已完成 ${results.length} 个数据源采集，新增 ${totalNew} 条内容`,
        }).show()
      }
    } catch (err) {
      console.error('[Scheduler] 采集失败:', err)
    }
  })

  console.log(`[Scheduler] 定时任务已启动: ${cronExpr}`)
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
    console.log('[Scheduler] 定时任务已停止')
  }
}
