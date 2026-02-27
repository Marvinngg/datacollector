import { NextRequest, NextResponse } from 'next/server'
import { getAuthors } from '@/lib/db'

export async function GET(request: NextRequest) {
  const sourceType = request.nextUrl.searchParams.get('source_type') || undefined
  const authors = getAuthors(sourceType)
  return NextResponse.json({ authors })
}
