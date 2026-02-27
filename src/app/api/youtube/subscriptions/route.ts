import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'
import { createHash } from 'crypto'

/** 从 Cookie 字符串中提取 SAPISID，构造 SAPISIDHASH 授权头 */
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

/** 递归搜索 JSON 对象中所有 channelRenderer */
function findChannelRenderers(obj: unknown, results: unknown[] = []): unknown[] {
  if (!obj || typeof obj !== 'object') return results
  const o = obj as Record<string, unknown>
  if (o.channelRenderer) results.push(o.channelRenderer)
  for (const val of Object.values(o)) {
    if (val && typeof val === 'object') findChannelRenderers(val, results)
  }
  return results
}

export async function GET() {
  const cookieStr = getSetting('youtube_cookie')
  if (!cookieStr?.trim()) {
    return NextResponse.json({ error: '请先在设置页面登录 YouTube' }, { status: 401 })
  }

  const authHeader = buildSapiSidHash(cookieStr)
  if (!authHeader) {
    return NextResponse.json(
      { error: 'Cookie 缺少 SAPISID，请重新登录 YouTube' },
      { status: 401 }
    )
  }

  const requestBody = JSON.stringify({
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20250312.04.00',
        hl: 'zh-CN',
        gl: 'CN',
      },
    },
    browseId: 'FEchannels',
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': cookieStr,
    'Authorization': authHeader,
    'X-Origin': 'https://www.youtube.com',
    'Origin': 'https://www.youtube.com',
    'Referer': 'https://www.youtube.com/',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Youtube-Client-Name': '1',
    'X-Youtube-Client-Version': '2.20250312.04.00',
  }

  // 带重试 + 超时，应对不稳定的代理网络
  let res: Response
  let lastError: string = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
        method: 'POST',
        headers,
        body: requestBody,
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (res!.ok) break
      lastError = `HTTP ${res!.status} ${res!.statusText}`
    } catch (e: unknown) {
      lastError = (e as Error).message
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, (2 ** attempt) * 1000))
  }

  if (!res!) {
    return NextResponse.json({ error: `网络请求失败（重试 3 次）: ${lastError}` }, { status: 500 })
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `YouTube API 请求失败: ${res.status} ${res.statusText}` },
      { status: res.status }
    )
  }

  const data = await res.json()
  const renderers = findChannelRenderers(data) as Array<Record<string, unknown>>

  const channels = renderers
    .map((r) => {
      const title = r.title as Record<string, unknown> | undefined
      const thumbnail = r.thumbnail as Record<string, unknown> | undefined
      const thumbList = (thumbnail?.thumbnails as Array<{ url: string }>) || []
      const subText =
        (r.subscriberCountText as Record<string, string> | undefined)?.simpleText ||
        (r.videoCountText as Record<string, string> | undefined)?.simpleText ||
        ''
      return {
        channel_id: r.channelId as string,
        name:
          (title?.simpleText as string) ||
          ((title?.runs as Array<{ text: string }>)?.[0]?.text) ||
          (r.channelId as string),
        avatar: thumbList[0]?.url || '',
        subscriber_count: subText,
      }
    })
    .filter((c) => c.channel_id)

  return NextResponse.json({ channels })
}
