import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { Source, SourceType, Content, Task } from '@/types'
import { getDataDir } from './data-dir'

let db: Database.Database | null = null
let dbDataDir: string | null = null

export function getDb(): Database.Database {
  const currentDataDir = getDataDir()

  // 数据目录变化时（用户切换了目录），关闭旧连接重新打开
  if (db && dbDataDir === currentDataDir) return db
  if (db) {
    try { db.close() } catch {}
    db = null
  }

  dbDataDir = currentDataDir
  const dbDir = currentDataDir
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, 'collector.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      last_collected_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id),
      external_id TEXT,
      title TEXT NOT NULL,
      author TEXT,
      url TEXT,
      tags TEXT DEFAULT '[]',
      file_path TEXT NOT NULL,
      published_at TEXT,
      collected_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_id, external_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id),
      status TEXT DEFAULT 'pending',
      items_found INTEGER DEFAULT 0,
      items_new INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // 一次性迁移：修复 zsxq 标题
  migrateZsxqTitles(db)

  // 一次性迁移：绝对路径 → 相对路径
  migrateFilePathsToRelative(db)

  return db
}

/** 将知识星球 <e> 标签解析为纯文本（同时清除不完整的标签片段） */
function cleanZsxqTags(text: string): string {
  return text
    // 完整标签：<e type="..." ... />
    .replace(/<e\s+type="\w+"[^/]*?\/>/g, (match) => {
      const titleMatch = match.match(/title="([^"]*)"/)
      if (titleMatch) {
        try { return decodeURIComponent(titleMatch[1]) } catch { return titleMatch[1] }
      }
      const hrefMatch = match.match(/href="([^"]*)"/)
      if (hrefMatch) {
        try { return decodeURIComponent(hrefMatch[1]) } catch { return hrefMatch[1] }
      }
      return ''
    })
    // 不完整的标签片段（被截断的）
    .replace(/<e\s[^\n]*/g, '')
}

/** 从 markdown 文件中提取干净的标题（从正文内容中解析，跳过 frontmatter 和 # heading） */
function extractTitleFromFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    // 去掉 frontmatter 和 # 标题行，取正文
    const body = raw.replace(/^---[\s\S]*?---\n*/m, '').replace(/^#[^\n]*\n*/m, '').trim()
    if (!body) return null
    // 解析 <e> 标签
    const cleaned = cleanZsxqTags(body)
    // 取第一行有实质内容的文本（跳过纯 emoji 或过短的残留行）
    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length >= 4) return trimmed
    }
    // 如果所有行都很短，取最长的一行
    const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    return lines.sort((a, b) => b.length - a.length)[0] || null
  } catch {
    return null
  }
}

