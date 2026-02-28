import { NextResponse } from 'next/server'
import { getDb, getAllSources } from '@/lib/db'
import { getDataDir } from '@/lib/data-dir'

export async function GET() {
  const db = getDb()

  const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM contents').get() as { cnt: number }
  const total = totalRow.cnt

  // 用本地时区的当天起始时刻（转 UTC ISO 字符串）与 UTC 存储的 collected_at 比较
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayRow = db
    .prepare("SELECT COUNT(*) as cnt FROM contents WHERE collected_at >= ?")
    .get(startOfToday.toISOString()) as { cnt: number }
  const todayCount = todayRow.cnt

  const byPlatform = db
    .prepare(
      `SELECT s.type as platform, COUNT(*) as count
       FROM contents c JOIN sources s ON c.source_id = s.id
       GROUP BY s.type`
    )
    .all() as { platform: string; count: number }[]

  const recentItems = db
    .prepare(
      `SELECT c.id, c.title, c.author, c.collected_at, c.published_at, c.url,
              s.type as source_type, s.name as source_name
       FROM contents c JOIN sources s ON c.source_id = s.id
       ORDER BY c.collected_at DESC LIMIT 10`
    )
    .all()

  const sources = getAllSources()
  const dataDir = getDataDir()

  return NextResponse.json({
    total,
    today: todayCount,
    byPlatform: Object.fromEntries(byPlatform.map((r) => [r.platform, r.count])),
    recentItems,
    sourcesCount: sources.length,
    activeSourcesCount: sources.filter((s) => s.is_active).length,
    dataDir,
  })
}
