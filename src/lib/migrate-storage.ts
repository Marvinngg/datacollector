import fs from 'fs'
import { getContents } from './db'
import { zsxqToMarkdown, generateIndex } from './file-manager'

interface MigrateResult {
  total: number
  cleaned: number
  wordCountAdded: number
  errors: string[]
}

export function migrateStorage(dataDir: string): MigrateResult {
  const { contents } = getContents({})
  const result: MigrateResult = { total: contents.length, cleaned: 0, wordCountAdded: 0, errors: [] }

  for (const c of contents) {
    const filePath = c.file_path
    if (!fs.existsSync(filePath)) {
      result.errors.push(`missing: ${filePath}`)
      continue
    }

    try {
      let raw = fs.readFileSync(filePath, 'utf-8')
      let changed = false

      // Determine source type from DB or file frontmatter
      const sourceType = c.source_type || (() => {
        const m = raw.match(/^source:\s*(\S+)/m)
        return m ? m[1] : ''
      })()

      // Split frontmatter and body
      const fmMatch = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/)
      if (!fmMatch) {
        result.errors.push(`no frontmatter: ${filePath}`)
        continue
      }

      let frontmatter = fmMatch[1]
      let body = fmMatch[2]

      // 1) Clean zsxq <e> tags in body and frontmatter
      if (sourceType === 'zsxq') {
        if (body.includes('<e ')) {
          body = zsxqToMarkdown(body)
          changed = true
          result.cleaned++
        }
        // Clean broken <e> fragments in frontmatter (truncated titles, escaped quotes)
        if (/<e\s/i.test(frontmatter)) {
          // Remove lines that are just <e tag fragments (not valid YAML keys)
          frontmatter = frontmatter.split('\n').filter(line => {
            // Keep lines that start with a valid YAML key or are --- delimiters
            if (line === '---' || /^\w[\w_]*:/.test(line) || line.trim() === '') return true
            // Drop lines that contain <e fragments (malformed frontmatter from truncated titles)
            if (/<e\s/i.test(line) || /\\?<e\s/i.test(line)) return false
            return true
          }).join('\n')
          changed = true
        }
      }

      // 2) Add word_count if missing
      if (!frontmatter.includes('word_count:')) {
        // body content after the # heading line
        const contentBody = body.replace(/^#[^\n]*\n*/m, '').trim()
        const wordCount = contentBody.length
        frontmatter = frontmatter.replace(
          /\ncollected_at:/,
          `\nword_count: ${wordCount}\ncollected_at:`
        )
        // If no collected_at, insert before closing ---
        if (!frontmatter.includes('word_count:')) {
          frontmatter = frontmatter.replace(/\n---\n$/, `\nword_count: ${wordCount}\n---\n`)
        }
        changed = true
        result.wordCountAdded++
      }

      if (changed) {
        fs.writeFileSync(filePath, frontmatter + body, 'utf-8')
      }
    } catch (err: any) {
      result.errors.push(`${filePath}: ${err.message}`)
    }
  }

  // Regenerate index
  generateIndex(dataDir)

  return result
}
