import { NextRequest, NextResponse } from 'next/server'
import { getContents, type ContentFilters } from '@/lib/db'
import type { SourceType } from '@/types'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const filters: ContentFilters = {}

  if (searchParams.has('source_id')) {
    filters.source_id = Number(searchParams.get('source_id'))
  }
  if (searchParams.has('source_type')) {
    filters.source_type = searchParams.get('source_type') as SourceType
  }
  if (searchParams.has('author')) {
    filters.author = searchParams.get('author')!
  }
  if (searchParams.has('search')) {
    filters.search = searchParams.get('search')!
  }
  if (searchParams.has('from_date')) {
    filters.from_date = searchParams.get('from_date')!
  }
  if (searchParams.has('to_date')) {
    filters.to_date = searchParams.get('to_date')!
  }
  if (searchParams.has('sort_by')) {
    filters.sort_by = searchParams.get('sort_by') as 'published_at' | 'collected_at'
  }
  if (searchParams.has('limit')) {
    filters.limit = Number(searchParams.get('limit'))
  }
  if (searchParams.has('offset')) {
    filters.offset = Number(searchParams.get('offset'))
  }

  const { contents, total } = getContents(filters)
  return NextResponse.json({ contents, total })
}
