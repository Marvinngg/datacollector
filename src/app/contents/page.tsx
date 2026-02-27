'use client'

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Trash2, ExternalLink, Copy, Check, FileText, Inbox, ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    electronAPI?: {
      openUrl?: (url: string) => Promise<boolean>
      isElectron?: boolean
    }
  }
}

interface ContentItem {
  id: number
  title: string
  author: string | null
  url: string | null
  tags: string[]
  file_path: string
  published_at: string | null
  collected_at: string
  source_type?: string
  source_name?: string
}

const platformLabels: Record<string, string> = {
  bilibili: 'B站',
  youtube: 'YouTube',
  zsxq: '知识星球',
  rss: 'RSS',
  web: '网页',
}

const platformIcons: Record<string, string> = {
  bilibili: '📺',
  youtube: '▶️',
  zsxq: '🌍',
  rss: '📡',
  web: '🌐',
}

const subtitleTypeLabels: Record<string, string> = {
  'ai-zh': 'AI字幕',
  'zh-CN': '人工字幕',
  'description': '描述',
  'none': '无字幕',
}

const dateRangeOptions = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '7d', label: '最近7天' },
  { value: '30d', label: '最近30天' },
]

function getDateRange(range: string): { from?: string; to?: string } {
  if (range === 'all') return {}
  const now = new Date()
  const to = now.toISOString()
  if (range === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    return { from, to }
  }
  if (range === '7d') {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    return { from, to }
  }
  if (range === '30d') {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    return { from, to }
  }
  return {}
}

function extractMetaFromBody(body: string): {
  subtitleType?: string
  duration?: string
  parts?: number
  wordCount: number
} {
  const wordCount = body.replace(/^---[\s\S]*?---\n*/m, '').replace(/^#.*\n*/m, '').trim().length
  let subtitleType: string | undefined
  let duration: string | undefined
  let parts: number | undefined

  const stMatch = body.match(/^subtitle_type:\s*(.+)$/m)
  if (stMatch) subtitleType = stMatch[1].trim()
  const durMatch = body.match(/^duration:\s*"?(.+?)"?\s*$/m)
  if (durMatch) duration = durMatch[1].trim()
  const partsMatch = body.match(/^parts:\s*(\d+)$/m)
  if (partsMatch) parts = parseInt(partsMatch[1])

  return { subtitleType, duration, parts, wordCount }
}

// ========== 知识星球标签解析 ==========

/** 从 <e .../> 标签属性字符串中解析键值对 */
function parseTagAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

/** 安全 decodeURIComponent，处理截断的 URL 编码 */
function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch {}
  // 截断的 URL 编码：从末尾逐步去掉字符直到能解码
  for (let i = s.length - 1; i >= Math.max(0, s.length - 8); i--) {
    try { return decodeURIComponent(s.slice(0, i)) } catch {}
  }
  return s
}

/** 将 zsxq 标题中的 <e .../> 标签转为纯文本（用于列表显示） */
function cleanZsxqTitle(title: string): string {
  // Step 1: 处理完整的 <e .../> 标签
  let result = title.replace(/<e\s+type="(\w+)"([^/]*?)\/>/g, (_, type, rest) => {
    const a = parseTagAttrs(rest)
    if (type === 'text_bold') return safeDecode(a.title || '')
    if (type === 'web') return safeDecode(a.title || a.href || '')
    if (type === 'hashtag') return safeDecode(a.title || '')
    if (type === 'mention') return safeDecode(a.title || '')
    return ''
  })

  // Step 2: 处理截断的 <e ...> 标签（数据库标题被 slice(0,50) 截断导致标签不完整）
  if (result.includes('<e ')) {
    result = result.replace(/<e\s[\s\S]*$/, (match) => {
      // 尝试提取 title 属性值
      const titleMatch = match.match(/title="([^"]*)/)
      if (titleMatch) return safeDecode(titleMatch[1])
      // 尝试提取 href 属性值
      const hrefMatch = match.match(/href="([^"]*)/)
      if (hrefMatch) return safeDecode(hrefMatch[1])
      return ''
    })
  }

  return result.replace(/\s+/g, ' ').trim()
}

type ContentPart =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'link'; href: string; label: string }
  | { type: 'hashtag'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'image'; src: string; alt: string }
  | { type: 'image_placeholder'; count: number }

