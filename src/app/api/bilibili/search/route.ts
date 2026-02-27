import { NextRequest, NextResponse } from 'next/server'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword')
  if (!keyword?.trim()) {
    return NextResponse.json({ users: [] })
  }

  try {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeURIComponent(keyword)}&page=1`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://www.bilibili.com',
      },
    })

    const data = await resp.json()
    if (data.code !== 0 || !data.data?.result) {
      return NextResponse.json({ users: [] })
    }

    const users = data.data.result.slice(0, 10).map((u: any) => ({
      mid: u.mid,
      name: (u.uname || '').replace(/<[^>]*>/g, ''),
      avatar: u.upic?.startsWith('//') ? `https:${u.upic}` : u.upic,
      fans: u.fans,
      videos: u.videos,
      sign: (u.usign || '').slice(0, 60),
    }))

    return NextResponse.json({ users })
  } catch (err: any) {
    return NextResponse.json({ users: [], error: err.message })
  }
}
