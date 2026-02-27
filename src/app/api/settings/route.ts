import { NextRequest, NextResponse } from 'next/server'
import { getAllSettings, setSetting } from '@/lib/db'

export async function GET() {
  const settings = getAllSettings()
  return NextResponse.json({ settings })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      setSetting(key, value)
    }
  }
  const settings = getAllSettings()
  return NextResponse.json({ settings })
}
