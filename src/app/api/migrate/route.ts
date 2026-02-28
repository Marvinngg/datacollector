import { NextResponse } from 'next/server'
import { migrateStorage } from '@/lib/migrate-storage'
import { getDataDir } from '@/lib/data-dir'

export async function POST() {
  const result = migrateStorage(getDataDir())
  return NextResponse.json(result)
}
