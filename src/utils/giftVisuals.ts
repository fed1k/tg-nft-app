import type { TelegramGiftCardBackground } from '../services/user/client'

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
