import { NextRequest, NextResponse } from 'next/server'
import { getContentById, deleteContent } from '@/lib/db'
import fs from 'fs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const content = getContentById(Number(id))
  if (!content) {
    return NextResponse.json({ error: '内容不存在' }, { status: 404 })
  }

  let body = ''
  try {
    if (fs.existsSync(content.file_path)) {
      body = fs.readFileSync(content.file_path, 'utf-8')
    }
  } catch {}

  return NextResponse.json({ content, body })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const content = getContentById(Number(id))
  if (!content) {
    return NextResponse.json({ error: '内容不存在' }, { status: 404 })
  }

  try {
    if (fs.existsSync(content.file_path)) {
      fs.unlinkSync(content.file_path)
    }
  } catch {}

  deleteContent(Number(id))
  return NextResponse.json({ ok: true })
}
