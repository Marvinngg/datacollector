import { NextRequest, NextResponse } from 'next/server'
import { getSourceById, updateSource, deleteSource } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const source = getSourceById(Number(id))
  if (!source) {
    return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  }
  return NextResponse.json({ source })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const source = updateSource(Number(id), body)
  if (!source) {
    return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  }
  return NextResponse.json({ source })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ok = deleteSource(Number(id))
  if (!ok) {
    return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
