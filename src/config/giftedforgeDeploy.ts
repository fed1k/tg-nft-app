/**
 * GiftedForge production deploy (public URLs only — no bot token).
 * Env vars still override when set (VITE_APP_URL, VITE_TELEGRAM_APP_URL, VITE_*_API_URL).
 *
 * Frontend: https://tg-nft-ui.vercel.app
 * API:      https://tg-nft-ui-wrml.vercel.app
 */
export const GIFTEDFORGE_DEPLOY = {
  frontendOrigin: 'https://tg-nft-ui.vercel.app',
  backendOrigin: 'https://tg-nft-ui-wrml.vercel.app',
  /** TON Connect return / deep link — same bot as Mini App */
  telegramMiniAppUrl: 'https://t.me/giftedforge_bot/giftedforge',
} as const
