import type { AdminAsset, AdminTransaction } from '../admin'
import { GIFTEDFORGE_DEPLOY } from '../../config/giftedforgeDeploy'
import { UserApiError } from './errors'

export { UserApiError, isAccountBlockedError } from './errors'
export type { AccountBlockCode } from './errors'

export interface UserHomeStats {
  nftsOwned: number
  activeListings: number
  stars: number
}

export interface UserProfileStats extends UserHomeStats {
  referralCode?: string
  referral?: {
    totalEarnedUsd: number
    referrals: number
    pendingUsd: number
  }
}

export interface UserHomeResponse {
  stats: UserHomeStats
  collection: AdminAsset[]
  recentActivity: AdminTransaction[]
}

export interface UserAssetDetailResponse {
  asset: AdminAsset
  /** Present when asset fetch included Telegram/user identifiers */
  viewerOwned?: boolean
}

export interface UserPlatformSettings {
  platformFeePercent: number
  feeReceiverWalletAddress: string
  collectionAddress: string
}

export interface UserOfferItem {
  id: string
  title: string
  /** Present on offers created after assetId was stored on the transaction. */
  assetId?: string
  amount: string
  timeLabel: string
  fromUser: string
  toUser: string
  direction: 'sent' | 'received'
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Cancelled'
}

export interface TelegramGiftSender {
  id: number
  first_name?: string
  username?: string
}

export interface TelegramOwnedGiftRegular {
  kind: 'regular'
  ownedGiftId?: string
  giftId?: string
  sendDate?: number
  senderUser?: TelegramGiftSender
  text?: string
  emoji: string
  starCount?: number
  canBeUpgraded?: boolean
  wasRefunded?: boolean
}

export interface TelegramOwnedGiftUnique {
  kind: 'unique'
  ownedGiftId?: string
  giftId?: string
  baseName?: string
  name?: string
  number?: number
  sendDate?: number
  senderUser?: TelegramGiftSender
  emoji: string
  canBeTransferred?: boolean
  transferStarCount?: number
}

export interface TelegramOwnedGiftUnknown {
  kind: 'unknown'
  type?: string
  sendDate?: number
  emoji?: string
}

export type TelegramOwnedGift = TelegramOwnedGiftRegular | TelegramOwnedGiftUnique | TelegramOwnedGiftUnknown

export interface TelegramGiftsListResponse {
  total_count: number
  next_offset: string
  gifts: TelegramOwnedGift[]
}

export interface TelegramGiftCardBackground {
  center: string
  edge: string
  text: string
}

export interface TelegramAvailableGift {
  id: string
  star_count: number
  emoji: string
  remaining_count?: number
  personal_remaining_count?: number
  upgrade_star_count?: number
  /** Resolved sticker thumbnail or static sticker file_id for `fetchTelegramGiftStickerPreview`. */
  preview_file_id?: string | null
  /** Telegram `Gift.background` as CSS hex colors (when API sends it). */
  background?: TelegramGiftCardBackground | null
}

export interface TelegramAvailableGiftsResponse {
  gifts: TelegramAvailableGift[]
}

/** Telegram gift resale listing (see marketplace Gifts tab). */
export interface GiftMarketListing {
  id: string
  sellerTelegramId: number
  sellerUsername: string
  /** Seller TON wallet when known (for crypto checkout). */
  sellerWalletAddress?: string
  giftId: string
  ownedGiftId: string
  giftKind: string
  emoji: string
  stickerFileId?: string
  background?: TelegramGiftCardBackground | null
  label: string
  telegramStarCost: number
  pricing: 'stars' | 'ton'
  priceStars: number
  priceTon: number
  status: string
  buyerTelegramId?: number
  buyerUsername?: string
  soldAt?: string
  createdAt?: string
}

export interface MintAssetPayload {
  title: string
  description?: string
  priceTon: number
  image?: string
  category?: '3D Art' | 'Collectibles' | 'Gaming'
  marketTab?: 'Explore' | 'StarGifts'
  txRef?: string
  tokenId?: string
  metadataUrl?: string
  telegramId?: number
  firstName?: string
  lastName?: string
  username?: string
  photoUrl?: string
  languageCode?: string
  walletAddress?: string
  walletType?: 'TON' | 'EVM'
}

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL || '').trim() ||
  `${GIFTEDFORGE_DEPLOY.backendOrigin}/api/admin`