/** 同步更新 markdown 文件中的 frontmatter title 和 # heading，保持文件与 DB 一致 */
function updateFileTitle(filePath: string, newTitle: string): void {
  try {
    if (!fs.existsSync(filePath)) return
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
    const escaped = newTitle.replace(/"/g, '\\"')

    let dashCount = 0
    let inFrontmatter = false
    let headingFixed = false

    const updated = lines.map(line => {
      if (line === '---') {
        dashCount++
        inFrontmatter = dashCount === 1
        return line
      }
      if (inFrontmatter && line.startsWith('title:')) {
        return `title: "${escaped}"`
      }
      // 修复正文第一个 # heading（frontmatter 结束后）
      if (dashCount >= 2 && !headingFixed && line.startsWith('# ')) {
        headingFixed = true
        return `# ${newTitle}`
      }
      return line
    })

    fs.writeFileSync(filePath, updated.join('\n'), 'utf-8')
  } catch { /* 文件更新失败不影响主流程 */ }
}

/** 迁移 v4：重新提取所有 zsxq 标题，同时修复 DB 和 markdown 文件（frontmatter + heading） */
function migrateZsxqTitles(database: Database.Database) {
  const migrated = database.prepare("SELECT value FROM settings WHERE key = 'zsxq_titles_v4'").get() as { value: string } | undefined
  if (migrated) return

  const rows = database.prepare(`
    SELECT c.id, c.file_path FROM contents c
    JOIN sources s ON c.source_id = s.id
    WHERE s.type = 'zsxq'
  `).all() as { id: number; file_path: string }[]

  const update = database.prepare('UPDATE contents SET title = ? WHERE id = ?')
  let fixed = 0

  for (const row of rows) {
    const newTitle = extractTitleFromFile(row.file_path)
    if (newTitle) {
      update.run(newTitle, row.id)
      updateFileTitle(row.file_path, newTitle)
      fixed++
    }
  }

  database.prepare("INSERT INTO settings (key, value) VALUES ('zsxq_titles_v4', ?) ON CONFLICT(key) DO UPDATE SET value = ?")
    .run(String(fixed), String(fixed))

  if (fixed > 0) {
    console.log(`[migration] v4 fixed ${fixed} zsxq titles (DB + files)`)
  }
}

/** 迁移：将绝对路径的 file_path 转为相对于 dataDir 的相对路径 */
function migrateFilePathsToRelative(database: Database.Database) {
  const migrated = database.prepare("SELECT value FROM settings WHERE key = 'file_paths_relative_v1'").get() as { value: string } | undefined
  if (migrated) return

  const dataDir = getDataDir()
  // 确保以 / 结尾方便 startsWith 匹配
  const prefix = dataDir.endsWith(path.sep) ? dataDir : dataDir + path.sep

  const rows = database.prepare(
    "SELECT id, file_path FROM contents WHERE file_path LIKE '/%' OR file_path LIKE ?",
  ).all(`${dataDir}%`) as { id: number; file_path: string }[]

  const update = database.prepare('UPDATE contents SET file_path = ? WHERE id = ?')
  let fixed = 0

  for (const row of rows) {
    if (!path.isAbsolute(row.file_path)) continue
    if (row.file_path.startsWith(prefix)) {
      const relative = row.file_path.slice(prefix.length)
      update.run(relative, row.id)
      fixed++
    }
  }

  database.prepare("INSERT INTO settings (key, value) VALUES ('file_paths_relative_v1', ?) ON CONFLICT(key) DO UPDATE SET value = ?")
    .run(String(fixed), String(fixed))

  if (fixed > 0) {
    console.log(`[migration] file_paths_relative_v1: converted ${fixed} absolute paths to relative`)
  }
}

function parseSourceRow(row: any): Source {
  return {
    ...row,
    config: JSON.parse(row.config),
    is_active: Boolean(row.is_active),
  }
}

function parseContentRow(row: any): Content {
  return {
    ...row,
    tags: JSON.parse(row.tags),
  }
}

// Sources

export function getAllSources(): Source[] {
  const rows = getDb().prepare('SELECT * FROM sources ORDER BY created_at DESC').all()
  return rows.map(parseSourceRow)
}

export function getSourceById(id: number): Source | undefined {
  const row = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(id)
  return row ? parseSourceRow(row) : undefined
}

export function createSource(data: {
  name: string
  type: SourceType
  config?: Record<string, any>
  is_active?: boolean
}): Source {
  const result = getDb()
    .prepare('INSERT INTO sources (name, type, config, is_active) VALUES (?, ?, ?, ?)')
    .run(data.name, data.type, JSON.stringify(data.config ?? {}), data.is_active !== false ? 1 : 0)

  return getSourceById(result.lastInsertRowid as number)!
}

export function updateSource(
  id: number,
  data: Partial<{
    name: string
    type: SourceType
    config: Record<string, any>
    is_active: boolean
    last_collected_at: string | null
    last_error: string | null
  }>
): Source | undefined {
  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.type !== undefined) {
    fields.push('type = ?')
    values.push(data.type)
  }
  if (data.config !== undefined) {
    fields.push('config = ?')
    values.push(JSON.stringify(data.config))
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }
  if (data.last_collected_at !== undefined) {
    fields.push('last_collected_at = ?')
    values.push(data.last_collected_at)
  }
  if (data.last_error !== undefined) {
    fields.push('last_error = ?')
    values.push(data.last_error)
  }

  if (fields.length === 0) return getSourceById(id)

  values.push(id)
  getDb()
    .prepare(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values)

  return getSourceById(id)
}

export function deleteSource(id: number): boolean {
  const result = getDb().prepare('DELETE FROM sources WHERE id = ?').run(id)
  return result.changes > 0
}

// Contents

export interface ContentFilters {
  source_id?: number
  source_type?: SourceType
  author?: string
  search?: string
  from_date?: string
  to_date?: string
  sort_by?: 'published_at' | 'collected_at'
  limit?: number
  offset?: number
}

