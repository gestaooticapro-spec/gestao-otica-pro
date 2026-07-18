'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('towerDesktop', {
  isAvailable: true,
  getNetworkStatus: () => ipcRenderer.invoke('tower:get-network-status'),
  openNetworkSettings: () => ipcRenderer.invoke('tower:open-network-settings'),
})
