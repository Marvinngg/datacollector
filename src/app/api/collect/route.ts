import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import {
  getAllSources,
  getSourceById,
  createTask,
  updateTask,
  updateSource,
  getSetting,
} from '@/lib/db'
import { generateIndex } from '@/lib/file-manager'
import { BilibiliCollector } from '@/lib/collectors/bilibili'
import { YouTubeCollector } from '@/lib/collectors/youtube'
import { ZsxqCollector } from '@/lib/collectors/zsxq'
import { RssCollector } from '@/lib/collectors/rss'
import { WebCollector } from '@/lib/collectors/web'
import type { Source } from '@/types'
import { BaseCollector } from '@/lib/collectors/base'

function getDataDir(): string {
  const custom = getSetting('data_dir')
  return custom?.trim() || path.join(process.cwd(), 'data')
}

function createCollector(source: Source, dataDir: string): BaseCollector {
  switch (source.type) {
    case 'bilibili':
      return new BilibiliCollector(source, dataDir)
    case 'youtube':
      return new YouTubeCollector(source, dataDir)
    case 'zsxq':
      return new ZsxqCollector(source, dataDir)
    case 'rss':
      return new RssCollector(source, dataDir)
    case 'web':
      return new WebCollector(source, dataDir)
    default:
      throw new Error(`未知的数据源类型: ${source.type}`)
  }
}

async function collectSource(source: Source, dataDir: string) {
  const task = createTask({ source_id: source.id })
  updateTask(task.id, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  try {
    const collector = createCollector(source, dataDir)
    const result = await collector.collect()

    if (result.error) {
      updateTask(task.id, {
        status: 'failed',
        error: result.error,
        items_found: result.items_found,
        items_new: result.items_new,
        completed_at: new Date().toISOString(),
      })
      updateSource(source.id, {
        last_error: result.error,
        last_collected_at: new Date().toISOString(),
      })
      return { source: source.name, ...result }
    }

    updateTask(task.id, {
      status: 'completed',
      items_found: result.items_found,
      items_new: result.items_new,
      completed_at: new Date().toISOString(),
    })
    updateSource(source.id, {
      last_error: null,
      last_collected_at: new Date().toISOString(),
    })

    return { source: source.name, ...result }
  } catch (err: any) {
    updateTask(task.id, {
      status: 'failed',
      error: err.message,
      completed_at: new Date().toISOString(),
    })
    updateSource(source.id, {
      last_error: err.message,
      last_collected_at: new Date().toISOString(),
    })
    return { source: source.name, items_found: 0, items_new: 0, error: err.message }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const dataDir = getDataDir()
  const results: any[] = []

  if (body.source_id) {
    const source = getSourceById(body.source_id)
    if (!source) {
      return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
    }
    const result = await collectSource(source, dataDir)
    results.push(result)
  } else {
    const sources = getAllSources().filter((s) => s.is_active)
    for (const source of sources) {
      const result = await collectSource(source, dataDir)
      results.push(result)
    }
  }

  generateIndex(dataDir)
  return NextResponse.json({ results })
}
