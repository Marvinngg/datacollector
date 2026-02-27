export type SourceType = 'bilibili' | 'youtube' | 'zsxq' | 'rss' | 'web'

export interface Source {
  id: number
  name: string
  type: SourceType
  config: Record<string, any>
  is_active: boolean
  last_collected_at: string | null
  last_error: string | null
  created_at: string
}

export interface Content {
  id: number
  source_id: number
  external_id: string
  title: string
  author: string | null
  url: string | null
  tags: string[]
  file_path: string
  published_at: string | null
  collected_at: string
  source_type?: SourceType
  source_name?: string
}

export interface Task {
  id: number
  source_id: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  items_found: number
  items_new: number
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface Settings {
  data_dir: string
  cron_schedule: string
  bilibili_cookie: string
  zsxq_cookie: string
  youtube_cookie: string
}

export interface CollectedItem {
  external_id: string
  title: string
  author: string
  url: string
  content: string
  tags: string[]
  published_at: string
  duration?: string
  source_type: SourceType
  subtitle_type?: 'ai-zh' | 'zh-CN' | 'ai-en' | 'en' | 'description' | 'none'
  parts?: number
}

export interface CollectResult {
  items_found: number
  items_new: number
  items: CollectedItem[]
  error?: string
}
