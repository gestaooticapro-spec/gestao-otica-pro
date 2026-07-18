export {}

declare global {
  interface Window {
    towerDesktop?: {
      isAvailable: true
      getNetworkStatus: () => Promise<{ online: boolean }>
      openNetworkSettings: () => Promise<{
        success: boolean
        message?: string
      }>
    }
  }
}
