const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  loginBilibili: () => ipcRenderer.invoke('login-bilibili'),
  loginZsxq: () => ipcRenderer.invoke('login-zsxq'),
  loginYoutube: () => ipcRenderer.invoke('login-youtube'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  isElectron: true,
})