/** 完整解析 zsxq 内容为结构化片段 */
function parseZsxqContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []

  // 综合正则：
  // 1. ![alt](<e type="web" href="..." .../> ) — 套娃图片
  // 2. [text](<e type="web" href="..." .../> ) — 套娃链接
  // 3. <e type="TYPE" .../> — 各种标签
  // 4. ![alt](url) — 普通 markdown 图片
  // 5. [包含 N 张图片] — 图片占位符
  const regex = /!\[([^\]]*)\]\(\s*<e\s+type="web"\s+([^/]*?)\/>\s*\)|\[([^\]]+)\]\(\s*<e\s+type="web"\s+([^/]*?)\/>\s*\)|<e\s+type="(\w+)"\s+([^/]*?)\/?>|!\[([^\]]*)\]\(([^)]+)\)|\[包含\s*(\d+)\s*张图片\]/g

  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // 先输出匹配前的普通文本
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      // 套娃图片：![alt](<e type="web" href="..." />)
      const attrs = parseTagAttrs(match[2])
      const src = safeDecode(attrs.href || '')
      parts.push({ type: 'image', src, alt: match[1] || '图片' })
    } else if (match[3] !== undefined && match[4] !== undefined) {
      // 套娃链接：[text](<e type="web" href="..." />)
      const attrs = parseTagAttrs(match[4])
      const href = safeDecode(attrs.href || '')
      parts.push({ type: 'link', href, label: match[3] })
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // <e type="TYPE" ATTRS />
      const tagType = match[5]
      const attrs = parseTagAttrs(match[6])

      if (tagType === 'text_bold') {
        parts.push({ type: 'bold', value: safeDecode(attrs.title || '') })
      } else if (tagType === 'web') {
        const href = safeDecode(attrs.href || '')
        const label = safeDecode(attrs.title || '') || href
        // 判断是否是图片 URL
        if (/\.(jpg|jpeg|png|gif|webp|bmp)/i.test(href)) {
          parts.push({ type: 'image', src: href, alt: label })
        } else {
          parts.push({ type: 'link', href, label })
        }
      } else if (tagType === 'hashtag') {
        parts.push({ type: 'hashtag', value: safeDecode(attrs.title || '') })
      } else if (tagType === 'mention') {
        parts.push({ type: 'mention', value: safeDecode(attrs.title || '') })
      } else {
        // 未知标签类型，当文本处理
        parts.push({ type: 'text', value: safeDecode(attrs.title || '') })
      }
    } else if (match[7] !== undefined && match[8] !== undefined) {
      // 普通 markdown 图片 ![alt](url)
      parts.push({ type: 'image', src: match[8], alt: match[7] || '图片' })
    } else if (match[9] !== undefined) {
      // [包含 N 张图片] 占位符
      parts.push({ type: 'image_placeholder', count: parseInt(match[9]) })
    }

    lastIndex = match.index + match[0].length
  }

  // 剩余文本
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts
}

/** 图片查看器：滚轮缩放、拖拽平移、双击重置 */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPt = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // 滚轮缩放，以鼠标位置为中心
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.min(Math.max(s * delta, 0.1), 20))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragging.current = true
    lastPt.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPt.current.x
    const dy = e.clientY - lastPt.current.y
    lastPt.current = { x: e.clientX, y: e.clientY }
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }))
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  // 双击重置
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setScale(1)
    setPos({ x: 0, y: 0 })
  }, [])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/80 select-none"
      onClick={onClose}
      onWheel={handleWheel}
    >
      <button
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-xs pointer-events-none">
        {Math.round(scale * 100)}% · 滚轮缩放 · 拖拽移动 · 双击重置
      </div>
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <img
          src={src}
          alt="查看"
          draggable={false}
          referrerPolicy="no-referrer"
          className="cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            maxWidth: 'none',
            maxHeight: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
    </div>
  )
}

/** 渲染知识星球内容 */
function ZsxqContentRenderer({ content, onOpenUrl }: { content: string; onOpenUrl: (url: string) => void }) {
  const parts = useMemo(() => parseZsxqContent(content), [content])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return <span key={i}>{part.value}</span>

          case 'bold':
            return <strong key={i} className="font-semibold">{part.value}</strong>

          case 'link':
            return (
              <a
                key={i}
                href={part.href}
                onClick={(e) => {
                  e.preventDefault()
                  onOpenUrl(part.href)
                }}
                className="text-blue-500 hover:text-blue-400 underline underline-offset-2 cursor-pointer break-all"
                title={part.href}
              >
                {part.label}
              </a>
            )

          case 'hashtag':
            return (
              <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-500 mx-0.5">
                {part.value}
              </span>
            )

          case 'mention':
            return (
              <span key={i} className="text-blue-500 font-medium">
                {part.value}
              </span>
            )

          case 'image':
            return (
              <div key={i} className="my-2">
                <img
                  src={part.src}
                  alt={part.alt}
                  className="max-w-full rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ maxHeight: '500px' }}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onClick={() => setLightboxSrc(part.src)}
                  onError={(e) => {
                    const el = e.currentTarget
                    el.style.display = 'none'
                    const next = el.nextElementSibling as HTMLElement | null
                    if (next) next.style.display = 'flex'
                  }}
                />
                <div className="hidden items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  <span>图片无法加载：{part.alt}</span>
                </div>
              </div>
            )

          case 'image_placeholder':
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 my-2">
                <ImageIcon className="h-4 w-4 shrink-0" />
                <span>包含 {part.count} 张图片（旧数据未保存图片URL，重新采集可获取）</span>
              </div>
            )

          default:
            return null
        }
      })}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}

