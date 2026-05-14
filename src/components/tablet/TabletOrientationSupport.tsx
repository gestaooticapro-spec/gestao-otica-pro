'use client'

import { useEffect } from 'react'

type ScreenOrientationWithUnlock = ScreenOrientation & {
  unlock?: () => void
}

export function TabletOrientationSupport() {
  useEffect(() => {
    const updateViewportSize = () => {
      document.documentElement.style.setProperty('--app-vh', `${window.innerHeight * 0.01}px`)
      document.documentElement.style.setProperty('--app-vw', `${window.innerWidth * 0.01}px`)
    }

    const unlockOrientation = () => {
      try {
        const orientation = window.screen.orientation as ScreenOrientationWithUnlock | undefined
        orientation?.unlock?.()
      } catch {
        // Alguns navegadores recusam unlock quando a tela nao esta em fullscreen.
      }
    }

    updateViewportSize()
    unlockOrientation()

    window.addEventListener('resize', updateViewportSize)
    window.addEventListener('orientationchange', updateViewportSize)
    window.addEventListener('orientationchange', unlockOrientation)

    return () => {
      window.removeEventListener('resize', updateViewportSize)
      window.removeEventListener('orientationchange', updateViewportSize)
      window.removeEventListener('orientationchange', unlockOrientation)
    }
  }, [])

  return null
}
