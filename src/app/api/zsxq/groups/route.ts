import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function GET(request: NextRequest) {
  const cookie = getSetting('zsxq_cookie')

  if (!cookie) {
    return NextResponse.json({
      error: '未登录知识星球，请先在设置中登录',
      groups: [],
    })
  }

  try {
    const resp = await fetch('https://api.zsxq.com/v2/groups?type=mine', {
      headers: {
        'User-Agent': USER_AGENT,
        accept: 'application/json',
        Cookie: cookie,
      },
    })

    if (!resp.ok) {
      return NextResponse.json({
        error: `知识星球 API 错误: ${resp.status}`,
        groups: [],
      })
    }

    const data = await resp.json()

    if (!data.succeeded) {
      return NextResponse.json({
        error: data.resp_data?.err_msg || 'Cookie 已失效，请重新登录知识星球',
        groups: [],
      })
    }

    const groups = (data.resp_data?.groups || []).map((g: any) => ({
      group_id: String(g.group_id),
      name: g.name,
      description: (g.description || '').slice(0, 80),
      member_count: g.stat?.member_cnt || 0,
      topic_count: g.stat?.topic_cnt || 0,
      owner_name: g.owner?.name || '',
    }))

    return NextResponse.json({ groups })
  } catch (error: any) {
    return NextResponse.json({
      error: `请求失败: ${error.message}`,
      groups: [],
    })
  }
}
