import fs from 'fs'
import path from 'path'
import { CollectedItem, SourceType } from '@/types'
import { getContents } from './db'

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

// ========== zsxq <e> tag → Markdown ==========

function parseTagAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch {}
  for (let i = s.length - 1; i >= Math.max(0, s.length - 8); i--) {
    try { return decodeURIComponent(s.slice(0, i)) } catch {}
  }
  return s
}

export function zsxqToMarkdown(text: string): string {
  // Regex matching order:
  // 1. ![alt](<e type="web" href="..." />) — nested image in url position
  // 2. [text](<e type="web" href="..." />) — nested link in url position
  // 3. [<e type="web" .../>](url) — e tag in link text position
  // 4. <e type="TYPE" .../> — standalone complete tags
  // 5. <e ... — truncated/broken tags (greedy to end of line)
  const regex = /!\[([^\]]*)\]\(\s*<e\s+type="web"\s+([^/]*?)\/>\s*\)|\[([^\]]+)\]\(\s*<e\s+type="web"\s+([^/]*?)\/>\s*\)|\[<e\s+type="(\w+)"\s+([^/]*?)\/>\s*\]\(([^)]+)\)|<e\s+type="(\w+)"\s+([^/]*?)\/?>|<e\s[^\n]*/gm

  let result = ''
  let lastIndex = 0

  let match
  while ((match = regex.exec(text)) !== null) {
    result += text.slice(lastIndex, match.index)

    if (match[1] !== undefined && match[2] !== undefined) {
      // nested image: ![alt](<e type="web" href="..." />)
      const attrs = parseTagAttrs(match[2])
      const src = safeDecode(attrs.href || '')
      result += `![${match[1] || '图片'}](${src})`
    } else if (match[3] !== undefined && match[4] !== undefined) {
      // nested link: [text](<e type="web" href="..." />)
      const attrs = parseTagAttrs(match[4])
      const href = safeDecode(attrs.href || '')
      result += `[${match[3]}](${href})`
    } else if (match[5] !== undefined && match[6] !== undefined && match[7] !== undefined) {
      // e tag as link text: [<e type="web" .../>](url)
      const attrs = parseTagAttrs(match[6])
      const label = safeDecode(attrs.title || attrs.href || '')
      const href = match[7]
      if (/\.(jpg|jpeg|png|gif|webp|bmp)/i.test(href)) {
        result += `![${label || '图片'}](${href})`
      } else {
        result += `[${label || href}](${href})`
      }
    } else if (match[8] !== undefined && match[9] !== undefined) {
      // complete <e type="TYPE" .../> tag
      const tagType = match[8]
      const attrs = parseTagAttrs(match[9])

      if (tagType === 'text_bold') {
        result += `**${safeDecode(attrs.title || '')}**`
      } else if (tagType === 'web') {
        const href = safeDecode(attrs.href || '')
        const title = safeDecode(attrs.title || '')
        if (/\.(jpg|jpeg|png|gif|webp|bmp)/i.test(href)) {
          result += `![${title || '图片'}](${href})`
        } else {
          result += `[${title || href}](${href})`
        }
      } else if (tagType === 'hashtag') {
        result += safeDecode(attrs.title || '')
      } else if (tagType === 'mention') {
        result += safeDecode(attrs.title || '')
      } else {
        result += safeDecode(attrs.title || '')
      }
    } else {
      // truncated <e ... tag — extract title/href or drop
      const titleMatch = match[0].match(/title="([^"]*)/)
      if (titleMatch) {
        result += safeDecode(titleMatch[1])
      } else {
        const hrefMatch = match[0].match(/href="([^"]*)/)
        if (hrefMatch) result += safeDecode(hrefMatch[1])
      }
    }

    lastIndex = match.index + match[0].length
  }

  result += text.slice(lastIndex)
  return result
}

export function writeContent(dataDir: string, item: CollectedItem): string {
  const dir = path.join(dataDir, item.source_type)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const dateStr = item.published_at?.split('T')[0] || new Date().toISOString().split('T')[0]
  const filename = `${dateStr}_${sanitizeFilename(item.author)}_${sanitizeFilename(item.title)}.md`
  const filePath = path.join(dir, filename)

  // Clean zsxq content before writing
  let content = item.content
  if (item.source_type === 'zsxq') {
    content = zsxqToMarkdown(content)
  }

  const wordCount = content.trim().length

  const frontmatter = [
    '---',
    `source: ${item.source_type}`,
    `author: ${item.author}`,
    `title: "${item.title.replace(/"/g, '\\"')}"`,
    `url: ${item.url}`,
    `date: ${dateStr}`,
    `tags: [${item.tags.join(', ')}]`,
    item.duration ? `duration: "${item.duration}"` : null,
    item.subtitle_type ? `subtitle_type: ${item.subtitle_type}` : null,
    item.parts ? `parts: ${item.parts}` : null,
    `word_count: ${wordCount}`,
    `collected_at: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${item.title}`,
    '',
    content,
    '',
  ].filter(Boolean).join('\n')

  fs.writeFileSync(filePath, frontmatter, 'utf-8')
  return filePath
}

export function generateIndex(dataDir: string): void {
  const { contents, total } = getContents({})

  // Count by source type
  const byType: Record<string, number> = {}
  const authorSet: Record<string, Set<string>> = {}
  for (const c of contents) {
    const type = c.source_type || c.file_path.split('/').slice(-2, -1)[0] || 'unknown'
    byType[type] = (byType[type] || 0) + 1
    if (c.author) {
      if (!authorSet[type]) authorSet[type] = new Set()
      authorSet[type].add(c.author)
    }
  }

  const now = new Date()
  let md = `# 数据索引\n\n`
  md += `更新: ${now.toISOString().replace('T', ' ').slice(0, 16)} | 总计: ${total} 条\n\n`

  md += `## 平台统计\n\n`
  md += `| 平台 | 数量 | 作者 |\n|------|------|------|\n`
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    const authors = authorSet[type] ? [...authorSet[type]].sort().join(', ') : '-'
    md += `| ${type} | ${count} | ${authors} |\n`
  }

  fs.writeFileSync(path.join(dataDir, '_index.md'), md, 'utf-8')
}
