/**
 * GiftedForge production deploy (public URLs only — no bot token).
 * Env vars still override when set (VITE_APP_URL, VITE_TELEGRAM_APP_URL, VITE_*_API_URL).
 *
 * Frontend: https://nft.giftedforge.com
 * API:      https://nft.giftedforge.com
 */
export const GIFTEDFORGE_DEPLOY = {
  frontendOrigin: 'https://nft.giftedforge.com',
  backendOrigin: 'https://nft.giftedforge.com',
  /** TON Connect return / deep link — same bot as Mini App */
  telegramMiniAppUrl: 'https://t.me/giftedforge_bot/giftedforge',
} as const
