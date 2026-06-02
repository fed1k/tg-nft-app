import type { TelegramGiftCardBackground, TelegramOwnedGift } from '../services/user/client'

export function giftCardSurfaceStyle(bg: TelegramGiftCardBackground | null | undefined): React.CSSProperties {
  if (bg?.center && bg?.edge) {
    return {
      background: `linear-gradient(155deg, ${bg.edge} 0%, ${bg.center} 48%, ${bg.edge} 100%)`,
    }
  }
  return {
    background: 'linear-gradient(155deg, #d4c4ff 0%, #8b83f5 42%, #5b52e0 100%)',
  }
}

/** Returns a user-friendly title for a Telegram gift. */
export function giftTitle(g: TelegramOwnedGift): string {
  if (g.kind === 'regular') {
    return 'Regular Gift'
  }
  if (g.kind === 'unique') {
    if (g.name) return g.name
    const base = g.baseName || 'Unique Gift'
    return g.number ? `${base} #${g.number}` : base
  }
  return 'Telegram Gift'
}

/** Returns a subtitle indicating the sender or type. */
export function giftSubtitle(g: TelegramOwnedGift): string {
  if (g.kind === 'unknown') return 'Unknown Type'
  if (g.senderUser) {
    const name = g.senderUser.first_name || g.senderUser.username || String(g.senderUser.id)
    return `From ${name}`
  }
  return 'Gift'
}

/** Formats a Unix timestamp (seconds) into a readable string. */
export function formatSendDate(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Calculates the minimum Stars listing price such that the seller
 * nets at least the Telegram delivery cost + 1 Star.
 */
export function minListingPriceStars(telegramCost: number, platformFeePercent: number): number {
  if (platformFeePercent >= 100) return telegramCost + 1
  const minNet = telegramCost + 1
  // Seller receives: Price * (1 - fee/100)
  // Price = minNet / (1 - fee/100)
  const price = Math.ceil(minNet / (1 - platformFeePercent / 100))
  return Math.max(price, telegramCost + 1)
}
