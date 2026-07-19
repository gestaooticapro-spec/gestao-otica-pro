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
  getRemoteConfigAccess: () => ipcRenderer.invoke('tower:get-remote-config-access'),
  rotateRemoteConfigAccess: () => ipcRenderer.invoke('tower:rotate-remote-config-access'),
  getHardwareDiagnostics: () => ipcRenderer.invoke('tower:get-hardware-diagnostics'),
  openCustomerDisplayTest: () => ipcRenderer.invoke('tower:open-customer-display-test'),
  closeCustomerDisplayTest: () => ipcRenderer.invoke('tower:close-customer-display-test'),
  openCustomerExperience: (url) => ipcRenderer.invoke('tower:open-customer-experience', url),
  closeCustomerExperience: () => ipcRenderer.invoke('tower:close-customer-experience'),
})
