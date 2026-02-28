const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  selectDataDir: () => ipcRenderer.invoke('select-data-dir'),
  loginBilibili: () => ipcRenderer.invoke('login-bilibili'),
  loginZsxq: () => ipcRenderer.invoke('login-zsxq'),
  loginYoutube: () => ipcRenderer.invoke('login-youtube'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  isElectron: true,
})
