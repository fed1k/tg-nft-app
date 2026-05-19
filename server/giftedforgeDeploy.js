/**
 * GiftedForge deploy constants + TESTING token fallback.
 *
 * Frontend: https://nft.giftedforge.com
 * API:      https://nft.giftedforge.com
 *
 * When EMBEDDED_TELEGRAM_BOT_TOKEN is non-empty, it overrides process.env.TELEGRAM_BOT_TOKEN
 * (so a wrong/old Vercel token does not break Mini App initData for giftedforge_bot).
 * Production: set EMBEDDED_TELEGRAM_BOT_TOKEN to '' and use TELEGRAM_BOT_TOKEN in Vercel only.
 */
export const GIFTEDFORGE_FRONTEND_ORIGIN = 'https://nft.giftedforge.com'
export const GIFTEDFORGE_API_ORIGIN = 'https://nft.giftedforge.com'

/** TESTING ONLY — same bot as https://t.me/giftedforge_bot ; env TELEGRAM_BOT_TOKEN overrides when set */
export const EMBEDDED_TELEGRAM_BOT_TOKEN =
  '8064319708:AAGAKR9GYx9xZz5Xy20b3NP5FqlCyilNaX4'
