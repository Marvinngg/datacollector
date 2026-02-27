import { CollectedItem } from '@/types'
import { BaseCollector } from './base'
import { getSetting } from '@/lib/db'
import { createHash } from 'crypto'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAX_RETRIES = 3
const FETCH_TIMEOUT_MS = 30_000

/** 带重试 + 超时的 fetch，应对不稳定的代理网络 */
async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const resp = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      if (resp.ok || resp.status === 404) return resp // 404 不重试
      lastError = new Error(`HTTP ${resp.status} ${resp.statusText}`)
    } catch (e: any) {
      lastError = e
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, (2 ** attempt) * 1000))
    }
  }
  throw lastError || new Error('请求失败')
}

/** 构造 SAPISIDHASH 认证头（和 subscriptions route 中相同的逻辑） */
function buildSapiSidHash(cookieStr: string): string | null {
  const match = cookieStr.match(/(?:^|;\s*)SAPISID=([^;]+)/)
  if (!match) return null
  const sapisid = match[1].trim()
  const epoch = Math.floor(Date.now() / 1000)
  const hash = createHash('sha1')
    .update(`${epoch} ${sapisid} https://www.youtube.com`)
    .digest('hex')
  return `SAPISIDHASH ${epoch}_${hash}`
}

/** 获取带认证的请求头（cookie + SAPISIDHASH），无 cookie 时返回基本头 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  }
  const cookie = getSetting('youtube_cookie')
  if (cookie?.trim()) {
    headers['Cookie'] = cookie
    const auth = buildSapiSidHash(cookie)
    if (auth) {
      headers['Authorization'] = auth
      headers['X-Origin'] = 'https://www.youtube.com'
      headers['Origin'] = 'https://www.youtube.com'
    }
  }
  return headers
}

/** 解码 XML 实体 */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
}

/** 从 YouTube Atom RSS 中提取视频条目 */
function parseYouTubeRss(xml: string): Array<{
  videoId: string
  title: string
  published: string
  authorName: string
  description: string
}> {
  const entries: ReturnType<typeof parseYouTubeRss> = []
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || []

  for (const block of entryBlocks) {
    const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() || ''
    const title = decodeXml(block.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() || '')
    const published = block.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() || ''
    const authorName = decodeXml(
      block.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/)?.[1]?.trim() || ''
    )
    const description = decodeXml(
      block.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]?.trim() || ''
    )

    if (videoId) {
      entries.push({ videoId, title, published, authorName, description })
    }
  }

  return entries
}

interface VideoEntry {
  videoId: string
  title: string
  published: string
  authorName: string
  description: string
}

/** RSS 不可用时，通过 innertube browse API 获取频道视频列表 */
async function fetchVideosViaInnertube(channelId: string): Promise<VideoEntry[]> {
  // params="EgZ2aWRlb3PyBgQKAjoA" = Videos tab, sorted by newest
  const resp = await fetchWithRetry('https://www.youtube.com/youtubei/v1/browse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      context: {
        client: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'zh-CN' },
      },
      browseId: channelId,
      params: 'EgZ2aWRlb3PyBgQKAjoA',
    }),
  })

  if (!resp.ok) return []

  const data = await resp.json()

  // 递归搜索所有 videoRenderer
  const videos: VideoEntry[] = []
  const findVideos = (obj: any) => {
    if (!obj || typeof obj !== 'object') return
    if (obj.videoRenderer) {
      const v = obj.videoRenderer
      const title =
        v.title?.runs?.[0]?.text || v.title?.simpleText || ''
      videos.push({
        videoId: v.videoId || '',
        title,
        published: '', // innertube 不提供精确日期，后面用 player API 补
        authorName: v.ownerText?.runs?.[0]?.text || '',
        description: v.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '',
      })
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') findVideos(val)
    }
  }
  findVideos(data)

  return videos.filter((v) => v.videoId)
}

