import { app, BrowserWindow, ipcMain, session, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { createTray } from './tray'
import { startScheduler, stopScheduler } from './scheduler'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

const isDev = !app.isPackaged
const PORT = 3456

// ========== 数据目录 config 管理 ==========
const configPath = path.join(app.getPath('userData'), 'config.json')

function getUserDataDir(): string {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.dataDir?.trim()) return config.dataDir
    }
  } catch {}
  // 默认路径：dev 模式用项目目录下的 data，生产模式用 userData/data
  return isDev
    ? path.join(app.getAppPath(), 'data')
    : path.join(app.getPath('userData'), 'data')
}

function setUserDataDir(dir: string): void {
  let config: Record<string, any> = {}
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch {}
  config.dataDir = dir
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/** 在主进程内启动 Next.js standalone 服务器（无子进程，无额外 Dock 图标） */
function startNextServer(): void {
  const appPath = app.getAppPath()
  const serverPath = path.join(appPath, '.next', 'standalone', 'server.js')
  const serverCwd = path.join(appPath, '.next', 'standalone')
  const dataDir = getUserDataDir()

  process.env.PORT = String(PORT)
  process.env.HOSTNAME = 'localhost'
  process.env.NODE_ENV = 'production'
  process.env.DATA_DIR = dataDir
  process.chdir(serverCwd)

  console.log('[next] loading standalone server in-process:', serverPath)
  console.log('[next] DATA_DIR:', dataDir)

  require(serverPath)
}

// 持久化 session 分区 — 登录窗口和链接查看窗口共享同一个 session
// cookies 自动持久化到磁盘，跨窗口、跨重启共享
function getSessionForUrl(url: string): Electron.Session {
  const hostname = new URL(url).hostname
  if (hostname.includes('zsxq.com')) return session.fromPartition('persist:zsxq')
  if (hostname.includes('bilibili.com')) return session.fromPartition('persist:bilibili')
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return session.fromPartition('persist:youtube')
  return session.defaultSession
}

/** 从持久化 session 中提取 cookie 字符串，保存到 settings 供 API collector 使用 */
async function saveCookiesToSettings(ses: Electron.Session, domain: string, settingsKey: string) {
  try {
    const cookies = await ses.cookies.get({ domain })
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const res = await fetch(`http://localhost:${PORT}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [settingsKey]: cookieStr }),
    })
    if (!res.ok) {
      console.error(`[saveCookies] PUT /api/settings failed: ${res.status} ${await res.text()}`)
    }
  } catch (e) {
    console.error('[saveCookies] Error:', e)
  }
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  const url = `http://localhost:${PORT}`
  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// B站登录窗口 - 使用持久化 session
ipcMain.handle('login-bilibili', async () => {
  const biliSession = session.fromPartition('persist:bilibili')
  return new Promise<string | null>((resolve) => {
    const loginWin = new BrowserWindow({
      width: 460,
      height: 580,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      title: '登录 bilibili',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: biliSession,
      },
    })

    loginWin.setMenuBarVisibility(false)
    loginWin.loadURL('https://passport.bilibili.com/login')

    let resolved = false

    const checkCookies = async () => {
      try {
        const cookies = await biliSession.cookies.get({ domain: '.bilibili.com' })
        const sessdata = cookies.find((c) => c.name === 'SESSDATA')
        if (sessdata && !resolved) {
          resolved = true
          const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          // 保存到 settings 供 collector API 使用
          await saveCookiesToSettings(biliSession, '.bilibili.com', 'bilibili_cookie')
          loginWin.close()
          resolve(cookieStr)
        }
      } catch {}
    }

    loginWin.webContents.on('did-navigate', () => checkCookies())
    loginWin.webContents.on('did-navigate-in-page', () => checkCookies())

    const pollInterval = setInterval(() => {
      if (resolved) { clearInterval(pollInterval); return }
      checkCookies()
    }, 1500)

    loginWin.on('closed', () => {
      clearInterval(pollInterval)
      if (!resolved) { resolved = true; resolve(null) }
    })
  })
})

// 知识星球登录窗口 - 使用持久化 session
ipcMain.handle('login-zsxq', async () => {
  const zsxqSession = session.fromPartition('persist:zsxq')
  return new Promise<string | null>((resolve) => {
    const loginWin = new BrowserWindow({
      width: 460,
      height: 580,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      title: '登录知识星球',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: zsxqSession,
      },
    })

    loginWin.setMenuBarVisibility(false)
    loginWin.loadURL('https://wx.zsxq.com/')

    let resolved = false

    const checkCookies = async () => {
      try {
        const cookies = await zsxqSession.cookies.get({ domain: '.zsxq.com' })
        const token = cookies.find((c) => c.name === 'zsxq_access_token')
        if (token && !resolved) {
          resolved = true
          // 保存到 settings 供 collector API 使用
          await saveCookiesToSettings(zsxqSession, '.zsxq.com', 'zsxq_cookie')
          const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          loginWin.close()
          resolve(cookieStr)
        }
      } catch {}
    }

    loginWin.webContents.on('did-navigate', () => checkCookies())
    loginWin.webContents.on('did-navigate-in-page', () => checkCookies())

    const pollInterval = setInterval(() => {
      if (resolved) { clearInterval(pollInterval); return }
      checkCookies()
    }, 1500)

    loginWin.on('closed', () => {
      clearInterval(pollInterval)
      if (!resolved) { resolved = true; resolve(null) }
    })
  })
})

// YouTube 登录窗口 - 使用持久化 session
ipcMain.handle('login-youtube', async () => {
  const ytSession = session.fromPartition('persist:youtube')
  return new Promise<string | null>((resolve) => {
    const loginWin = new BrowserWindow({
      width: 500,
      height: 680,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      title: '登录 YouTube',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: ytSession,
      },
    })

    loginWin.setMenuBarVisibility(false)
    loginWin.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/')

    let resolved = false

    const checkCookies = async () => {
      try {
        const cookies = await ytSession.cookies.get({ domain: '.youtube.com' })
        const sapisid = cookies.find((c) => c.name === 'SAPISID')
        if (sapisid && !resolved) {
          resolved = true
          // 保存到 settings 供订阅 API 使用
          await saveCookiesToSettings(ytSession, '.youtube.com', 'youtube_cookie')
          loginWin.close()
          resolve(sapisid.value)
        }
      } catch {}
    }

    loginWin.webContents.on('did-navigate', () => checkCookies())
    loginWin.webContents.on('did-navigate-in-page', () => checkCookies())

    const pollInterval = setInterval(() => {
      if (resolved) { clearInterval(pollInterval); return }
      checkCookies()
    }, 1500)

    loginWin.on('closed', () => {
      clearInterval(pollInterval)
      if (!resolved) { resolved = true; resolve(null) }
    })
  })
})

/** 将 cookie 字符串（name=value; name2=value2...）注入到指定 session */
async function injectCookieString(ses: Electron.Session, cookieStr: string, domain: string, urls: string[]) {
  let injected = 0
  for (const part of cookieStr.split(';')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) continue
    const name = part.slice(0, eqIdx).trim()
    const value = part.slice(eqIdx + 1).trim()
    if (!name) continue
    // 为每个 URL 都注入（覆盖 wx / api 等多个子域）
    for (const originUrl of urls) {
      try {
        await ses.cookies.set({
          url: originUrl,
          name,
          value,
          domain: `.${domain}`,
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'no_restriction',
        })
        injected++
      } catch (e) {
        console.error(`[cookie-inject] 注入失败 ${name} → ${originUrl}:`, e)
      }
    }
  }
  console.log(`[cookie-inject] 注入 ${injected} 条 cookie 到 ${domain}`)
}

