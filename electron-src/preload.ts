import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  selectDataDir: () => ipcRenderer.invoke('select-data-dir'),
  isElectron: true,
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  loginBilibili: () => ipcRenderer.invoke('login-bilibili'),
  loginZsxq: () => ipcRenderer.invoke('login-zsxq'),
  loginYoutube: () => ipcRenderer.invoke('login-youtube'),
})