const API_BASE =
  (import.meta.env.VITE_USER_API_URL || '').trim() ||
  `${GIFTEDFORGE_DEPLOY.backendOrigin}/api/user`
const ROOT_BASE = API_BASE.replace(/\/api\/user\/?$/, '')
const REQUEST_TIMEOUT_MS = 12000
const MINT_RESUME_TIMEOUT_MS = 25000

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  
  const initData = (window as any).Telegram?.WebApp?.initData || ''

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
        ...(init?.headers || {}),
      },
    })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err?.name === 'AbortError') {
      throw new Error('User API timeout. Check backend URL/CORS/server health.')
    }
    throw new Error(err?.message || 'Failed to connect to User API')
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const parsed = await parseJsonBody(res)
    throw new UserApiError(String(parsed?.message || `User API error ${res.status}`), {
      code: parsed?.code != null ? String(parsed.code) : undefined,
      userStatus: parsed?.status != null ? String(parsed.status) : undefined,
    })
  }
  return (await res.json()) as T
}

async function apiRoot<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  
  const initData = (window as any).Telegram?.WebApp?.initData || ''

  let res: Response
  try {
    res = await fetch(`${ROOT_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
        ...(init?.headers || {}),
      },
    })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err?.name === 'AbortError') {
      throw new Error('User API timeout. Check backend URL/CORS/server health.')
    }
    throw new Error(err?.message || 'Failed to connect to User API')
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    try {
      const parsed = JSON.parse(text)
      throw new Error(parsed?.message || `User API error ${res.status}`)
    } catch {
      throw new Error(text || `User API error ${res.status}`)
    }
  }
  return (await res.json()) as T
}

export const userClient = {
  syncSession: async (payload: {
    telegramId?: number
    firstName?: string
    lastName?: string
    username?: string
    photoUrl?: string
    languageCode?: string
    referralCode?: string
    walletAddress?: string
    walletType?: 'TON' | 'EVM'
  }) =>
    api<{ ok: boolean; user: unknown }>(`/session`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }),

  getHome: async (username?: string, telegramId?: number, walletAddress?: string) =>
    api<UserHomeResponse>(
      `/home?username=${encodeURIComponent(username || '')}&telegramId=${
        telegramId != null ? encodeURIComponent(String(telegramId)) : ''
      }&walletAddress=${encodeURIComponent(walletAddress || '')}`,
    ),

  getMarket: async (params: { tab: string; category: string; search: string; username?: string }) =>
    api<AdminAsset[]>(
      `/market?tab=${encodeURIComponent(params.tab)}&category=${encodeURIComponent(
        params.category,
      )}&search=${encodeURIComponent(params.search)}&username=${encodeURIComponent(params.username || '')}`,
    ),

  getGiftMarketListings: async (params: { search?: string }) => {
    const q = new URLSearchParams()
    if (params.search?.trim()) q.set('search', params.search.trim())
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return api<GiftMarketListing[]>(`/gift-listings${suffix}`)
  },

  getMyGiftMarketListings: async (payload: { initData: string }) =>
    api<{ listings: GiftMarketListing[] }>(`/gift-listings/mine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  createGiftMarketListing: async (
    payload: {
      initData: string
      ownedGiftId: string
      pricing: 'stars' | 'ton'
      priceStars?: number
      priceTon?: number
    },
  ) =>
    api<{ ok: boolean; listing: GiftMarketListing }>(`/gift-listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  cancelGiftMarketListing: async (payload: { initData: string; listingId: string }) =>
    api<{ ok: boolean; listing: GiftMarketListing }>(`/gift-listings/${encodeURIComponent(payload.listingId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: payload.initData }),
    }),

  buyGiftMarketListing: async (payload: {
    initData: string
    listingId: string
    paymentMethod: 'stars' | 'crypto'
    txRef?: string
    telegramId?: number
    firstName?: string
    lastName?: string
    username?: string
    photoUrl?: string
    languageCode?: string
    walletAddress?: string
    walletType?: 'TON' | 'EVM'
  }) =>
    api<{ ok: boolean; message: string; starsRemaining: number }>(
      `/gift-listings/${encodeURIComponent(payload.listingId)}/buy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: payload.initData,
          paymentMethod: payload.paymentMethod,
          txRef: payload.txRef,
          telegramId: payload.telegramId,
          firstName: payload.firstName,
          lastName: payload.lastName,
          username: payload.username,
          photoUrl: payload.photoUrl,
          languageCode: payload.languageCode,
          walletAddress: payload.walletAddress,
          walletType: payload.walletType,
        }),
      },
    ),

  getProfileStats: async (username?: string, telegramId?: number, walletAddress?: string) =>
    api<UserProfileStats>(
      `/profile?username=${encodeURIComponent(username || '')}&telegramId=${
        telegramId != null ? encodeURIComponent(String(telegramId)) : ''
      }&walletAddress=${encodeURIComponent(walletAddress || '')}`,
    ),

  getPlatformSettings: async () => api<UserPlatformSettings>(`/platform-settings`),

  getOffers: async (
    perspective: 'all' | 'sent' | 'received',
    username?: string,
    telegramId?: number,
    walletAddress?: string,
  ) =>
    api<UserOfferItem[]>(
      `/offers?perspective=${encodeURIComponent(perspective)}&username=${encodeURIComponent(
        username || '',
      )}&telegramId=${telegramId != null ? encodeURIComponent(String(telegramId)) : ''}&walletAddress=${encodeURIComponent(
        walletAddress || '',
      )}`,
    ),

  acceptOffer: async (id: string) =>
    api<{ ok: boolean; message: string }>(`/offers/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
    }),

  declineOffer: async (id: string) =>
    api<{ ok: boolean; message: string }>(`/offers/${encodeURIComponent(id)}/decline`, {
      method: 'POST',
    }),

  cancelOffer: async (id: string) =>
    api<{ ok: boolean; message: string }>(`/offers/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),

  createStarsTopupLink: async (payload: {
    amountStars: number
    telegramId?: number
    username?: string
    walletAddress?: string
  }) =>
    api<{ ok: boolean; link: string; payload?: string }>(`/stars/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** Stars → TON quote is recorded; Stars balance is deducted from app account (on-chain TON is separate). */
  swapStarsToTon: async (payload: {
    amountStars: number
    telegramId?: number
    username?: string
    walletAddress?: string
  }) =>
    api<{ ok: boolean; stars: number; tonOut: number; message?: string }>(`/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction: 'stars_to_ton',
        amount: payload.amountStars,
        telegramId: payload.telegramId,
        username: payload.username,
        walletAddress: payload.walletAddress,
      }),
    }),

  getAssetDetail: async (
    id: string,
    opts?: { username?: string; telegramId?: number; walletAddress?: string },
  ) => {
    const q =
      opts &&
      `?username=${encodeURIComponent(opts.username || '')}&telegramId=${
        opts.telegramId != null ? encodeURIComponent(String(opts.telegramId)) : ''
      }&walletAddress=${encodeURIComponent(opts.walletAddress || '')}`
    return api<UserAssetDetailResponse>(`/assets/${encodeURIComponent(id)}${q || ''}`)
  },

  transferNft: async (
    id: string,
    payload: {
      recipientTonAddress: string
      txRef: string
      telegramId?: number
      firstName?: string
      lastName?: string
      username?: string
      photoUrl?: string
      languageCode?: string
      walletAddress?: string
      walletType?: 'TON' | 'EVM'
    },
  ) =>
    api<{ ok: boolean; message: string }>(`/assets/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }),

  makeOffer: async (
    id: string,
    payload: {
      offerTon: number
      paymentMethod: 'crypto' | 'stars'
      telegramId?: number
      firstName?: string
      lastName?: string
      username?: string
      photoUrl?: string
      languageCode?: string
      walletAddress?: string
      walletType?: 'TON' | 'EVM'
    },
  ) =>
    api<{ ok: boolean; message: string }>(`/assets/${encodeURIComponent(id)}/offer`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }),

  buyNow: async (
    id: string,
    payload: {
      paymentMethod: 'crypto' | 'stars'
      txRef?: string
      telegramId?: number
      firstName?: string
      lastName?: string
      username?: string
      photoUrl?: string
      languageCode?: string
      walletAddress?: string
      walletType?: 'TON' | 'EVM'
    },
  ) =>
    api<{ ok: boolean; message: string }>(`/assets/${encodeURIComponent(id)}/buy`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }),

  mintAsset: async (payload: MintAssetPayload) =>
    api<{ ok: boolean; asset: AdminAsset; message: string }>(`/mint`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }),

  createPendingMint: async (payload: MintAssetPayload & { clientMintId: string; collectionAddress: string }) =>
    api<{ ok: boolean; clientMintId: string; status: string }>(`/mint/pending`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }),

  /** 200 = saved; 202 = still confirming on-chain (does not throw). */
  resumePendingMint: async (
    clientMintId: string,
    txRef?: string,
  ): Promise<
    | { ok: true; clientMintId?: string; status?: string; state?: string; asset?: AdminAsset }
    | {
        ok: false
        pending: true
        clientMintId?: string
        status?: string
        state?: string
        reason?: string
      }
    | { ok: false; pending?: false; message?: string }
  > => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MINT_RESUME_TIMEOUT_MS)
    const initData = (window as any).Telegram?.WebApp?.initData || ''
    let res: Response
    try {
      res = await fetch(`${API_BASE}/mint/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ clientMintId, txRef }),
        signal: controller.signal,
      })
    } catch (err: any) {
      clearTimeout(timeout)
      if (err?.name === 'AbortError') {
        throw new Error('User API timeout. Check backend URL/CORS/server health.')
      }
      throw new Error(err?.message || 'Failed to connect to User API')
    } finally {
      clearTimeout(timeout)
    }

    const parsed = await parseJsonBody(res)

    if (res.status === 202) {
      return {
        ok: false,
        pending: true,
        clientMintId: String(parsed.clientMintId || clientMintId),
        status: parsed.status as string | undefined,
        state: parsed.state as string | undefined,
        reason: parsed.reason as string | undefined,
      }
    }

    if (!res.ok) {
      throw new Error(String(parsed.message || `User API error ${res.status}`))
    }

    return {
      ok: true as const,
      clientMintId: parsed.clientMintId != null ? String(parsed.clientMintId) : undefined,
      status: typeof parsed.status === 'string' ? parsed.status : undefined,
      state: typeof parsed.state === 'string' ? parsed.state : undefined,
      asset: parsed.asset as AdminAsset | undefined,
    }
  },

  getAllNfts: async (params: { category: string; search: string }) =>
    apiRoot<AdminAsset[]>(
      `/api/nfts?category=${encodeURIComponent(params.category)}&search=${encodeURIComponent(params.search)}`,
    ),

  /** Telegram gifts owned by the signed-in Mini App user (requires initData from Telegram.WebApp). */
  listTelegramGifts: async (payload: { initData: string; offset?: string; limit?: number }) =>
    api<TelegramGiftsListResponse>(`/telegram-gifts/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** Gifts this bot is allowed to send (catalog for "send gift"). */
  getTelegramAvailableGifts: async (payload: { initData: string }) =>
    api<TelegramAvailableGiftsResponse>(`/telegram-gifts/available`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** Binary sticker/thumbnail image (WebP/JPEG). Requires initData; does not expose the bot token. */
  fetchTelegramGiftStickerPreview: async (payload: { initData: string; fileId: string }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${API_BASE}/telegram-gifts/sticker-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: payload.initData, fileId: payload.fileId }),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeout)
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error('Sticker preview timeout.')
      }
      throw new Error((err as Error)?.message || 'Sticker preview request failed')
    } finally {
      clearTimeout(timeout)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = text || `Preview error ${res.status}`
      try {
        const parsed = JSON.parse(text) as { message?: unknown }
        if (parsed?.message != null) msg = String(parsed.message)
      } catch {
        /* use msg as-is */
      }
      throw new Error(msg)
    }
    return res.blob()
  },

  /**
   * Sends a Telegram gift via the bot (Telegram charges the bot's Stars).
   * Deducts the same number of in-app Stars from the sender's GiftedForge balance when the gift has a star_count.
   */
  sendTelegramGift: async (payload: {
    initData: string
    giftId: string
    recipientUserId: number
    text?: string
  }) =>
    api<{ ok: boolean; starsRemaining: number }>(`/telegram-gifts/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: payload.initData,
        giftId: payload.giftId,
        recipientUserId: payload.recipientUserId,
        text: payload.text,
      }),
    }),
}

/**
 * List a regular Telegram gift for sale (`POST /api/user/gift-listings`).
 * Use `pricing: 'ton'` once the seller has connected a TON wallet — buyers pay on-chain like NFT checkout.
 */
export async function sellGiftOnMarketplace(
  params: { initData: string; ownedGiftId: string } & (
    | { pricing: 'stars'; priceStars: number }
    | { pricing: 'ton'; priceTon: number }
  ),
): Promise<{ ok: boolean; listing: GiftMarketListing }> {
  return userClient.createGiftMarketListing(params)
}