export function getContents(filters: ContentFilters = {}): { contents: Content[]; total: number } {
  const conditions: string[] = []
  const values: any[] = []

  if (filters.source_id !== undefined) {
    conditions.push('c.source_id = ?')
    values.push(filters.source_id)
  }
  if (filters.source_type !== undefined) {
    conditions.push('s.type = ?')
    values.push(filters.source_type)
  }
  if (filters.author !== undefined) {
    conditions.push('c.author = ?')
    values.push(filters.author)
  }
  if (filters.search !== undefined) {
    conditions.push('(c.title LIKE ? OR c.author LIKE ?)')
    values.push(`%${filters.search}%`, `%${filters.search}%`)
  }
  if (filters.from_date !== undefined) {
    conditions.push('c.published_at >= ?')
    values.push(filters.from_date)
  }
  if (filters.to_date !== undefined) {
    conditions.push('c.published_at <= ?')
    values.push(filters.to_date)
  }

  const join = ' JOIN sources s ON c.source_id = s.id'
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

  const countSql = `SELECT COUNT(*) as cnt FROM contents c${join}${where}`
  const countRow = getDb().prepare(countSql).get(...values) as { cnt: number }
  const total = countRow.cnt

  const limit = filters.limit ? ` LIMIT ?` : ''
  const offset = filters.limit && filters.offset ? ` OFFSET ?` : ''
  const pageValues = [...values]
  if (filters.limit) pageValues.push(filters.limit)
  if (filters.limit && filters.offset) pageValues.push(filters.offset)

  const sortCol = filters.sort_by === 'published_at' ? 'c.published_at' : 'c.collected_at'
  const sql = `SELECT c.*, s.type as source_type, s.name as source_name FROM contents c${join}${where} ORDER BY ${sortCol} DESC${limit}${offset}`
  const rows = getDb().prepare(sql).all(...pageValues)
  return { contents: rows.map(parseContentRow), total }
}

export function getContentById(id: number): Content | undefined {
  const row = getDb().prepare('SELECT * FROM contents WHERE id = ?').get(id)
  return row ? parseContentRow(row) : undefined
}

export function createContent(data: {
  source_id: number
  external_id: string
  title: string
  author?: string | null
  url?: string | null
  tags?: string[]
  file_path: string
  published_at?: string | null
}): Content {
  const result = getDb()
    .prepare(
      `INSERT INTO contents (source_id, external_id, title, author, url, tags, file_path, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.source_id,
      data.external_id,
      data.title,
      data.author ?? null,
      data.url ?? null,
      JSON.stringify(data.tags ?? []),
      data.file_path,
      data.published_at ?? null
    )

  return getContentById(result.lastInsertRowid as number)!
}

export function deleteContent(id: number): boolean {
  const result = getDb().prepare('DELETE FROM contents WHERE id = ?').run(id)
  return result.changes > 0
}

export function contentExists(sourceId: number, externalId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM contents WHERE source_id = ? AND external_id = ?')
    .get(sourceId, externalId)
  return row !== undefined
}

// Tasks

export function getTasks(sourceId?: number): Task[] {
  if (sourceId !== undefined) {
    return getDb()
      .prepare('SELECT * FROM tasks WHERE source_id = ? ORDER BY created_at DESC')
      .all(sourceId) as Task[]
  }
  return getDb().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Task[]
}

export function createTask(data: { source_id: number }): Task {
  const result = getDb()
    .prepare('INSERT INTO tasks (source_id) VALUES (?)')
    .run(data.source_id)

  return getDb()
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(result.lastInsertRowid) as Task
}

export function updateTask(
  id: number,
  data: Partial<{
    status: Task['status']
    items_found: number
    items_new: number
    error: string | null
    started_at: string | null
    completed_at: string | null
  }>
): Task | undefined {
  const fields: string[] = []
  const values: any[] = []

  if (data.status !== undefined) {
    fields.push('status = ?')
    values.push(data.status)
  }
  if (data.items_found !== undefined) {
    fields.push('items_found = ?')
    values.push(data.items_found)
  }
  if (data.items_new !== undefined) {
    fields.push('items_new = ?')
    values.push(data.items_new)
  }
  if (data.error !== undefined) {
    fields.push('error = ?')
    values.push(data.error)
  }
  if (data.started_at !== undefined) {
    fields.push('started_at = ?')
    values.push(data.started_at)
  }
  if (data.completed_at !== undefined) {
    fields.push('completed_at = ?')
    values.push(data.completed_at)
  }

  if (fields.length === 0) {
    return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  }

  values.push(id)
  getDb()
    .prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values)

  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function getAuthors(sourceType?: string): string[] {
  if (sourceType) {
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT c.author FROM contents c
         JOIN sources s ON c.source_id = s.id
         WHERE c.author IS NOT NULL AND c.author != '' AND s.type = ?
         ORDER BY c.author`
      )
      .all(sourceType) as { author: string }[]
    return rows.map(r => r.author)
  }
  const rows = getDb()
    .prepare('SELECT DISTINCT author FROM contents WHERE author IS NOT NULL AND author != \'\' ORDER BY author')
    .all() as { author: string }[]
  return rows.map(r => r.author)
}

// Settings

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
