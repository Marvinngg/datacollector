import { NextRequest, NextResponse } from 'next/server'
import { getAllSources, createSource } from '@/lib/db'

export async function GET() {
  const sources = getAllSources()
  return NextResponse.json({ sources })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, config } = body

  if (!name || !type) {
    return NextResponse.json({ error: '名称和类型为必填项' }, { status: 400 })
  }

  const source = createSource({ name, type, config })
  return NextResponse.json({ source }, { status: 201 })
}
