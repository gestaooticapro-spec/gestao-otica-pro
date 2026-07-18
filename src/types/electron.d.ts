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
      getDeviceIdentity: () => Promise<{
        deviceLabel: string
        appVersion: string
      }>
      enrollAsset: (request: {
        method: 'qr' | 'code'
        publicCode: string
        credential: string
      }) => Promise<{
        success: boolean
        status?: 'enrolled'
        message?: string
        protectedByOs?: boolean
        identity?: {
          assetId: string
          publicCode: string
          enrolledAt: string
        }
      }>
      getAssetIdentityStatus: () => Promise<{
        success: boolean
        enrolled: boolean
        message?: string
        revoked?: boolean
        credentialVerified?: boolean
        identity?: {
          assetId: string
          publicCode: string
          enrolledAt: string
        }
      }>
      pairDevice: (request: {
        method: 'qr' | 'code'
        credential: string
      }) => Promise<{
        success: boolean
        status?: 'paired'
        message?: string
        protectedByOs?: boolean
        session?: {
          deviceId: string
          assetId: string
          publicCode: string
          tenantId: string
          storeId: number
          deviceLabel: string
          pairedAt: string
        }
      }>
      getDeviceSessionStatus: () => Promise<{
        success: boolean
        paired: boolean
        revoked?: boolean
        credentialVerified?: boolean
        protectedByOs: boolean
        session?: {
          deviceId: string
          assetId: string
          publicCode: string
          tenantId: string
          storeId: number
          deviceLabel: string
          pairedAt: string
        }
      }>
      getDeviceSessionSummary: () => Promise<{
        success: boolean
        paired: boolean
        protectedByOs: boolean
        session?: {
          deviceId: string
          assetId: string
          publicCode: string
          tenantId: string
          storeId: number
          deviceLabel: string
          pairedAt: string
        } | null
      }>
      getAdminPinStatus: () => Promise<{
        success: boolean
        message?: string
        mustChange?: boolean
        failedAttempts?: number
        lockedUntil?: string | null
      }>
      submitAdminPin: (request: {
        action: 'verify' | 'change'
        currentPin: string
        newPin?: string
      }) => Promise<{
        success: boolean
        message?: string
        mustChange?: boolean
        failedAttempts?: number
        lockedUntil?: string | null
      }>
      getHardwareDiagnostics: () => Promise<{
        platform: string
        hostname: string
        online: boolean
        displays: Array<{
          id: string
          label: string
          primary: boolean
          internal: boolean
          rotation: number
          scaleFactor: number
          bounds: { x: number; y: number; width: number; height: number }
          workArea: { x: number; y: number; width: number; height: number }
          orientation: 'portrait' | 'landscape'
        }>
      }>
      openCustomerDisplayTest: () => Promise<{
        success: boolean
        message?: string
        display?: {
          id: string
          label: string
          primary: boolean
          internal: boolean
          rotation: number
          scaleFactor: number
          bounds: { x: number; y: number; width: number; height: number }
          workArea: { x: number; y: number; width: number; height: number }
          orientation: 'portrait' | 'landscape'
        }
      }>
      closeCustomerDisplayTest: () => Promise<{ success: boolean }>
    }
  }
}
