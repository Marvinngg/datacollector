import Parser from 'rss-parser'
import { CollectedItem } from '@/types'
import { BaseCollector } from './base'

export class RssCollector extends BaseCollector {
  private get feedUrl(): string {
    return this.source.config.feed_url
  }

  private get maxItems(): number {
    return Number(this.source.config.max_items) || 50
  }

  private get isFirstCollect(): boolean {
    return !this.source.last_collected_at
  }

  async fetchItems(): Promise<CollectedItem[]> {
    try {
      const parser = new Parser()
      const feed = await parser.parseURL(this.feedUrl)
      const items: CollectedItem[] = []
      // 首次采集：用 max_items 限制；后续增量：不限条数
      const maxTotal = this.isFirstCollect ? this.maxItems : Infinity

      for (const item of feed.items) {
        if (items.length >= maxTotal) break

        const externalId = item.guid || item.link || item.title
        if (!externalId) continue

        // 增量：遇到已采集的就停止
        if (this.checkContentExists(externalId)) break

        const rawContent = item['content:encoded'] || item.content || item.summary || ''
        const content = rawContent.replace(/<[^>]*>/g, '')

        let publishedAt: string
        if (item.isoDate) {
          publishedAt = item.isoDate
        } else if (item.pubDate) {
          publishedAt = new Date(item.pubDate).toISOString()
        } else {
          publishedAt = new Date().toISOString()
        }

        items.push({
          external_id: externalId,
          title: item.title || '',
          author: item.creator || item.author || this.source.name,
          url: item.link || '',
          content,
          tags: item.categories && item.categories.length > 0 ? item.categories : ['RSS'],
          published_at: publishedAt,
          source_type: 'rss',
        })
      }

      return items
    } catch (error: any) {
      console.error(`[rss] Failed to fetch items: ${error.message}`)
      return []
    }
  }
}
