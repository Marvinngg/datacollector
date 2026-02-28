import path from 'path'
import fs from 'fs'
import os from 'os'

/**
 * 读取 Electron config.json 中的 dataDir 配置。
 * config 路径：~/Library/Application Support/data-collector/config.json（macOS）
 */
function getConfigDataDir(): string | undefined {
  try {
    const appName = 'data-collector'
    const configDir =
      process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', appName)
        : process.platform === 'win32'
          ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName)
          : path.join(os.homedir(), '.config', appName)

    const configPath = path.join(configDir, 'config.json')
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.dataDir?.trim()) return config.dataDir
    }
  } catch {}
  return undefined
}

/**
 * 统一的数据目录解析，优先级：
 * 1. DATA_DIR 环境变量（生产模式由 Electron 主进程设置）
 * 2. config.json 中的 dataDir（用户手动选择的目录）
 * 3. process.cwd()/data（dev 模式默认）
 */
export function getDataDir(): string {
  return process.env.DATA_DIR || getConfigDataDir() || path.join(process.cwd(), 'data')
}
