import { CollectedItem, CollectResult, Source } from '@/types'
import { contentExists, createContent } from '../db'
import { writeContent } from '../file-manager'

export abstract class BaseCollector {
  protected source: Source
  protected dataDir: string

  constructor(source: Source, dataDir: string) {
    this.source = source
    this.dataDir = dataDir
  }

  protected checkContentExists(externalId: string): boolean {
    return contentExists(this.source.id, externalId)
  }

  abstract fetchItems(): Promise<CollectedItem[]>

  async collect(): Promise<CollectResult> {
    try {
      const items = await this.fetchItems()
      let itemsNew = 0

      for (const item of items) {
        if (contentExists(this.source.id, item.external_id)) continue
        const filePath = writeContent(this.dataDir, item)
        createContent({
          source_id: this.source.id,
          external_id: item.external_id,
          title: item.title,
          author: item.author,
          url: item.url,
          tags: item.tags,
          file_path: filePath,
          published_at: item.published_at,
        })
        itemsNew++
      }

      return { items_found: items.length, items_new: itemsNew, items }
    } catch (error: any) {
      return { items_found: 0, items_new: 0, items: [], error: error.message }
    }
  }
}