// 在 Electron 窗口中打开 URL
ipcMain.handle('open-url', async (_event, url: string) => {
  const targetSession = getSessionForUrl(url)

  // 从 settings 读取最新 cookie 并注入
  let zsxqCookie = ''
  try {
    const res = await fetch(`http://localhost:${PORT}/api/settings`)
    const data = await res.json()
    const settings = (data.settings || {}) as Record<string, string>

    if (url.includes('zsxq.com') && settings.zsxq_cookie) {
      zsxqCookie = settings.zsxq_cookie
      // 注入到所有 zsxq 子域：wx（前端）和 api（接口）
      await injectCookieString(targetSession, zsxqCookie, 'zsxq.com', [
        'https://wx.zsxq.com',
        'https://api.zsxq.com',
      ])
    } else if (url.includes('bilibili.com') && settings.bilibili_cookie) {
      await injectCookieString(targetSession, settings.bilibili_cookie, 'bilibili.com', [
        'https://www.bilibili.com',
        'https://api.bilibili.com',
      ])
    }
  } catch (e) {
    console.error('[open-url] 读取 settings 失败:', e)
  }

  // 知识星球：用 webRequest 拦截器强制给所有 API 请求注入 cookie
  // 这是最可靠的方式，无论 SPA 用什么认证机制都能确保 cookie 送达
  if (url.includes('zsxq.com') && zsxqCookie) {
    targetSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.zsxq.com/*'] },
      (details, callback) => {
        const existing = details.requestHeaders['Cookie'] || ''
        if (!existing.includes('zsxq_access_token')) {
          details.requestHeaders['Cookie'] = existing
            ? `${existing}; ${zsxqCookie}`
            : zsxqCookie
        }
        callback({ requestHeaders: details.requestHeaders })
      }
    )
  }

  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    parent: mainWindow || undefined,
    title: '查看内容',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: targetSession,
    },
  })
  win.setMenuBarVisibility(false)
  win.loadURL(url)

  // 窗口关闭时移除 webRequest 拦截器，避免残留
  win.on('closed', () => {
    if (url.includes('zsxq.com')) {
      targetSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://*.zsxq.com/*'] },
        null as any
      )
    }
  })

  return true
})

// ========== Auto Update ==========
function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] 发现新版本: ${info.version}`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: '更新就绪',
      message: `新版本 ${info.version} 已下载，重启后自动安装。`,
      buttons: ['立即重启', '稍后'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.log('[updater] 检查更新失败:', err.message)
  })

  autoUpdater.checkForUpdatesAndNotify()
}

app.on('ready', async () => {
  // 生产模式：在主进程内加载 Next.js standalone 服务器
  if (!isDev) {
    startNextServer()
    // 等待服务就绪
    await new Promise<void>((resolve) => {
      let resolved = false
      const poll = setInterval(async () => {
        if (resolved) return
        try {
          await fetch(`http://localhost:${PORT}/`)
          resolved = true
          clearInterval(poll)
          console.log('[next] server is ready')
          resolve()
        } catch {}
      }, 300)
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          clearInterval(poll)
          console.log('[next] timeout waiting for server, proceeding anyway')
          resolve()
        }
      }, 15000)
    })
  }

  createWindow()
  if (mainWindow) {
    createTray(mainWindow, PORT)
  }
  startScheduler(PORT)
  if (!isDev) setupAutoUpdater()
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  } else {
    createWindow()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  stopScheduler()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('get-app-path', () => app.getAppPath())

ipcMain.handle('get-data-dir', () => {
  return getUserDataDir()
})

ipcMain.handle('select-data-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据存储目录',
  })
  if (result.canceled || !result.filePaths[0]) return null

  const chosen = result.filePaths[0]
  setUserDataDir(chosen)

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '数据目录已更换',
    message: `数据目录已设置为：\n${chosen}\n\n需要重启应用才能生效。`,
    buttons: ['立即重启', '稍后'],
  })
  if (response === 0) {
    app.relaunch()
    app.exit(0)
  }
  return chosen
})
