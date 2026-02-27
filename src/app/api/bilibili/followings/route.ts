import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

function getHeaders() {
  const cookie = getSetting('bilibili_cookie') || ''
  const h: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Referer: 'https://www.bilibili.com',
  }
  if (cookie) h['Cookie'] = cookie
  return h
}

// 获取当前登录用户的 mid
async function getMyMid(headers: Record<string, string>): Promise<number | null> {
  const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers })
  const data = await resp.json()
  if (data.code !== 0 || !data.data?.mid) return null
  return data.data.mid
}

// 获取关注列表
async function getFollowings(
  mid: number,
  headers: Record<string, string>,
  page: number = 1,
  pageSize: number = 50
) {
  const url = `https://api.bilibili.com/x/relation/followings?vmid=${mid}&pn=${page}&ps=${pageSize}&order=desc&order_type=attention`
  const resp = await fetch(url, { headers })
  const data = await resp.json()
  return data
}

export async function GET(request: NextRequest) {
  const headers = getHeaders()
  const cookie = getSetting('bilibili_cookie')

  if (!cookie?.includes('SESSDATA')) {
    return NextResponse.json({
      error: '未登录 B站，请先在设置中登录',
      users: [],
    })
  }

  // 获取当前用户 mid
  const myMid = await getMyMid(headers)
  if (!myMid) {
    return NextResponse.json({
      error: 'Cookie 已失效，请重新登录 B站',
      users: [],
    })
  }

  // 获取关注列表（最多拉3页 = 150人）
  const allUsers: any[] = []
  for (let page = 1; page <= 3; page++) {
    const data = await getFollowings(myMid, headers, page, 50)
    if (data.code !== 0) {
      if (page === 1) {
        return NextResponse.json({
          error: `获取关注列表失败: ${data.message || data.code}`,
          users: [],
        })
      }
      break
    }

    const list = data.data?.list || []
    if (list.length === 0) break

    for (const u of list) {
      allUsers.push({
        mid: u.mid,
        name: u.uname,
        avatar: u.face,
        sign: (u.sign || '').slice(0, 60),
        tag: u.tag?.[0]?.name || null,
      })
    }

    if (list.length < 50) break
  }

  return NextResponse.json({
    users: allUsers,
    myMid,
    total: allUsers.length,
  })
}
