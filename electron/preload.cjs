'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('towerDesktop', {
  isAvailable: true,
  getNetworkStatus: () => ipcRenderer.invoke('tower:get-network-status'),
  openNetworkSettings: () => ipcRenderer.invoke('tower:open-network-settings'),
  getDeviceIdentity: () => ipcRenderer.invoke('tower:get-device-identity'),
  enrollAsset: (request) => ipcRenderer.invoke('tower:enroll-asset', request),
  getAssetIdentityStatus: () => ipcRenderer.invoke('tower:get-asset-identity-status'),
  pairDevice: (request) => ipcRenderer.invoke('tower:pair-device', request),
  getDeviceSessionStatus: () => ipcRenderer.invoke('tower:get-device-session-status'),
  getDeviceSessionSummary: () => ipcRenderer.invoke('tower:get-device-session-summary'),
  getAdminPinStatus: () => ipcRenderer.invoke('tower:get-admin-pin-status'),
  submitAdminPin: (request) => ipcRenderer.invoke('tower:submit-admin-pin', request),
  getHardwareDiagnostics: () => ipcRenderer.invoke('tower:get-hardware-diagnostics'),
  openCustomerDisplayTest: () => ipcRenderer.invoke('tower:open-customer-display-test'),
  closeCustomerDisplayTest: () => ipcRenderer.invoke('tower:close-customer-display-test'),
})
