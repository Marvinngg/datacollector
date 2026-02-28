import { NextRequest, NextResponse } from 'next/server'
import { getContentById, deleteContent } from '@/lib/db'
import { getDataDir } from '@/lib/data-dir'
import path from 'path'
import fs from 'fs'

/** 兼容旧绝对路径和新相对路径 */
function resolveFilePath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(getDataDir(), filePath)
}

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
    const fullPath = resolveFilePath(content.file_path)
    if (fs.existsSync(fullPath)) {
      body = fs.readFileSync(fullPath, 'utf-8')
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
    const fullPath = resolveFilePath(content.file_path)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
  } catch {}

  deleteContent(Number(id))
  return NextResponse.json({ ok: true })
}
