import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'

export interface LightboxImage {
  src: string
  caption: string
}

/** Full-screen screenshot viewer with previous/next (arrow keys) and Escape to close. */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: LightboxImage[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const go = useCallback(
    (delta: number) => onIndex((index + delta + images.length) % images.length),
    [index, images.length, onIndex],
  )

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const image = images[index]
  if (!image) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4"
      onClick={onClose}
    >
      <div className="flex items-center justify-between text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span>
          {index + 1} / {images.length} · {image.caption}
        </span>
        <Button ref={closeRef} variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="size-5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => go(-1)} aria-label="Previous screenshot">
            <ChevronLeft className="size-6" />
          </Button>
        )}
        <img src={image.src} alt={image.caption} className="max-h-full max-w-full rounded-md object-contain" />
        {images.length > 1 && (
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => go(1)} aria-label="Next screenshot">
            <ChevronRight className="size-6" />
          </Button>
        )}
      </div>
    </div>
  )
}
