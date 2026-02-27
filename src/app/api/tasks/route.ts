import { NextRequest, NextResponse } from 'next/server'
import { getTasks, getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sourceId = searchParams.has('source_id')
    ? Number(searchParams.get('source_id'))
    : undefined

  const tasks = getTasks(sourceId)

  const sourceNames: Record<number, string> = {}
  const rows = getDb().prepare('SELECT id, name, type FROM sources').all() as {
    id: number
    name: string
    type: string
  }[]
  for (const r of rows) {
    sourceNames[r.id] = r.name
  }

  const enriched = tasks.map((t) => ({
    ...t,
    source_name: sourceNames[t.source_id] || `未知源 #${t.source_id}`,
  }))

  return NextResponse.json({ tasks: enriched })
}
