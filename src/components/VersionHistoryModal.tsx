'use client'

import { useEffect, useState } from 'react'
import { History, X } from 'lucide-react'

import { PENDING_RELEASE_CHANGES, PENDING_RELEASE_VERSION, RELEASE_HISTORY, type Release } from '@/lib/release-history'

const RELEASES_PER_PAGE = 3

const releasesForDisplay: Release[] = PENDING_RELEASE_VERSION && PENDING_RELEASE_CHANGES.length
  ? [{ version: PENDING_RELEASE_VERSION, date: 'Em preparação', changes: [...PENDING_RELEASE_CHANGES] }, ...RELEASE_HISTORY]
  : RELEASE_HISTORY

type VersionHistoryModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function VersionHistoryModal({ isOpen, onClose }: VersionHistoryModalProps) {
  const [visibleReleaseCount, setVisibleReleaseCount] = useState(RELEASES_PER_PAGE)

  useEffect(() => {
    if (isOpen) setVisibleReleaseCount(RELEASES_PER_PAGE)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    void fetch('/api/version-history-clicks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: releasesForDisplay[0].version }),
    }).catch(() => undefined)
  }, [isOpen])

  if (!isOpen) return null

  const visibleReleases = releasesForDisplay.slice(0, visibleReleaseCount)
  const loadOlderReleases = () => {
    setVisibleReleaseCount((current) => Math.min(current + RELEASES_PER_PAGE, releasesForDisplay.length))
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      onMouseDown={onClose}
    >
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 text-slate-100">
            <History className="h-4 w-4 text-cyan-300" />
            <h2 id="version-history-title" className="text-sm font-black uppercase tracking-wider">Histórico de versões</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Fechar histórico de versões">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div
          className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5"
          onScroll={(event) => {
            const element = event.currentTarget
            if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) loadOlderReleases()
          }}
        >
          {visibleReleases.map((release, index) => (
            <article key={release.version} className={index > 0 ? 'border-t border-white/10 pt-5' : ''}>
              <h3 className="text-sm font-bold text-white">Versão {release.version} <span className="font-medium text-slate-400">- {release.date}</span></h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-300">
                {release.changes.map((change) => <li key={change}>{change}</li>)}
              </ul>
            </article>
          ))}
          {visibleReleaseCount < releasesForDisplay.length && (
            <button type="button" onClick={loadOlderReleases} className="w-full py-2 text-xs font-bold text-cyan-200 transition hover:text-white">
              Carregar versoes anteriores
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
