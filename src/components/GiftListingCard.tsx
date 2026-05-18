import React, { useState } from 'react'
import GiftMarketBuyModal, { type GiftListingActorPayload } from './GiftMarketBuyModal'
import type { GiftMarketListing } from '../services/user/client'

import type { TelegramWebApp } from '../contexts/TelegramContext'

type MiniAppHooks = Partial<Pick<TelegramWebApp, 'HapticFeedback' | 'showAlert'>>

type Props = {
  listing: GiftMarketListing
  initData: string
  usernameForApi: string
  walletForProfile: string
  actorPayload: GiftListingActorPayload
  starsAvailable: number
  canBuy: boolean
  isOwnListing?: boolean
  webApp?: MiniAppHooks
  onBought: () => void
}

const GiftListingCard: React.FC<Props> = ({
  listing,
  initData,
  usernameForApi,
  walletForProfile,
  actorPayload,
  starsAvailable,
  canBuy,
  isOwnListing,
  webApp,
  onBought,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pricing =
    listing.pricing === 'ton' || listing.pricing === 'stars' ? listing.pricing : listing.priceTon > 0 ? 'ton' : 'stars'

  const priceLabel =
    pricing === 'ton' ? `${Number(listing.priceTon).toFixed(4)} TON` : `${listing.priceStars.toLocaleString()} ★`

  return (
    <>
      <div className="border relative max-w-[166px] border-[#666F8B33] rounded-3xl px-2 pt-2 pb-5 bg-[#6B6AFD0D]">
        {/* Decorative overlay matching NftCard */}
        <div className="bg-[#0E06361A] h-[107px] w-[150px] absolute z-10 rounded-2xl pointer-events-none"></div>

        {/* Emoji "Image" matching NftCard layout */}
        <div
          className="w-full h-[107px] rounded-2xl cursor-pointer bg-[E9EAF3] flex items-center justify-center text-4xl"
          onClick={() => setConfirmOpen(true)}
        >
          {listing.emoji || '🎁'}
        </div>

        {isOwnListing && (
          <span className="absolute z-50 left-2 top-2 text-[8px] font-semibold bg-[#6B6AFD] text-white px-1.5 py-0.5 rounded">
            Your listing
          </span>
        )}

        {!initData && !isOwnListing && (
          <span className="absolute z-50 right-2 top-2 text-[8px] font-semibold bg-[#0E0636] text-white px-1.5 py-0.5 rounded">
            TG Only
          </span>
        )}

        <p
          className="pt-4 pb-2 text-xs font-medium text-[#0E0636] cursor-pointer line-clamp-1"
          onClick={() => setConfirmOpen(true)}
        >
          {listing.label || 'Gift'}
        </p>

        <div className="flex items-center justify-between pb-4">
          <p className="font-light text-[10px] text-[#0E0636] line-clamp-1">
            {listing.sellerUsername || `tg:${listing.sellerTelegramId}`}
          </p>
          <p className="font-semibold text-[#6B6AFD] text-[10px] shrink-0">{priceLabel}</p>
        </div>

        <button
          type="button"
          disabled={!canBuy && !isOwnListing && !!initData}
          onClick={() => setConfirmOpen(true)}
          className="border h-[25px] text-[10px] text-[#6B6AFD] font-semibold border-[#6B6AFD] bg-white w-full rounded-lg hover:bg-[#6B6AFD] hover:text-white transition-colors disabled:opacity-40"
        >
          {isOwnListing ? 'Your Listing' : !initData ? 'Open in TG' : 'Buy Now'}
        </button>
      </div>

      <GiftMarketBuyModal
        listing={listing}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        initData={initData}
        usernameForApi={usernameForApi}
        walletForProfile={walletForProfile}
        actorPayload={actorPayload}
        starsAvailable={starsAvailable}
        webApp={webApp}
        onSuccess={onBought}
      />
    </>
  )
}

export default GiftListingCard
