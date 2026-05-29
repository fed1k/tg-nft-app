import { useEffect, useState } from 'react'
import { userClient } from '../services/user'

export interface GiftStickerThumbProps {
  initData: string
  fileId?: string | null
  emoji: string
  className?: string
}

export function GiftStickerThumb({
  initData,
  fileId,
  emoji,
  className = "text-[2.75rem] leading-none select-none drop-shadow-sm",
}: GiftStickerThumbProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [showEmoji, setShowEmoji] = useState(!fileId)

  useEffect(() => {
    if (!fileId) {
      setObjectUrl(null)
      setShowEmoji(true)
      return
    }
    setShowEmoji(false)
    setObjectUrl(null)
    let alive = true
    let blobUrl: string | null = null
    void userClient
      .fetchTelegramGiftStickerPreview({ initData, fileId })
      .then((blob) => {
        if (!alive) return
        blobUrl = URL.createObjectURL(blob)
        setObjectUrl(blobUrl)
      })
      .catch(() => {
        if (alive) setShowEmoji(true)
      })
    return () => {
      alive = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [initData, fileId])

  if (showEmoji || !objectUrl) {
    return (
      <span className={className} aria-hidden>
        {emoji}
      </span>
    )
  }
  return (
    <img
      src={objectUrl}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="max-h-[78%] max-w-[88%] w-auto h-auto object-contain drop-shadow-md"
      onError={() => {
        setShowEmoji(true)
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      }}
    />
  )
}
