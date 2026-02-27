import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'
import { migrateStorage } from '@/lib/migrate-storage'

export async function POST() {
  const dataDir = getSetting('data_dir') || './data'
  const result = migrateStorage(dataDir)
  return NextResponse.json(result)
}
