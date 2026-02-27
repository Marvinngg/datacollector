import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import crypto from 'crypto'
import { CollectedItem } from '@/types'
import { BaseCollector } from './base'

export class WebCollector extends BaseCollector {
  private get url(): string {
    return this.source.config.url
  }

  async fetchItems(): Promise<CollectedItem[]> {
    try {
      const resp = await fetch(this.url)

      if (!resp.ok) {
        throw new Error(`Web fetch error: ${resp.status} ${resp.statusText}`)
      }

      const html = await resp.text()
      const dom = new JSDOM(html, { url: this.url })
      const reader = new Readability(dom.window.document)
      const article = reader.parse()

      const externalId = crypto.createHash('md5').update(this.url).digest('hex')
      const title = article?.title || dom.window.document.title || this.url
      const author = article?.byline || this.source.name
      const rawContent = article?.textContent || ''
      const content = rawContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

      return [
        {
          external_id: externalId,
          title,
          author,
          url: this.url,
          content,
          tags: ['网页'],
          published_at: new Date().toISOString(),
          source_type: 'web',
        },
      ]
    } catch (error: any) {
      console.error(`[web] Failed to fetch items: ${error.message}`)
      return []
    }
  }
}
