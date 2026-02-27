import { CollectedItem } from '@/types'
import { getSetting } from '../db'
import { BaseCollector } from './base'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface ZsxqImage {
  image_id: number
  type?: string
  original?: { url?: string; width?: number; height?: number }
  large?: { url?: string; width?: number; height?: number }
  thumbnail?: { url?: string }
}

interface ZsxqTopic {
  topic_id: number
  create_time: string
  talk?: {
    owner?: { name?: string }
    text?: string
    images?: ZsxqImage[]
  }
  question?: {
    text?: string
  }
  show_comments?: {
    owner?: { name?: string }
    text?: string
    create_time?: string
  }[]
}

/** 将知识星球 <e> 标签解析为纯文本（同时清除不完整的标签片段） */
export function cleanZsxqTags(text: string): string {
  return text
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
    .replace(/<e\s[^\n]*/g, '')
}

/** 从纯文本中提取标题：取第一行有实质内容的文本 */
function extractTitle(cleanText: string): string {
  const lines = cleanText.split('\n')
  // 优先取至少 4 个字符的行
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length >= 4) return trimmed
  }
  // 否则取最长行
  const nonEmpty = lines.map(l => l.trim()).filter(l => l.length > 0)
  return nonEmpty.sort((a, b) => b.length - a.length)[0] || ''
}

export class ZsxqCollector extends BaseCollector {
  private get groupId(): string {
    return this.source.config.group_id
  }

  private get cookie(): string {
    return getSetting('zsxq_cookie') || ''
  }

  private get headers(): Record<string, string> {
    return {
      'User-Agent': USER_AGENT,
      accept: 'application/json',
      Cookie: this.cookie,
    }
  }

  private get maxItems(): number {
    return Number(this.source.config.max_items) || 50
  }

  private get isFirstCollect(): boolean {
    return !this.source.last_collected_at
  }

  async fetchItems(): Promise<CollectedItem[]> {
    try {
      const items: CollectedItem[] = []
      // 首次采集：用 max_items 限制；后续增量：不限条数
      const maxTotal = this.isFirstCollect ? this.maxItems : Infinity
      const maxPages = this.isFirstCollect ? 5 : 10
      let endTime: string | undefined

      for (let page = 0; page < maxPages; page++) {
        const count = this.isFirstCollect ? Math.min(20, maxTotal - items.length) : 20
        let url = `https://api.zsxq.com/v2/groups/${this.groupId}/topics?count=${count}`
        if (endTime) url += `&end_time=${encodeURIComponent(endTime)}`

        const resp = await fetch(url, { headers: this.headers })

        if (!resp.ok) {
          throw new Error(`ZSXQ API error: ${resp.status} ${resp.statusText}`)
        }

        const data = await resp.json()
        const topics: ZsxqTopic[] = data.resp_data?.topics || []
        if (topics.length === 0) break

        let hasExisting = false

        for (const topic of topics) {
          if (this.checkContentExists(String(topic.topic_id))) {
            hasExisting = true
            break
          }

          const rawText = topic.talk?.text || topic.question?.text || ''
          // 标题：先完整解析标签为纯文本，再取第一行
          const cleanText = cleanZsxqTags(rawText)
          const titleLine = extractTitle(cleanText)
          const title = titleLine || `知识星球帖子 ${topic.create_time}`

          // 内容保留原始标签（前端负责富文本渲染）
          let content = rawText

          // 保存图片真实 URL
          if (topic.talk?.images && topic.talk.images.length > 0) {
            content += '\n'
            for (const img of topic.talk.images) {
              const imgUrl = img.original?.url || img.large?.url || img.thumbnail?.url
              if (imgUrl) {
                content += `\n![图片](${imgUrl})`
              }
            }
            if (!topic.talk.images.some(img => img.original?.url || img.large?.url || img.thumbnail?.url)) {
              content += `\n[包含 ${topic.talk.images.length} 张图片]`
            }
          }

          // 保存精选评论
          if (topic.show_comments && topic.show_comments.length > 0) {
            content += '\n\n---\n**精选评论：**'
            for (const comment of topic.show_comments) {
              const commenter = comment.owner?.name || '匿名'
              const commentText = comment.text || ''
              content += `\n> **${commenter}**：${commentText}`
            }
          }

          items.push({
            external_id: String(topic.topic_id),
            title,
            author: topic.talk?.owner?.name || this.source.name,
            url: `https://wx.zsxq.com/topic/${topic.topic_id}`,
            content,
            tags: ['知识星球'],
            published_at: new Date(topic.create_time).toISOString(),
            source_type: 'zsxq',
          })

          if (items.length >= maxTotal) break
        }

        // 用最后一条的时间作为下一页的 end_time
        endTime = topics[topics.length - 1].create_time

        if (hasExisting || items.length >= maxTotal || topics.length < count) break
      }

      return items
    } catch (error: any) {
      console.error(`[zsxq] Failed to fetch items: ${error.message}`)
      return []
    }
  }
}
