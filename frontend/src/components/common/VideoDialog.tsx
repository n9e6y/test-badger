import { Film, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { ScenarioRow } from '@/api/types'
import { Button } from '@/components/ui/button'

/** Plays the slice of the run's recording that shows one scenario. Escape closes it. */
export function VideoDialog({ scenario, onClose }: { scenario: ScenarioRow; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const start = scenario.video_start_s ?? 0
  const end = scenario.video_end_s

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video of ${scenario.code}: ${scenario.title}`}
      className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,#2b2b2d_70%,transparent)] p-4"
      onClick={onClose}
    >
      <div className="flex max-h-full w-full max-w-[1000px] flex-col gap-3 border bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <Film className="mt-1 size-5 shrink-0 stroke-[1.5] text-steel-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl font-semibold">
              {scenario.code} · {scenario.title}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Recording of the real browser. Password fields show as dots, as on screen.
            </p>
          </div>
          <Button ref={closeRef} variant="outline" size="icon" onClick={onClose} aria-label="Close video">
            <X />
          </Button>
        </div>
        <video
          ref={video}
          src={`/api/artifacts/${scenario.video_artifact_id}`}
          controls
          autoPlay
          muted
          playsInline
          className="max-h-[70vh] w-full border bg-black"
          onLoadedMetadata={() => {
            if (video.current) video.current.currentTime = start
          }}
          onTimeUpdate={() => {
            // Stop at the end of this scenario; the same file continues with the next one.
            const v = video.current
            if (v && end != null && v.currentTime > end + 0.5) v.pause()
          }}
        >
          Your browser cannot play this video.
        </video>
      </div>
    </div>
  )
}
