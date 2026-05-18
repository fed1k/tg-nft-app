import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTonAddress, useTonWallet } from '@tonconnect/ui-react'
import { useAccount } from 'wagmi'
import NftCard from '../components/NftCard'
import GiftListingCard from '../components/GiftListingCard'
import { useTelegram } from '../contexts/TelegramContext'
import { userClient } from '../services/user'

const CATEGORIES = ["All Item's", '3D Art', 'Collectibles', 'Gaming']

const NFT_MARKET_TABS = ['Explore', 'StarGifts', "My Listing's"] as const

const Market = () => {
    const queryClient = useQueryClient()
    const { user, initData, isInTelegram, webApp } = useTelegram()
    const tonAddress = useTonAddress()
    const tonRawAddress = useTonAddress(false)
    const tonWallet = useTonWallet()
    const { address: evmAddress } = useAccount()

    const [activeTab, setActiveTab] = useState('Explore')
    const [activeCategory, setActiveCategory] = useState("All Item's")
    const [searchQuery, setSearchQuery] = useState('')
    const usernameForApi = user?.username ? `@${user.username}` : ''
    const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()

    const isGiftsTab = activeTab === 'Gifts'

    const actorPayload = useMemo(
        () => ({
            telegramId: user?.id,
            firstName: user?.first_name,
            lastName: user?.last_name,
            username: user?.username,
            photoUrl: user?.photo_url,
            languageCode: user?.language_code,
            walletAddress: walletForApi || undefined,
            walletType: tonWallet ? ('TON' as const) : evmAddress ? ('EVM' as const) : undefined,
        }),
        [
            user?.id,
            user?.first_name,
            user?.last_name,
            user?.username,
            user?.photo_url,
            user?.language_code,
            walletForApi,
            tonWallet,
            evmAddress,
        ],
    )

    const { data: giftBuyerProfile } = useQuery({
        queryKey: ['user-profile', usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () => userClient.getProfileStats(usernameForApi, user?.id, walletForApi || undefined),
        enabled: Boolean(isInTelegram && initData && user?.id && isGiftsTab),
        staleTime: 15_000,
    })

    const { data: filtered = [], isLoading, isError } = useQuery({
        queryKey: ['user-market', activeTab, activeCategory, searchQuery, usernameForApi],
        queryFn: () =>
            userClient.getMarket({
                tab: activeTab,
                category: activeCategory,
                search: searchQuery,
                username: usernameForApi,
            }),
        enabled: NFT_MARKET_TABS.includes(activeTab as (typeof NFT_MARKET_TABS)[number]),
        retry: 1,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: 8_000,
        refetchIntervalInBackground: false,
    })

    const {
        data: giftListings = [],
        isLoading: giftsLoading,
        isError: giftsError,
    } = useQuery({
        queryKey: ['gift-market-listings', searchQuery],
        queryFn: () => userClient.getGiftMarketListings({ search: searchQuery }),
        enabled: isGiftsTab,
        retry: 1,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: 8_000,
        refetchIntervalInBackground: false,
    })

    useEffect(() => {
        if (isLoading || isError || isGiftsTab) return
        console.log('[Market] assets fetched', {
            count: filtered.length,
            tab: activeTab,
            category: activeCategory,
            searchQuery,
            sample: filtered.slice(0, 5).map((item) => ({
                id: item.id,
                title: item.title,
                nft: item.nft,
            })),
        })
    }, [filtered, isLoading, isError, activeTab, activeCategory, searchQuery, isGiftsTab])

    const viewerTgId = user?.id
    const canBuyGifts = isInTelegram && !!initData

    return (
        <div className="px-3 pb-30">
            {/* Search */}
            <div className="rounded-full items-center gap-2 border border-[#666F8B33] pl-3 flex">
                <img className="w-9 h-5" src="/seach-icon.svg" alt="" />
                <input
                    className="flex-1 py-3 outline-none placeholder:text-sm placeholder:text-[#666F8B99] placeholder:font-medium"
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={
                        isGiftsTab
                            ? 'Search gifts by name, seller, or gift id'
                            : 'Search Items for buying, StarGifts'
                    }
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="pr-4 text-[#666F8B] text-sm"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="pt-6 flex pl-3 border-b border-[#666F8B33] overflow-x-auto">
                {(['Explore', 'StarGifts', 'Gifts', "My Listing's"] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => {
                            setActiveTab(tab)
                            setActiveCategory("All Item's")
                        }}
                        className={`text-sm border-b-2 cursor-pointer font-medium pb-2 px-3 -mb-px transition-colors shrink-0 ${
                            activeTab === tab
                                ? 'border-[#0E0636] text-[#0E0636]'
                                : 'border-transparent text-[#666F8B]'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Category Chips (NFT tabs only) */}
            {!isGiftsTab ? (
                <div className="pl-3 flex gap-2 py-6 overflow-x-auto">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`font-medium text-xs rounded-full py-1.5 px-3 whitespace-nowrap transition-colors ${
                                activeCategory === cat
                                    ? 'bg-[#0E0636] text-white'
                                    : 'bg-[#F5F7FB] text-[#666F8B]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] text-[#666F8B] px-3 pt-4 pb-2 leading-relaxed">
                    List gifts in Stars or TON (seller wallet required for TON). Checkout mirrors NFT buys: crypto split to
                    seller + platform fee, then Telegram delivers this gift type to the buyer&apos;s profile.
                </p>
            )}

            {/* Grid */}
            {isGiftsTab ? (
                giftsLoading ? (
                    <div className="text-center py-16">
                        <p className="text-[#666F8B] text-sm">Loading gift listings...</p>
                    </div>
                ) : giftsError ? (
                    <div className="text-center py-16">
                        <p className="text-[#DA0909] text-sm">Failed to load gift marketplace.</p>
                        <p className="text-[#666F8B] text-xs mt-2">
                            Check `VITE_USER_API_URL`, backend status, and CORS origin.
                        </p>
                    </div>
                ) : giftListings.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 px-3 sm:grid-flow-col">
                        {giftListings.map(listing => (
                            <GiftListingCard
                                key={listing.id}
                                listing={listing}
                                initData={initData || ''}
                                usernameForApi={usernameForApi}
                                walletForProfile={walletForApi}
                                actorPayload={actorPayload}
                                starsAvailable={giftBuyerProfile?.stars ?? 0}
                                webApp={
                                    webApp ? { HapticFeedback: webApp.HapticFeedback, showAlert: webApp.showAlert } : undefined
                                }
                                isOwnListing={viewerTgId != null && listing.sellerTelegramId === viewerTgId}
                                canBuy={
                                    canBuyGifts &&
                                    viewerTgId != null &&
                                    listing.sellerTelegramId !== viewerTgId
                                }
                                onBought={() => {
                                    void queryClient.invalidateQueries({ queryKey: ['telegram-gifts'] })
                                    void queryClient.invalidateQueries({ queryKey: ['gift-market-listings'] })
                                    void queryClient.invalidateQueries({ queryKey: ['user-home'] })
                                    void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <p className="text-[#666F8B] text-sm">No gift listings yet.</p>
                        <p className="text-[#666F8B] text-xs mt-2 px-4">
                            Connect Wallet and choose TON pricing on Telegram Gifts → Sell, then others can pay you in TON here.
                        </p>
                        {searchQuery ? (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="text-[#6B6AFD] text-xs mt-2 underline"
                            >
                                Clear search
                            </button>
                        ) : null}
                    </div>
                )
            ) : isLoading ? (
                <div className="text-center py-16">
                    <p className="text-[#666F8B] text-sm">Loading marketplace...</p>
                </div>
            ) : isError ? (
                <div className="text-center py-16">
                    <p className="text-[#DA0909] text-sm">Failed to load marketplace data.</p>
                    <p className="text-[#666F8B] text-xs mt-2">
                        Check `VITE_ADMIN_API_URL`/`VITE_USER_API_URL`, backend status, and CORS origin.
                    </p>
                </div>
            ) : filtered.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 px-3">
                    {filtered.map(nft => (
                        <NftCard
                            key={nft.id}
                            id={nft.id}
                            title={nft.title}
                            username={nft.username}
                            price={nft.price}
                            nft={nft.nft}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16">
                    <p className="text-[#666F8B] text-sm">No data available in this section yet.</p>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-[#6B6AFD] text-xs mt-2 underline"
                        >
                            Clear search
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

export default Market