// ========== 主页面 ==========

export default function ContentsPage() {
  return (
    <Suspense>
      <ContentsPageInner />
    </Suspense>
  )
}

function ContentsPageInner() {
  const searchParams = useSearchParams()
  const [contents, setContents] = useState<ContentItem[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState<string>('all')
  const [author, setAuthor] = useState<string>('all')
  const [dateRange, setDateRange] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('collected_at')
  const [authors, setAuthors] = useState<string[]>([])

  // Preview state
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [previewBody, setPreviewBody] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewSourceType, setPreviewSourceType] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewMeta, setPreviewMeta] = useState<{
    author?: string
    publishedAt?: string
    subtitleType?: string
    wordCount: number
    duration?: string
  }>({ wordCount: 0 })
  const [copied, setCopied] = useState(false)

  const fetchAuthors = useCallback(async (sourceType?: string) => {
    try {
      const params = new URLSearchParams()
      if (sourceType && sourceType !== 'all') params.set('source_type', sourceType)
      const res = await fetch(`/api/contents/authors?${params}`)
      const data = await res.json()
      setAuthors(data.authors || [])
    } catch {
      setAuthors([])
    }
  }, [])

  const fetchContents = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (platform && platform !== 'all') params.set('source_type', platform)
    if (author && author !== 'all') params.set('author', author)
    if (sortBy) params.set('sort_by', sortBy)
    const { from, to } = getDateRange(dateRange)
    if (from) params.set('from_date', from)
    if (to) params.set('to_date', to)
    params.set('limit', '100')

    const res = await fetch(`/api/contents?${params}`)
    const data = await res.json()
    setContents(data.contents || [])
    setTotal(data.total || 0)
  }, [search, platform, author, dateRange, sortBy])

  useEffect(() => { fetchContents() }, [platform, author, dateRange, sortBy, fetchContents])

  // 联动：platform 变化时重新拉取 authors 并重置 author 筛选
  useEffect(() => {
    setAuthor('all')
    fetchAuthors(platform)
  }, [platform, fetchAuthors])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchContents()
  }

  const handleSelect = async (item: ContentItem) => {
    if (selectedId === item.id) return
    setSelectedId(item.id)
    setPreviewLoading(true)
    setCopied(false)
    try {
      const res = await fetch(`/api/contents/${item.id}`)
      const data = await res.json()
      const body = data.body || '暂无内容'
      const meta = extractMetaFromBody(body)
      setPreviewTitle(data.content?.title || item.title)
      setPreviewBody(body)
      setPreviewUrl(item.url)
      setPreviewSourceType(item.source_type || '')
      setPreviewMeta({
        author: item.author || undefined,
        publishedAt: item.published_at || undefined,
        subtitleType: meta.subtitleType,
        wordCount: meta.wordCount,
        duration: meta.duration,
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  // 从概览页跳转过来时，通过 URL ?id=xxx 自动打开对应内容
  useEffect(() => {
    const idParam = searchParams.get('id')
    if (!idParam) return
    const targetId = Number(idParam)
    if (!targetId) return

    // 直接通过 API 获取该条内容并展示，不依赖列表是否已加载
    setSelectedId(targetId)
    setPreviewLoading(true)
    setCopied(false)
    fetch(`/api/contents/${targetId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.content) return
        const body = data.body || '暂无内容'
        const meta = extractMetaFromBody(body)
        setPreviewTitle(data.content.title || '')
        setPreviewBody(body)
        setPreviewUrl(data.content.url || null)
        setPreviewSourceType(data.content.source_type || '')
        setPreviewMeta({
          author: data.content.author || undefined,
          publishedAt: data.content.published_at || undefined,
          subtitleType: meta.subtitleType,
          wordCount: meta.wordCount,
          duration: meta.duration,
        })
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false))
  // 只在挂载和 searchParams 变化时执行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleCopy = async () => {
    const content = previewBody.replace(/^---[\s\S]*?---\n*/m, '').replace(/^#.*\n*/m, '').trim()
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenUrl = useCallback((url: string) => {
    // zsxq / bilibili 链接用 Electron 窗口打开（带 cookie）
    const needsElectron = url.includes('zsxq.com') || url.includes('bilibili.com')
    if (needsElectron && window.electronAPI?.openUrl) {
      window.electronAPI.openUrl(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除？将同时删除对应的 Markdown 文件。')) return
    await fetch(`/api/contents/${id}`, { method: 'DELETE' })
    if (selectedId === id) {
      setSelectedId(null)
      setPreviewBody('')
    }
    fetchContents()
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return d.slice(5, 10).replace('-', '/')
  }

  const formatFullDate = (d: string | null) => {
    if (!d) return ''
    return d.split('T')[0]
  }

  /** 提取纯内容（去掉 frontmatter 和标题行） */
  const getContentBody = (body: string) => {
    return body.replace(/^---[\s\S]*?---\n*/m, '').replace(/^#.*\n*/m, '').trim()
  }

  /** 获取显示标题（zsxq 需要解析标签） */
  const getDisplayTitle = (item: ContentItem) => {
    if (item.source_type === 'zsxq') {
      return cleanZsxqTitle(item.title)
    }
    return item.title
  }

  return (
    <div className="flex h-full">
      {/* 左侧面板：筛选 + 列表 */}
      <div className="w-80 border-r flex flex-col shrink-0">
        {/* 筛选栏 */}
        <div className="p-3 border-b space-y-2">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索标题或作者..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          </form>
          <div className="flex gap-1.5 flex-wrap">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[70px] px-2 bg-muted/50 border-transparent hover:border-border">
                <SelectValue placeholder="平台" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部平台</SelectItem>
                <SelectItem value="bilibili">B站</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="zsxq">知识星球</SelectItem>
                <SelectItem value="rss">RSS</SelectItem>
                <SelectItem value="web">网页</SelectItem>
              </SelectContent>
            </Select>
            {authors.length > 0 && (
              <Select value={author} onValueChange={setAuthor}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[70px] px-2 bg-muted/50 border-transparent hover:border-border">
                  <SelectValue placeholder="作者" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="all">全部作者</SelectItem>
                  {authors.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[70px] px-2 bg-muted/50 border-transparent hover:border-border">
                <SelectValue placeholder="日期" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {dateRangeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[70px] px-2 bg-muted/50 border-transparent hover:border-border">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="collected_at">采集时间</SelectItem>
                <SelectItem value="published_at">发布时间</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">共 {total} 条</p>
        </div>

        {/* 内容列表 */}
        <div className="flex-1 overflow-y-auto">
          {contents.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {search || platform !== 'all' || author !== 'all' || dateRange !== 'all'
                ? '没有匹配的内容'
                : '暂无已采集内容'}
            </div>
          ) : (
            contents.map((item) => {
              const pType = item.source_type || 'unknown'
              const icon = platformIcons[pType] || '📄'
              const isSelected = selectedId === item.id
              const displayTitle = getDisplayTitle(item)
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b transition-colors hover:bg-muted/50',
                    isSelected && 'bg-muted'
                  )}
                >
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm shrink-0">{icon}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{item.author}</span>
                    <span className="text-sm truncate">{displayTitle}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground pl-5">
                    <span>{formatDate(item.published_at || item.collected_at)}</span>
                    <span>·</span>
                    <span>{platformLabels[pType] || pType}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* 右侧面板：预览 */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedId === null ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">点击左侧内容查看详情</p>
            </div>
          </div>
        ) : previewLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">加载中...</p>
          </div>
        ) : (
          <>
            {/* 顶部元数据 */}
            <div className="p-4 border-b space-y-2">
              <h2 className="text-base font-semibold leading-tight">
                {previewSourceType === 'zsxq' ? cleanZsxqTitle(previewTitle) : previewTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {previewMeta.author && (
                  <span className="font-medium text-foreground">{previewMeta.author}</span>
                )}
                {previewMeta.publishedAt && (
                  <span>{formatFullDate(previewMeta.publishedAt)}</span>
                )}
                {previewMeta.duration && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{previewMeta.duration}</Badge>
                )}
                {previewMeta.subtitleType && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {subtitleTypeLabels[previewMeta.subtitleType] || previewMeta.subtitleType}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  <FileText className="h-2.5 w-2.5 mr-0.5" />
                  {previewMeta.wordCount.toLocaleString()} 字
                </Badge>
              </div>
            </div>

            {/* 内容区：根据 source_type 选择不同的渲染方式 */}
            <div className="flex-1 overflow-y-auto p-4">
              {previewSourceType === 'zsxq' && getContentBody(previewBody).includes('<e ') ? (
                <ZsxqContentRenderer content={getContentBody(previewBody)} onOpenUrl={handleOpenUrl} />
              ) : (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                  {previewBody.replace(/^---[\s\S]*?---\n*/m, '')}
                </pre>
              )}
            </div>

            {/* 底部工具栏 */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-t bg-background">
              <Button variant="outline" size="sm" onClick={handleCopy} className="text-xs">
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? '已复制' : '复制全文'}
              </Button>
              {previewUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleOpenUrl(previewUrl)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  原链接
                </Button>
              )}
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => selectedId && handleDelete(selectedId)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                删除
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
