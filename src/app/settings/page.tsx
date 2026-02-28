'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Save, CheckCircle2, Loader2, LogIn, Eye, EyeOff, FolderOpen } from 'lucide-react'

const frequencyOptions = [
  { value: '0 */6 * * *', label: '每 6 小时' },
  { value: '0 */12 * * *', label: '每 12 小时' },
  { value: '0 8 * * *', label: '每天 1 次（早 8 点）' },
  { value: '0 8,20 * * *', label: '每天 2 次（早 8 晚 8）' },
  { value: '0 8 * * 1,4', label: '每周 2 次（周一、周四）' },
]

interface SettingsForm {
  cron_schedule: string
  bilibili_cookie: string
  zsxq_cookie: string
  youtube_cookie: string
}

const defaultSettings: SettingsForm = {
  cron_schedule: '0 8 * * *',
  bilibili_cookie: '',
  zsxq_cookie: '',
  youtube_cookie: '',
}

/** Cookie 状态块：已配置时只显示 badge，手动配置时可展开输入框 */
function CookieSection({
  label,
  description,
  icon,
  cookie,
  placeholder,
  isConfigured,
  isElectron,
  isLogging,
  onLogin,
  onChange,
  loginLabel,
}: {
  label: string
  description: string
  icon: string
  cookie: string
  placeholder: string
  isConfigured: boolean
  isElectron: boolean
  isLogging: boolean
  onLogin?: () => void
  onChange: (v: string) => void
  loginLabel: string
}) {
  const [showManual, setShowManual] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div>
              <CardTitle className="text-base">{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {isConfigured ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              已登录
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">未配置</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Electron：一键登录按钮 */}
        {isElectron && onLogin && (
          <Button onClick={onLogin} disabled={isLogging} variant="outline" className="w-full">
            {isLogging ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />等待扫码登录...</>
            ) : (
              <><LogIn className="h-4 w-4 mr-2" />{loginLabel}</>
            )}
          </Button>
        )}

        {/* 手动配置入口（折叠） */}
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {showManual ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {showManual ? '收起手动配置' : '手动粘贴 Cookie'}
        </button>

        {showManual && (
          <div className="space-y-2">
            <div className="relative">
              <Textarea
                value={showRaw ? cookie : (cookie ? '•'.repeat(Math.min(cookie.length, 40)) : '')}
                onChange={(e) => showRaw && onChange(e.target.value)}
                readOnly={!showRaw}
                placeholder={placeholder}
                rows={3}
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                title={showRaw ? '隐藏' : '显示并编辑'}
              >
                {showRaw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {showRaw && !isElectron && (
              <p className="text-xs text-muted-foreground">
                登录网站后按 F12 → Network → 找到请求 → 复制 Request Headers 中的 Cookie 字段
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(defaultSettings)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [biliLogging, setBiliLogging] = useState(false)
  const [zsxqLogging, setZsxqLogging] = useState(false)
  const [ytLogging, setYtLogging] = useState(false)
  const [dataDir, setDataDir] = useState<string>('')
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setForm({ ...defaultSettings, ...data.settings })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))

    // 获取数据目录路径
    const api = (window as any).electronAPI
    if (api?.getDataDir) {
      api.getDataDir().then((dir: string) => setDataDir(dir || ''))
    } else {
      setDataDir('./data')
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  const update = (key: keyof SettingsForm, value: string) => {
    setForm({ ...form, [key]: value })
    setSaved(false)
  }

  const reloadSettings = async () => {
    const res = await fetch('/api/settings')
    const data = await res.json()
    setForm({ ...defaultSettings, ...data.settings })
  }

  const handleBiliLogin = async () => {
    if (!(window as any).electronAPI?.loginBilibili) return
    setBiliLogging(true)
    try {
      const cookie = await (window as any).electronAPI.loginBilibili()
      if (cookie) await reloadSettings()
    } finally {
      setBiliLogging(false)
    }
  }

  const handleZsxqLogin = async () => {
    if (!(window as any).electronAPI?.loginZsxq) return
    setZsxqLogging(true)
    try {
      const cookie = await (window as any).electronAPI.loginZsxq()
      if (cookie) await reloadSettings()
    } finally {
      setZsxqLogging(false)
    }
  }

  const handleYtLogin = async () => {
    if (!(window as any).electronAPI?.loginYoutube) return
    setYtLogging(true)
    try {
      const cookie = await (window as any).electronAPI.loginYoutube()
      if (cookie) await reloadSettings()
    } finally {
      setYtLogging(false)
    }
  }

  if (!loaded) return null

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">设置</h2>
          <p className="text-sm text-muted-foreground mt-1">全局配置和平台凭证</p>
        </div>
        <Button onClick={handleSave} size="sm" disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />保存中...</>
          ) : saved ? (
            <><CheckCircle2 className="h-4 w-4 mr-1.5 text-green-500" />已保存</>
          ) : (
            <><Save className="h-4 w-4 mr-1.5" />保存设置</>
          )}
        </Button>
      </div>

      {/* 采集设置 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">采集设置</CardTitle>
          <CardDescription>配置自动采集的频率和数据存储位置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">采集频率</Label>
            <Select value={form.cron_schedule} onValueChange={(v) => update('cron_schedule', v)}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">数据存储路径</Label>
            <div className="flex items-center gap-2 max-w-md">
              <Input
                value={dataDir}
                readOnly
                className="text-sm flex-1 bg-muted"
              />
              {isElectron && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const api = (window as any).electronAPI
                    if (api?.selectDataDir) {
                      await api.selectDataDir()
                    }
                  }}
                >
                  <FolderOpen className="h-4 w-4 mr-1.5" />
                  更换
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isElectron ? '更换目录后需要重启应用' : '开发模式下使用项目根目录的 ./data'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* B站 */}
      <CookieSection
        label="B站"
        description="获取视频字幕需要登录态"
        icon="📺"
        cookie={form.bilibili_cookie}
        placeholder="粘贴 bilibili.com Cookie（需包含 SESSDATA）"
        isConfigured={form.bilibili_cookie.includes('SESSDATA')}
        isElectron={isElectron}
        isLogging={biliLogging}
        onLogin={handleBiliLogin}
        onChange={(v) => update('bilibili_cookie', v)}
        loginLabel="一键登录 B站（扫码自动获取）"
      />

      {/* 知识星球 */}
      <CookieSection
        label="知识星球"
        description="采集帖子内容需要登录态"
        icon="🌍"
        cookie={form.zsxq_cookie}
        placeholder="粘贴 zsxq.com Cookie"
        isConfigured={form.zsxq_cookie.trim().length > 0}
        isElectron={isElectron}
        isLogging={zsxqLogging}
        onLogin={handleZsxqLogin}
        onChange={(v) => update('zsxq_cookie', v)}
        loginLabel="一键登录知识星球（扫码自动获取）"
      />

      {/* YouTube */}
      <CookieSection
        label="YouTube"
        description="登录后可一键导入订阅频道列表"
        icon="▶️"
        cookie={form.youtube_cookie}
        placeholder="粘贴 youtube.com Cookie（需包含 SAPISID）"
        isConfigured={form.youtube_cookie.includes('SAPISID')}
        isElectron={isElectron}
        isLogging={ytLogging}
        onLogin={handleYtLogin}
        onChange={(v) => update('youtube_cookie', v)}
        loginLabel="一键登录 YouTube（Google 账号扫码）"
      />
    </div>
  )
}
