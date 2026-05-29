import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTelegram } from '../contexts/TelegramContext'
import { GiftStickerThumb } from '../components/GiftStickerThumb'
import { giftCardSurfaceStyle } from '../utils/giftVisuals'
import { sellGiftOnMarketplace, userClient } from '../services/user'
import type { TelegramAvailableGift, TelegramOwnedGift } from '../services/user/client'

const Gifts = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const sellSectionRef = useRef<HTMLElement | null>(null)
  const { isInTelegram, initData, user, webApp } = useTelegram()
  const queryClient = useQueryClient()
  const [recipientId, setRecipientId] = useState('')
  const [message, setMessage] = useState('')
  const [selectedGiftId, setSelectedGiftId] = useState('')
  const [listingPriceByOwnedId, setListingPriceByOwnedId] = useState<Record<string, string>>({})
  const [listingTonByOwnedId, setListingTonByOwnedId] = useState<Record<string, string>>({})
  const [listingCurrency, setListingCurrency] = useState<'stars' | 'ton'>('ton')
  const [listingBusyId, setListingBusyId] = useState<string | null>(null)
  const [listingMsg, setListingMsg] = useState('')

  const canQuery = isInTelegram && !!initData

  const listQuery = useQuery({
    queryKey: ['telegram-gifts', user?.id],
    enabled: canQuery,
    queryFn: () =>
      userClient.listTelegramGifts({
        initData,
        limit: 100,
      }),
  })

  const availableQuery = useQuery({
    queryKey: ['telegram-gifts-available', user?.id],
    enabled: canQuery,
    queryFn: () => userClient.getTelegramAvailableGifts({ initData }),
  })

  const platformSettingsQuery = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => userClient.getPlatformSettings(),
    staleTime: 60_000,
  })

  const myGiftListingsQuery = useQuery({
    queryKey: ['my-gift-listings', user?.id],
    enabled: canQuery,
    queryFn: () => userClient.getMyGiftMarketListings({ initData }),
  })

  const sendMutation = useMutation({
    mutationFn: () => {
      const rid = Number.parseInt(recipientId.trim(), 10)
      if (!Number.isFinite(rid) || rid <= 0) {
        return Promise.reject(new Error('Enter the recipient numeric Telegram user id.'))
      }
      if (!selectedGiftId) {
        return Promise.reject(new Error('Choose a gift to send.'))
      }
      return userClient.sendTelegramGift({
        initData,
        giftId: selectedGiftId,
        recipientUserId: rid,
        text: message.trim() || undefined,
      })
    },
    onSuccess: () => {
      webApp?.HapticFeedback?.notificationOccurred?.('success')
      setRecipientId('')
      setMessage('')
      void queryClient.invalidateQueries({ queryKey: ['telegram-gifts'] })
      void queryClient.invalidateQueries({ queryKey: ['user-home'] })
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
    },
    onError: () => {
      webApp?.HapticFeedback?.notificationOccurred?.('error')
    },
  })

  const createGiftListingMutation = useMutation({
    mutationFn: (
      vars:
        | { ownedGiftId: string; pricing: 'stars'; priceStars: number }
        | { ownedGiftId: string; pricing: 'ton'; priceTon: number },
    ) =>
      sellGiftOnMarketplace({
        initData,
        ownedGiftId: vars.ownedGiftId,
        ...(vars.pricing === 'stars'
          ? { pricing: 'stars', priceStars: vars.priceStars }
          : { pricing: 'ton', priceTon: vars.priceTon }),
      }),
    onSuccess: () => {
      webApp?.HapticFeedback?.notificationOccurred?.('success')
      setListingMsg('')
      void queryClient.invalidateQueries({ queryKey: ['my-gift-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['gift-market-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['user-home'] })
    },
    onError: (e: Error) => {
      webApp?.HapticFeedback?.notificationOccurred?.('error')
      setListingMsg(e?.message || 'Could not create listing.')
    },
  })

  const cancelGiftListingMutation = useMutation({
    mutationFn: (listingId: string) =>
      userClient.cancelGiftMarketListing({ initData, listingId }),
    onSuccess: () => {
      webApp?.HapticFeedback?.notificationOccurred?.('success')
      void queryClient.invalidateQueries({ queryKey: ['my-gift-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['gift-market-listings'] })
    },
    onError: () => {
      webApp?.HapticFeedback?.notificationOccurred?.('error')
    },
  })

  const gifts = listQuery.data?.gifts ?? []
  const catalog: TelegramAvailableGift[] = availableQuery.data?.gifts ?? []

  const selectedMeta = useMemo(
    () => catalog.find((g) => g.id === selectedGiftId),
    [catalog, selectedGiftId],
  )

  const feePercent = Math.max(0, Number(platformSettingsQuery.data?.platformFeePercent ?? 0))

  const catalogByGiftId = useMemo(() => {
    const m = new Map<string, TelegramAvailableGift>()
    for (const g of catalog) m.set(g.id, g)
    return m
  }, [catalog])

  const activeListedOwnedIds = useMemo(() => {
    const s = new Set<string>()
    for (const row of myGiftListingsQuery.data?.listings ?? []) {
      if (row.status === 'Active' && row.ownedGiftId) s.add(row.ownedGiftId)
    }
    return s
  }, [myGiftListingsQuery.data?.listings])

  const sellableRegularGifts = useMemo(
    () =>
      gifts.filter((g): g is TelegramOwnedGift & { kind: 'regular'; ownedGiftId: string } => {
        if (g.kind !== 'regular') return false
        if (!g.ownedGiftId || g.wasRefunded) return false
        return true
      }),
    [gifts],
  )

  useEffect(() => {
    if (searchParams.get('sell') !== '1') return
    const t = window.setTimeout(() => {
      sellSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const next = new URLSearchParams(searchParams)
      next.delete('sell')
      setSearchParams(next, { replace: true })
    }, 350)
    return () => window.clearTimeout(t)
  }, [searchParams, setSearchParams])

  if (!isInTelegram) {
    return (
      <div className="px-3 pb-28">
        <p className="text-sm text-[#666F8B] leading-relaxed">
          Telegram gifts load inside the official Telegram client. Open GiftedForge as a Mini App from your bot to see
          gifts you own and to send gifts through the platform.
        </p>
      </div>
    )
  }

  if (!initData) {
    return (
      <div className="px-3 pb-28">
        <p className="text-sm text-[#666F8B] leading-relaxed">
          Missing signed session data from Telegram. Update Telegram and reopen this Mini App from the bot menu.
        </p>
      </div>
    )
  }

  return (
    <div className="px-3 pb-28 space-y-8">
      <p className="text-xs text-[#666F8B] leading-relaxed border-b border-[#0E06361A] pb-3">
        GiftedForge reads your Telegram gifts with Telegram&apos;s API. You can send gifts using your in-app Stars
        balance, list regular gifts on the Marketplace (Market → Gifts tab), or buy others&apos; listings — platform
        commission matches NFT / StarGifts sales. Recipients for direct sends need a numeric user id (e.g. from
        @userinfobot).
      </p>

      {/* My gifts */}
      <section>
        <h2 className="font-semibold text-lg text-[#0E0636] pb-3">Your Telegram gifts</h2>
        {listQuery.isLoading ? (
          <p className="text-sm text-[#666F8B]">Loading gifts…</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-[#DA0909]">{(listQuery.error as Error)?.message || 'Could not load gifts.'}</p>
        ) : gifts.length === 0 ? (
          <p className="text-sm text-[#666F8B]">
            No gifts to show yet
            {listQuery.data?.total_count != null ? ` (${listQuery.data.total_count} from Telegram).` : '.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {gifts.map((g: TelegramOwnedGift, idx: number) => (
              <li
                key={`${g.kind}-${(g as { ownedGiftId?: string }).ownedGiftId ?? (g as { giftId?: string }).giftId ?? idx}`}
                className="rounded-2xl bg-[#F5F7FB] px-4 py-3 flex gap-3 items-start"
              >
                <span className="text-2xl shrink-0" aria-hidden>
                  {g.kind === 'unknown' ? '🎁' : 'emoji' in g ? g.emoji : '🎁'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[#0E0636] truncate">{giftTitle(g)}</p>
                  <p className="text-xs text-[#666F8B]">{giftSubtitle(g)}</p>
                  <p className="text-[10px] text-[#666F8B] pt-1">{formatSendDate(g.kind !== 'unknown' ? g.sendDate : undefined)}</p>
                  {g.kind === 'regular' && g.wasRefunded ? (
                    <p className="text-[10px] text-amber-700 pt-1">Refunded / no longer available</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* My gift marketplace listings */}
      <section className="rounded-3xl border border-[#0E06361A] p-4 space-y-3">
        <h2 className="font-semibold text-lg text-[#0E0636]">My gift listings</h2>
        {myGiftListingsQuery.isLoading ? (
          <p className="text-sm text-[#666F8B]">Loading your listings…</p>
        ) : myGiftListingsQuery.isError ? (
          <p className="text-sm text-[#DA0909]">
            {(myGiftListingsQuery.error as Error)?.message || 'Could not load listings.'}
          </p>
        ) : !(myGiftListingsQuery.data?.listings ?? []).length ? (
          <p className="text-sm text-[#666F8B]">You don&apos;t have any gift listings yet.</p>
        ) : (
          <ul className="space-y-2">
            {(myGiftListingsQuery.data?.listings ?? []).map((row) => (
              <li
                key={row.id}
                className="rounded-2xl bg-[#F5F7FB] px-3 py-2.5 flex flex-wrap items-center gap-2 justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden>
                    {row.emoji || '🎁'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0E0636] truncate">{row.label}</p>
                    <p className="text-[10px] text-[#666F8B]">
                      {(row.pricing === 'ton' || row.priceTon > 0
                        ? `${Number(row.priceTon).toFixed(4)} TON`
                        : `${row.priceStars.toLocaleString()} ★`)}{' '}
                      · {row.status}
                    </p>
                  </div>
                </div>
                {row.status === 'Active' ? (
                  <button
                    type="button"
                    disabled={cancelGiftListingMutation.isPending}
                    onClick={() => cancelGiftListingMutation.mutate(row.id)}
                    className="text-xs font-semibold text-[#DA0909] border border-[#DA090933] rounded-xl px-3 py-1.5 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* List gifts for marketplace */}
      <section
        ref={sellSectionRef}
        id="sell-gifts-marketplace"
        className="rounded-3xl border border-[#0E06361A] p-4 space-y-3 scroll-mt-4"
      >
        <h2 className="font-semibold text-lg text-[#0E0636]">Sell on marketplace</h2>

        <div className="flex rounded-2xl border border-[#0E06361A] p-0.5 bg-white">
          <button
            type="button"
            onClick={() => setListingCurrency('ton')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${
              listingCurrency === 'ton' ? 'bg-[#0E0636] text-white' : 'text-[#666F8B]'
            }`}
          >
            Price in TON
          </button>
          <button
            type="button"
            onClick={() => setListingCurrency('stars')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${
              listingCurrency === 'stars' ? 'bg-[#0E0636] text-white' : 'text-[#666F8B]'
            }`}
          >
            Price in Stars
          </button>
        </div>

        <p className="text-xs text-[#666F8B] leading-relaxed">
          {listingCurrency === 'ton' ? (
            <>
              Set an asking price in TON. Buyers pay your connected TON wallet + platform fee (same split as NFT
              purchases). Telegram still charges Stars to deliver — buyers must hold enough GiftedForge Stars for that
              step.
            </>
          ) : (
            <>
              Minimum Stars price covers Telegram send cost plus ~{feePercent}% platform fee (seller net ≥ 1 ★).
            </>
          )}
        </p>
        <p className="text-xs text-[#0E0636] font-medium pt-1">
          Choose a gift → set price → <strong>List for sale</strong> → listings appear under <strong>Market → Gifts</strong>.
        </p>
        {listingMsg ? <p className="text-sm text-[#DA0909]">{listingMsg}</p> : null}
        {platformSettingsQuery.isError ? (
          <p className="text-xs text-amber-800">Could not load fee settings; minimum price hints may be off.</p>
        ) : null}
        {listQuery.isLoading ? (
          <p className="text-sm text-[#666F8B]">Loading gifts…</p>
        ) : sellableRegularGifts.length === 0 ? (
          <p className="text-sm text-[#666F8B] leading-relaxed">
            {gifts.some((g) => g.kind === 'regular') ? (
              <>
                You have regular gifts above, but none can be listed right now (missing gift catalog id, refunded, or
                unique-only). Pull to refresh after updating the app.
              </>
            ) : gifts.some((g) => g.kind === 'unique') ? (
              <>
                Unique / collectible Telegram gifts cannot be sold on this marketplace yet — only{' '}
                <strong>regular</strong> gifts (the standard star gifts).
              </>
            ) : (
              <>No listable regular gifts in your inventory yet.</>
            )}
          </p>
        ) : (
          <ul className="space-y-3">
            {sellableRegularGifts.map((g) => {
              const gid = g.giftId ? String(g.giftId) : ''
              const cat = gid ? catalogByGiftId.get(gid) : undefined
              const telegramCost = Math.max(0, Number(cat?.star_count ?? g.starCount ?? 0))
              const minP = minListingPriceStars(telegramCost, feePercent)
              const ownedId = g.ownedGiftId
              const listedHere = activeListedOwnedIds.has(ownedId)
              const draft = listingPriceByOwnedId[ownedId]
              const priceVal = Math.max(minP, Math.floor(Number.parseInt(draft || String(minP), 10) || minP))
              return (
                <li key={ownedId} className="rounded-2xl bg-[#F5F7FB] p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="text-2xl shrink-0" aria-hidden>
                      {g.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0E0636]">{giftTitle(g)}</p>
                      <p className="text-[10px] text-[#666F8B]">
                        {listingCurrency === 'stars' ? (
                          <>
                            Telegram send ≈ {telegramCost} ★ · min. list {minP} ★{' '}
                          </>
                        ) : (
                          <>TON listing · Telegram delivery billed in Stars (~{telegramCost} ★) · min 0.001 TON</>
                        )}
                        {gid ? '' : ' · (missing gift id)'}
                      </p>
                    </div>
                  </div>
                  {listedHere ? (
                    <p className="text-xs text-[#666F8B]">Already listed (see above). Cancel there to change price.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 items-center">
                      {listingCurrency === 'stars' ? (
                        <>
                          <label className="text-[10px] font-medium text-[#0E0636] shrink-0">Price (Stars)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-24 rounded-lg border border-[#0E06361A] bg-white px-2 py-1.5 text-sm text-[#0E0636]"
                            value={draft ?? String(minP)}
                            onChange={(e) =>
                              setListingPriceByOwnedId((prev) => ({
                                ...prev,
                                [ownedId]: e.target.value.replace(/\D/g, ''),
                              }))
                            }
                          />
                        </>
                      ) : (
                        <>
                          <label className="text-[10px] font-medium text-[#0E0636] shrink-0">Price (TON)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.050"
                            className="w-28 rounded-lg border border-[#0E06361A] bg-white px-2 py-1.5 text-sm text-[#0E0636]"
                            value={listingTonByOwnedId[ownedId] ?? ''}
                            onChange={(e) =>
                              setListingTonByOwnedId((prev) => ({
                                ...prev,
                                [ownedId]: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'),
                              }))
                            }
                          />
                        </>
                      )}
                      <button
                        type="button"
                        disabled={
                          !gid ||
                          createGiftListingMutation.isPending ||
                          listingBusyId === ownedId ||
                          cancelGiftListingMutation.isPending
                        }
                        onClick={() => {
                          setListingMsg('')
                          if (listingCurrency === 'stars') {
                            setListingBusyId(ownedId)
                            createGiftListingMutation.mutate(
                              { ownedGiftId: ownedId, pricing: 'stars', priceStars: priceVal },
                              { onSettled: () => setListingBusyId(null) },
                            )
                            return
                          }
                          const raw = listingTonByOwnedId[ownedId]?.trim() || ''
                          const ton = Number.parseFloat(raw)
                          if (!Number.isFinite(ton) || ton < 0.001) {
                            setListingMsg('Enter TON ≥ 0.001')
                            return
                          }
                          setListingBusyId(ownedId)
                          createGiftListingMutation.mutate(
                            { ownedGiftId: ownedId, pricing: 'ton', priceTon: ton },
                            { onSettled: () => setListingBusyId(null) },
                          )
                        }}
                        className="text-xs font-semibold bg-[#0E0636] text-white rounded-xl px-3 py-2 disabled:opacity-40"
                      >
                        {listingBusyId === ownedId && createGiftListingMutation.isPending ? 'Listing…' : 'List for sale'}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Send */}
      <section className="rounded-3xl bg-[#6B6AFD0D] p-4 space-y-3">
        <h2 className="font-semibold text-lg text-[#0E0636]">Send a gift</h2>
        {availableQuery.isLoading ? (
          <p className="text-sm text-[#666F8B]">Loading gift catalog…</p>
        ) : availableQuery.isError ? (
          <p className="text-sm text-[#DA0909]">{(availableQuery.error as Error)?.message || 'Catalog unavailable.'}</p>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-[#666F8B]">No sendable gifts are configured for this bot in Telegram.</p>
        ) : (
          <>
            <p className="text-xs text-[#666F8B] pb-1">Tap a gift — price is in Stars (same as Telegram).</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {catalog.map((g) => {
                const selected = g.id === selectedGiftId
                const low =
                  g.personal_remaining_count != null &&
                  Number.isFinite(g.personal_remaining_count) &&
                  g.personal_remaining_count <= 3
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedGiftId(g.id)}
                    className={[
                      'relative flex flex-col items-center justify-between rounded-2xl overflow-hidden min-h-[118px] p-1.5 pt-2 pb-2',
                      'border-2 transition-transform active:scale-[0.97]',
                      selected ? 'border-[#6B6AFD] ring-2 ring-[#6B6AFD]/35 shadow-md' : 'border-white/25 shadow-sm',
                    ].join(' ')}
                    style={giftCardSurfaceStyle(g.background ?? null)}
                  >
                    {low ? (
                      <span className="absolute top-1 right-1 rounded-md bg-black/25 text-[9px] text-white px-1 py-0.5 font-medium">
                        {g.personal_remaining_count} left
                      </span>
                    ) : null}
                    <div className="flex flex-1 w-full items-center justify-center min-h-[64px]">
                      <GiftStickerThumb initData={initData} fileId={g.preview_file_id} emoji={g.emoji} />
                    </div>
                    <div
                      className="mt-1 flex items-center justify-center gap-0.5 rounded-full bg-black/22 backdrop-blur-sm px-2 py-1 text-[11px] font-semibold tabular-nums w-full max-w-[100px]"
                      style={g.background?.text ? { color: g.background.text } : { color: '#fff' }}
                    >
                      <span className="opacity-95" aria-hidden>
                        ⭐
                      </span>
                      {g.star_count}
                    </div>
                  </button>
                )
              })}
            </div>
            {!selectedGiftId ? (
              <p className="text-[11px] text-[#666F8B] pt-1">Select a gift above to enable sending.</p>
            ) : null}
            {selectedMeta ? (
              <p className="text-xs text-[#666F8B] pt-1">
                Selected: {selectedMeta.star_count} Stars (deducted from your GiftedForge Stars; Telegram bills the
                bot).
              </p>
            ) : null}

            <label className="block text-xs font-medium text-[#0E0636] pt-2">Recipient Telegram user id</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 123456789"
              className="w-full rounded-xl border border-[#0E06361A] bg-white px-3 py-2 text-sm text-[#0E0636]"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value.replace(/\D/g, ''))}
            />

            <label className="block text-xs font-medium text-[#0E0636] pt-2">Short message (optional)</label>
            <input
              type="text"
              maxLength={128}
              placeholder="Shown with the gift in Telegram"
              className="w-full rounded-xl border border-[#0E06361A] bg-white px-3 py-2 text-sm text-[#0E0636]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            {sendMutation.isError ? (
              <p className="text-sm text-[#DA0909]">{(sendMutation.error as Error)?.message}</p>
            ) : null}
            {sendMutation.isSuccess ? (
              <p className="text-sm text-emerald-700">Gift sent. Stars balance: {sendMutation.data.starsRemaining}</p>
            ) : null}

            <button
              type="button"
              disabled={sendMutation.isPending}
              onClick={() => {
                sendMutation.reset()
                sendMutation.mutate()
              }}
              className="w-full mt-2 rounded-2xl bg-[#6B6AFD] text-white font-semibold py-3 text-sm disabled:opacity-50"
            >
              {sendMutation.isPending ? 'Sending…' : 'Send gift'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}

export default Gifts