/** 通过 innertube player API 获取视频字幕（带 cookie 认证绕过 LOGIN_REQUIRED） */
async function fetchSubtitles(
  videoId: string
): Promise<{ text: string; lang: string; isAuto: boolean } | null> {
  try {
    const headers = getAuthHeaders()
    const resp = await fetchWithRetry('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'zh-CN' },
        },
        videoId,
      }),
    })

    if (!resp.ok) return null

    const data = (await resp.json()) as any
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!Array.isArray(tracks) || tracks.length === 0) return null

    // 优先中文字幕 > 英文 > 第一个可用
    const track =
      tracks.find((t: any) => /^zh/.test(t.languageCode)) ||
      tracks.find((t: any) => t.languageCode === 'en') ||
      tracks[0]

    if (!track?.baseUrl) return null

    const subHeaders: Record<string, string> = { 'User-Agent': USER_AGENT }
    const cookie = getSetting('youtube_cookie')
    if (cookie?.trim()) subHeaders['Cookie'] = cookie
    const subResp = await fetchWithRetry(track.baseUrl, { headers: subHeaders })
    if (!subResp.ok) return null

    const xml = await subResp.text()
    const segments = xml.match(/<text[^>]*>[\s\S]*?<\/text>/g) || []

    const lines: string[] = []
    let prevText = ''

    for (const seg of segments) {
      const raw = seg.match(/<text[^>]*>([\s\S]*?)<\/text>/)?.[1] || ''
      const text = decodeXml(raw).replace(/\n/g, ' ').trim()
      if (!text || text === prevText) continue
      prevText = text

      // 按标点断句，每句一行
      const sentences = text.split(/(?<=[。！？；;!?])/g).filter(Boolean)
      for (const s of sentences) {
        const trimmed = s.trim()
        if (trimmed) lines.push(trimmed)
      }
    }

    if (lines.length === 0) return null

    return {
      text: lines.join('\n'),
      lang: track.languageCode || 'unknown',
      isAuto: track.kind === 'asr',
    }
  } catch {
    return null
  }
}

export class YouTubeCollector extends BaseCollector {
  private get channelId(): string | undefined {
    return this.source.config.channel_id
  }

  private get playlistId(): string | undefined {
    return this.source.config.playlist_id
  }

  private get maxItems(): number {
    return Number(this.source.config.max_items) || 50
  }

  async fetchItems(): Promise<CollectedItem[]> {
    if (!this.channelId && !this.playlistId) {
      throw new Error('请配置 channel_id 或 playlist_id')
    }

    // 获取视频列表：先尝试 RSS，404 时回退到 innertube browse API
    let entries: VideoEntry[] = []

    if (this.playlistId) {
      // 播放列表只支持 RSS
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${this.playlistId}`
      const resp = await fetchWithRetry(rssUrl, { headers: { 'User-Agent': USER_AGENT } })
      if (!resp.ok) {
        throw new Error(`YouTube 播放列表 RSS 失败: ${resp.status}（${this.playlistId}）`)
      }
      entries = parseYouTubeRss(await resp.text())
    } else {
      // 频道：RSS → innertube 回退
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${this.channelId}`
      const resp = await fetchWithRetry(rssUrl, { headers: { 'User-Agent': USER_AGENT } })
      if (resp.ok) {
        entries = parseYouTubeRss(await resp.text())
      } else {
        // RSS 不可用（部分频道被 YouTube 禁用了 RSS），回退到 innertube
        entries = await fetchVideosViaInnertube(this.channelId!)
        if (entries.length === 0) {
          throw new Error(`频道 ${this.channelId} 无法获取视频（RSS 404 且 innertube 无结果）`)
        }
      }
    }

    const items: CollectedItem[] = []
    const maxTotal = this.source.last_collected_at ? Infinity : this.maxItems

    for (const entry of entries) {
      if (this.checkContentExists(entry.videoId)) break
      if (items.length >= maxTotal) break

      // 获取字幕（和 B站 同样的逻辑：优先字幕，回退到简介）
      let content = entry.description || ''
      let subtitleType: CollectedItem['subtitle_type'] = content ? 'description' : 'none'

      try {
        const subs = await fetchSubtitles(entry.videoId)
        if (subs) {
          content = subs.text
          const isZh = subs.lang.startsWith('zh')
          if (subs.isAuto) {
            subtitleType = isZh ? 'ai-zh' : 'ai-en'
          } else {
            subtitleType = isZh ? 'zh-CN' : 'en'
          }
        }
      } catch {
        // 字幕获取失败，使用 description
      }

      items.push({
        external_id: entry.videoId,
        title: entry.title || `YouTube 视频 ${entry.videoId}`,
        author: entry.authorName || this.source.name,
        url: `https://www.youtube.com/watch?v=${entry.videoId}`,
        content,
        tags: ['youtube'],
        published_at: entry.published
          ? new Date(entry.published).toISOString()
          : new Date().toISOString(),
        source_type: 'youtube' as const,
        subtitle_type: subtitleType,
      })
    }

    return items
  }
}
