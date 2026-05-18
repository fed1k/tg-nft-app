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
      <div className="rounded-2xl border border-[#0E06361A] bg-[#F5F7FB] p-3 flex flex-col gap-2 min-h-[148px]">
        <div className="flex items-start gap-2">
          <span className="text-3xl shrink-0" aria-hidden>
            {listing.emoji || '🎁'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#6B6AFD]">
              {pricing === 'ton' ? 'TON checkout' : 'Stars checkout'}
            </p>
            <p className="text-sm font-semibold text-[#0E0636] line-clamp-2">{listing.label || 'Gift'}</p>
            <p className="text-[10px] text-[#666F8B] pt-0.5">
              Seller {listing.sellerUsername || `tg:${listing.sellerTelegramId}`}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 mt-auto gap-2 flex-wrap">
          <p className="text-sm font-bold text-[#6B6AFD] tabular-nums">{priceLabel}</p>
          {isOwnListing ? (
            <span className="text-[10px] font-medium text-[#666F8B] shrink-0">Your listing</span>
          ) : !initData ? (
            <span className="text-[10px] font-medium text-[#666F8B] text-right leading-tight shrink-0">
              Open in Telegram to buy
            </span>
          ) : (
            <button
              type="button"
              disabled={!canBuy}
              onClick={() => setConfirmOpen(true)}
              className="text-xs font-semibold bg-[#6B6AFD] text-white rounded-xl px-3 py-2 disabled:opacity-40 shrink-0"
            >
              Buy
            </button>
          )}
        </div>
        <p className="text-[9px] text-[#666F8B] leading-snug">
          {pricing === 'ton'
            ? 'Buyer pays seller + platform in crypto (TON or EVM, matching seller wallet), then Telegram delivers this gift type to their profile.'
            : 'Buyer pays Stars; platform fee matches NFT sales; seller settles in Stars after Telegram quota.'}
        </p>
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
