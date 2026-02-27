import crypto from 'crypto'
import { CollectedItem } from '@/types'
import { getSetting } from '../db'
import { BaseCollector } from './base'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

// wbi 签名用的混淆表
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((n) => orig[n]).join('').slice(0, 32)
}

function encWbi(params: Record<string, string | number>, imgKey: string, subKey: string): string {
  const mixinKey = getMixinKey(imgKey + subKey)
  const wts = Math.round(Date.now() / 1000)
  const allParams: Record<string, string | number> = { ...params, wts }

  // Sort by key
  const query = Object.keys(allParams)
    .sort()
    .map((k) => {
      const v = String(allParams[k]).replace(/[!'()*]/g, '')
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    })
    .join('&')

  const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex')
  return `${query}&w_rid=${wRid}`
}

interface BilibiliVideo {
  bvid: string
  title: string
  author: string
  created: number
  length: string
  description: string
}

interface SubtitleResult {
  text: string
  type: 'ai-zh' | 'zh-CN' | 'description'
  parts?: number
}

let cachedKeys: { imgKey: string; subKey: string; ts: number } | null = null

export class BilibiliCollector extends BaseCollector {
  private get mid(): string {
    return this.source.config.mid
  }

  private get cookie(): string {
    return getSetting('bilibili_cookie') || ''
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Referer: 'https://www.bilibili.com',
    }
    if (this.cookie) {
      h['Cookie'] = this.cookie
    }
    return h
  }

  private async getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
    // Cache keys for 1 hour
    if (cachedKeys && Date.now() - cachedKeys.ts < 3600000) {
      return cachedKeys
    }

    const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: this.headers,
    })
    const data = await resp.json()
    const wbi = data.data?.wbi_img

    if (!wbi?.img_url || !wbi?.sub_url) {
      throw new Error('无法获取 wbi keys，请检查 Cookie 是否有效')
    }

    const imgKey = wbi.img_url.split('/').pop()!.split('.')[0]
    const subKey = wbi.sub_url.split('/').pop()!.split('.')[0]

    cachedKeys = { imgKey, subKey, ts: Date.now() }
    return { imgKey, subKey }
  }

  async fetchItems(): Promise<CollectedItem[]> {
    const videos = await this.fetchVideoList()
    const items: CollectedItem[] = []

    for (const video of videos) {
      let content = video.description || ''
      let subtitleType: 'ai-zh' | 'zh-CN' | 'description' | 'none' = content ? 'description' : 'none'
      let parts: number | undefined

      try {
        const result = await this.fetchSubtitles(video.bvid)
        if (result) {
          content = result.text
          subtitleType = result.type
          parts = result.parts
        }
      } catch {
        // Subtitles not available, use description
      }

      items.push({
        external_id: video.bvid,
        title: video.title,
        author: video.author,
        url: `https://www.bilibili.com/video/${video.bvid}`,
        content,
        tags: ['bilibili'],
        published_at: new Date(video.created * 1000).toISOString(),
        duration: video.length,
        source_type: 'bilibili',
        subtitle_type: subtitleType,
        parts,
      })
    }

    return items
  }

  private get maxItems(): number {
    return Number(this.source.config.max_items) || 50
  }

  private get isFirstCollect(): boolean {
    return !this.source.last_collected_at
  }

  private async fetchVideoList(): Promise<BilibiliVideo[]> {
    const { imgKey, subKey } = await this.getWbiKeys()
    const allVideos: BilibiliVideo[] = []
    // 首次采集：用 max_items 限制；后续增量：不限条数，靠遇到已采集的停止
    const maxTotal = this.isFirstCollect ? this.maxItems : Infinity
    const maxPages = this.isFirstCollect ? 5 : 10

    for (let pn = 1; pn <= maxPages; pn++) {
      const ps = 50
      const query = encWbi({ mid: this.mid, ps, pn }, imgKey, subKey)
      const url = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`
      const resp = await fetch(url, { headers: this.headers })

      if (!resp.ok) {
        throw new Error(`Bilibili API error: ${resp.status} ${resp.statusText}`)
      }

      const data = await resp.json()

      if (data.code === -352) {
        throw new Error('B站风控校验失败。请在「设置 → B站」中粘贴你的 Cookie（必须包含 SESSDATA）')
      }
      if (data.code !== 0) {
        throw new Error(`Bilibili API error ${data.code}: ${data.message || ''}`)
      }

      const vlist: any[] = data.data?.list?.vlist || []
      let hasExisting = false

      for (const v of vlist) {
        if (this.checkContentExists(v.bvid)) {
          hasExisting = true
          break
        }
        allVideos.push({
          bvid: v.bvid,
          title: v.title,
          author: v.author,
          created: v.created,
          length: v.length,
          description: v.description || '',
        })
        if (allVideos.length >= maxTotal) break
      }

      if (hasExisting || allVideos.length >= maxTotal || vlist.length < 50) break
    }

    return allVideos
  }

  private async fetchSubtitles(bvid: string): Promise<SubtitleResult | null> {
    const pagelistUrl = `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`
    const pageResp = await fetch(pagelistUrl, { headers: this.headers })
    if (!pageResp.ok) return null

    const pageData = await pageResp.json()
    if (pageData.code !== 0 || !pageData.data?.length) return null

    const pages = pageData.data
    const isMultiPart = pages.length > 1
    const allTexts: string[] = []
    let finalType: 'ai-zh' | 'zh-CN' | 'description' = 'description'

    for (let i = 0; i < pages.length; i++) {
      const cid = pages[i].cid
      const partTitle = pages[i].part

      const { imgKey, subKey } = await this.getWbiKeys()
      const query = encWbi({ bvid, cid }, imgKey, subKey)
      const playerUrl = `https://api.bilibili.com/x/player/wbi/v2?${query}`
      const playerResp = await fetch(playerUrl, { headers: this.headers })
      if (!playerResp.ok) continue

      const playerData = await playerResp.json()
      if (playerData.code !== 0) continue

      const subtitles = playerData.data?.subtitle?.subtitles
      if (!subtitles || subtitles.length === 0) continue

      // 优先人工字幕，其次 AI 字幕
      const zhCN = subtitles.find((s: any) => s.lan === 'zh-CN')
      const aiZh = subtitles.find((s: any) => s.lan === 'ai-zh')
      const subtitle = zhCN || aiZh || subtitles[0]

      if (i === 0) {
        finalType = zhCN ? 'zh-CN' : (aiZh ? 'ai-zh' : 'description')
      }

      let subtitleUrl = subtitle.subtitle_url
      if (subtitleUrl.startsWith('//')) {
        subtitleUrl = 'https:' + subtitleUrl
      }

      const subResp = await fetch(subtitleUrl, { headers: this.headers })
      if (!subResp.ok) continue

      const subData = await subResp.json()
      if (!subData.body || !Array.isArray(subData.body)) continue

      const rawText = this.formatSubtitleText(subData.body)
      if (!rawText) continue

      if (isMultiPart) {
        allTexts.push(`## P${i + 1}: ${partTitle}\n\n${rawText}`)
      } else {
        allTexts.push(rawText)
      }
    }

    if (allTexts.length === 0) return null

    return {
      text: allTexts.join('\n\n'),
      type: finalType,
      parts: isMultiPart ? pages.length : undefined,
    }
  }

  private formatSubtitleText(body: Array<{ content: string }>): string {
    if (!body.length) return ''

    const lines: string[] = []
    let prevContent = ''

    for (const item of body) {
      const content = item.content.trim()
      // 去除连续重复文本（AI 字幕常见问题）
      if (content === prevContent) continue
      prevContent = content

      // 按标点断句，每句一行
      const sentences = content.split(/(?<=[。！？；;!?])/g).filter(Boolean)
      for (const s of sentences) {
        const trimmed = s.trim()
        if (trimmed) lines.push(trimmed)
      }
    }

    return lines.join('\n')
  }
}
