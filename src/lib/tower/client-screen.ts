const TOWER_CLIENT_SCREEN_NAME = 'tower-client-screen'
const TOWER_CLIENT_WINDOW_KEY = '__towerClientScreen'

type TowerWindow = Window & {
  [TOWER_CLIENT_WINDOW_KEY]?: Window | null
}

export function openTowerClientScreen(url: string, features = 'popup=yes,width=1366,height=768') {
  if (typeof window === 'undefined') return null

  const clientWindow = window.open(url, TOWER_CLIENT_SCREEN_NAME, features)
  ;(window as TowerWindow)[TOWER_CLIENT_WINDOW_KEY] = clientWindow
  clientWindow?.focus()
  return clientWindow
}

export function closeTowerClientScreen() {
  if (typeof window === 'undefined') return

  const towerWindow = window as TowerWindow
  const clientWindow = towerWindow[TOWER_CLIENT_WINDOW_KEY]
  if (clientWindow && !clientWindow.closed) clientWindow.close()
  towerWindow[TOWER_CLIENT_WINDOW_KEY] = null
}
