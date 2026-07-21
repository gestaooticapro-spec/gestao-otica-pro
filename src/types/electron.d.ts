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
      getRemoteConfigAccess: () => Promise<{
        success: boolean
        configured?: boolean
        url?: string
        updatedAt?: string
        message?: string
      }>
      rotateRemoteConfigAccess: () => Promise<{
        success: boolean
        configured?: boolean
        url?: string
        commercialPin?: string
        message?: string
      }>
      createLocalSession: (request: {
        experience: 'look' | 'visagismo' | 'campo_visual' | 'medidas' | 'thickness'
        sessionId?: string
      }) => Promise<{
        success: boolean
        message: string
        data?: import('@/lib/actions/tower-session.actions').TowerSession
      }>
      listLocalSessions: () => Promise<{
        success: boolean
        message: string
        data?: import('@/lib/actions/tower-session.actions').TowerSession[]
      }>
      createLocalCustomer: (request: {
        sessionId: string
        fullName: string
        mobilePhone: string
      }) => Promise<{
        success: boolean
        message: string
        data?: {
          id: number | string
          localId: string
          fullName: string
          mobilePhone: string
          provisional: boolean
        }
      }>
      linkLocalCustomer: (request: {
        sessionId: string
        localCustomerId: string
      }) => Promise<{
        success: boolean
        message: string
        remoteCustomerId?: number | null
      }>
      getLocalCustomerStatus: (localCustomerId: string) => Promise<{
        success: boolean
        message?: string
        localId?: string
        remoteCustomerId?: number | null
        syncStatus?: 'pending' | 'synced' | 'failed'
        lastError?: string | null
      }>
      closeLocalSession: (request: {
        sessionId: string
        status: 'completed' | 'discarded'
      }) => Promise<{
        success: boolean
        message: string
      }>
      saveLocalMeasurement: (request: {
        towerSessionId: string
        lensMode: 'multifocal' | 'bifocal'
        referenceMm: number
        frontMeasurements: object
        profileMeasurements: object
        attentionCodes: string[]
        algorithmVersion: string
      }) => Promise<{
        success: boolean
        message: string
        data?: { id: string; version: number; syncStatus: 'pending' | 'synced' }
      }>
      getLocalSyncStatus: () => Promise<{
        success: boolean
        pending: number
        synced: number
        lastSyncedAt: string | null
      }>
      syncLocalNow: () => Promise<{
        success: boolean
        pending: number
        synced: number
        lastSyncedAt: string | null
      }>
      getLocalConfiguration: (options?: { refresh?: boolean }) => Promise<{
        success: boolean
        source?: 'server' | 'cache'
        message?: string
        snapshot?: (import('@/lib/tower/configuration-snapshot').TowerConfigurationSnapshot & {
          downloadedAt: string
        }) | null
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
      getHardwareApprovalStatus: () => Promise<{
        success: boolean
        message?: string
        data?: {
          id: string
          hardwareFingerprint: string
          hardwareSnapshot: object
          cameraApprovedAt: string | null
          touchApprovedAt: string | null
          displayApprovedAt: string | null
          updatedAt: string
          syncStatus: 'pending' | 'synced' | 'failed'
        } | null
      }>
      approveHardwareTest: (request: {
        test: 'camera' | 'touch' | 'display'
      }) => Promise<{
        success: boolean
        message?: string
        data?: {
          id: string
          cameraApprovedAt: string | null
          touchApprovedAt: string | null
          displayApprovedAt: string | null
          updatedAt: string
          syncStatus: 'pending' | 'synced' | 'failed'
        }
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
      openCustomerExperience: (url: string) => Promise<{
        success: boolean
        message?: string
        simulated?: boolean
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
      closeCustomerExperience: () => Promise<{ success: boolean }>
    }
  }
}
