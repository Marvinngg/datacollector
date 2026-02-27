import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  isElectron: true,
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  loginBilibili: () => ipcRenderer.invoke('login-bilibili'),
  loginZsxq: () => ipcRenderer.invoke('login-zsxq'),
  loginYoutube: () => ipcRenderer.invoke('login-youtube'),
})
