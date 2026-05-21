import React from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import NftCard from '../components/NftCard'
import { useTelegram } from '../contexts/TelegramContext'
import { useTonAddress } from '@tonconnect/ui-react'
import { useAccount } from 'wagmi'
import { userClient } from '../services/user'

const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
const IS_TESTNET = meta.env?.VITE_TON_NETWORK === 'testnet'
const TON_API_BASE = IS_TESTNET ? 'https://testnet.tonapi.io' : 'https://tonapi.io'

const Home = () => {
    const navigate = useNavigate()
    const { user, isInTelegram, initData } = useTelegram()

    // Wallet states
    const tonAddress = useTonAddress()
    const tonRawAddress = useTonAddress(false)
    const { address: evmAddress, isConnected: evmConnected } = useAccount()

    const displayName = user
        ? user.first_name + (user.last_name ? ` ${user.last_name}` : '')
        : 'Friend'

    const shortAddress = (addr: string) =>
        addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''

    const walletConnected = !!tonAddress || evmConnected
    const usernameForApi = user?.username ? `@${user.username}` : ''
    const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()

    const { data, isLoading, isError } = useQuery({
        queryKey: ['user-home', usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () => userClient.getHome(usernameForApi, user?.id, walletForApi || undefined),
        staleTime: 15000,
    })
    const { data: tonBalanceTon = 0 } = useQuery({
        queryKey: ['home-ton-balance', tonRawAddress],
        enabled: !!tonRawAddress,
        staleTime: 20_000,
        queryFn: async () => {
            const res = await fetch(`${TON_API_BASE}/v2/accounts/${encodeURIComponent(tonRawAddress)}`)
            if (!res.ok) throw new Error('Failed to load TON balance')
            const payload = await res.json()
            const nano = Number(payload?.balance ?? 0)
            return Number.isFinite(nano) ? nano / 1e9 : 0
        },
    })
    const { data: tonUsdPrice = 0 } = useQuery({
        queryKey: ['ton-usd-price'],
        staleTime: 60_000,
        queryFn: async () => {
            const res = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
            )
            if (!res.ok) throw new Error('Failed to load TON price')
            const payload = await res.json()
            const usd = Number(payload?.['the-open-network']?.usd ?? 0)
            return Number.isFinite(usd) ? usd : 0
        },
    })

    const giftsQuery = useQuery({
        queryKey: ['telegram-gifts', user?.id],
        enabled: Boolean(isInTelegram && initData && user?.id),
        staleTime: 30_000,
        queryFn: () =>
            userClient.listTelegramGifts({
                initData,
                limit: 8,
            }),
    })

    const stats = data?.stats ?? { nftsOwned: 0, activeListings: 0, stars: 0 }
    const collection = data?.collection ?? []
    const recentActivity = data?.recentActivity ?? []
    const totalUsd = tonBalanceTon * tonUsdPrice

    return (
        <div className="px-3 pb-24">
            <p className="text-xs ml-3 lg:text-sm pb-2 border-b-2 inline text-[#0E0636] border-[#0E06361A]">
                Welcome back, {displayName} 👋
            </p>

            {/* Balance Card */}
            <div className="bg-[#6B6AFD] rounded-3xl py-5 px-3 mt-6">
                <div className="flex justify-between items-start">
                    <p className="text-sm font-light text-white">Total Balance</p>
                    <button
                        type="button"
                        onClick={() => navigate('/app/wallet')}
                        className="bg-white flex gap-1 items-center justify-center rounded-full w-[61px] h-[21px] cursor-pointer"
                        title="Stars balance — tap to top up"
                    >
                        <img src="/star.svg" className="w-3 h-3" alt="" />
                        <p className="text-[10px] font-medium text-[#6B6AFD]">
                            {stats.stars.toLocaleString()}
                        </p>
                    </button>
                </div>

                <div>
                    <p className="text-[28px] text-white pt-2 font-medium">
                        ${totalUsd.toFixed(2)}
                    </p>
                    <div className="pt-2 flex flex-col gap-1">
                        {walletConnected ? (
                            <>
                                {tonAddress && (
                                    <p className="font-light text-xs text-white/80">
                                        TON: {shortAddress(tonAddress)}
                                    </p>
                                )}
                                {evmConnected && evmAddress && (
                                    <p className="font-light text-xs text-white/80">
                                        EVM: {shortAddress(evmAddress)}
                                    </p>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={() => navigate('/app/wallet')}
                                className="text-xs text-white/80 underline text-left"
                            >
                                Connect a wallet →
                            </button>
                        )}
                    </div>
                </div>

                <div className="pt-4 flex items-center gap-1">
                    <img src="/trend-up.svg" className="w-5 h-5" alt="" />
                    <p className="font-light text-sm text-white">Live backend sync</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 pt-6">
                <div className='py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]'>
                    <p className='text-sm'>NFTs Owned</p>
                    <div className='flex pt-2 items-center justify-between'>
                        <p className='font-semibold text-2xl'>{stats.nftsOwned}</p>
                        <img className='w-4 h-4' alt="" src="/layer.svg" />
                    </div>
                </div>
                <div className='py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]'>
                    <p className='text-sm'>Active Listings</p>
                    <div className='flex pt-2 items-center justify-between'>
                        <p className='font-semibold text-2xl'>{stats.activeListings}</p>
                        <img className='w-4 h-4' alt="" src="/tag.svg" />
                    </div>
                </div>
                <div className='py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]'>
                    <p className='text-sm'>Wallet Balance</p>
                    <div className='flex pt-2 items-center justify-between'>
                        {/* {walletConnected ? (
                            <p className='font-semibold text-lg'>
                                {tonAddress ? 'TON' : 'EVM'}
                            </p>
                        ) : (
                            <p className='font-semibold text-sm text-[#666F8B]'>—</p>
                        )} */}
                        <p className='font-semibold text-2xl'>{tonBalanceTon?.toFixed(2)} <span className='text-sm font-normal'>TON</span></p>
                        <img className='w-4 h-4' alt="" src="/wallet-2.svg" />
                    </div>
                </div>
                <div className='py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]'>
                    <p className='text-sm'>Stars</p>
                    <div className='flex pt-2 items-center justify-between'>
                        <p className='font-semibold text-2xl'>{stats.stars}</p>
                        <img className='w-4 h-4' alt="" src="/star.svg" />
                    </div>
                </div>
            </div>

            {/* Telegram gifts — same signed session as Mini App; list is for this Telegram user id */}
            {isInTelegram && user?.id ? (
                <div className="mt-6 rounded-3xl bg-[#F5F7FB] px-4 py-4 border border-[#0E06361A]">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div>
                            <p className="font-semibold text-[#0E0636] text-sm">Your Telegram gifts</p>
                            <p className="text-[10px] text-[#666F8B] pt-1">
                                Sell regular gifts → they appear under Market → Gifts
                            </p>
                        </div>
                        <div className="flex gap-3 shrink-0 items-center">
                            <button
                                type="button"
                                onClick={() => navigate('/app/gifts?sell=1')}
                                className="text-xs font-semibold text-[#0E0636] bg-transparent border-0 p-0 cursor-pointer underline decoration-[#0E0636]/25"
                            >
                                Sell gifts
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/app/gifts')}
                                className="text-xs font-semibold text-[#6B6AFD] bg-transparent border-0 p-0 cursor-pointer"
                            >
                                View all
                            </button>
                        </div>
                    </div>
                    {!initData ? (
                        <p className="text-xs text-amber-800 pt-3">
                            Session data loading… reopen the Mini App from the bot if this stays empty.
                        </p>
                    ) : giftsQuery.isLoading ? (
                        <p className="text-xs text-[#666F8B] pt-3">Loading gifts…</p>
                    ) : giftsQuery.isError ? (
                        <p className="text-xs text-[#DA0909] pt-3">{(giftsQuery.error as Error)?.message}</p>
                    ) : (
                        <>
                            <p className="text-xs text-[#666F8B] pt-2">
                                {giftsQuery.data?.total_count ?? 0} in your profile (Telegram)
                            </p>
                            {(giftsQuery.data?.gifts?.length ?? 0) > 0 ? (
                                <div className="flex gap-2 pt-3 overflow-x-auto pb-1">
                                    {giftsQuery.data!.gifts.slice(0, 8).map((g, i) => (
                                        <div
                                            key={`${g.kind}-${
                                                'ownedGiftId' in g && g.ownedGiftId
                                                    ? g.ownedGiftId
                                                    : 'giftId' in g && g.giftId
                                                      ? g.giftId
                                                      : i
                                            }`}
                                            className="shrink-0 w-11 h-11 rounded-2xl bg-white flex items-center justify-center text-xl border border-[#0E06361A]"
                                            title={
                                                g.kind === 'unique' && 'name' in g && g.name
                                                    ? String(g.name)
                                                    : g.kind === 'regular' && g.text
                                                      ? g.text
                                                      : 'Gift'
                                            }
                                        >
                                            {g.kind === 'unknown' ? '🎁' : 'emoji' in g ? g.emoji : '🎁'}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-[#666F8B] pt-3">No gifts to show yet.</p>
                            )}
                        </>
                    )}
                </div>
            ) : null}

            {/* Quick Actions */}
            <p className="font-semibold pl-3 text-xl pt-12 pb-6 text-[#0E0636]">Quick Actions</p>
            <div className="flex gap-3.5 px-3 overflow-x-auto pb-1">
                <div
                    onClick={() => navigate('/app/wallet')}
                    className="bg-[#6B6AFD0D] cursor-pointer w-[106px] shrink-0 rounded-[20px] flex flex-col items-center py-[29px]"
                >
                    <img src="/add-circle.svg" alt="" />
                    <p className="text-xs pt-[9px] font-medium text-[#6B6AFD]">
                        {walletConnected ? 'My Wallet' : 'Connect Wallet'}
                    </p>
                </div>
                <div
                    onClick={() => navigate('/app/mint')}
                    className="bg-[#6B6AFD0D] cursor-pointer w-[106px] shrink-0 rounded-[20px] flex flex-col items-center py-[29px]"
                >
                    <img src="/nft.svg" alt="" />
                    <p className="text-xs pt-[9px] font-medium text-[#6B6AFD]">Mint NFT</p>
                </div>
                <div
                    onClick={() => navigate('/app/market')}
                    className="bg-[#6B6AFD0D] cursor-pointer w-[106px] shrink-0 rounded-[20px] flex flex-col items-center py-[29px]"
                >
                    <img src="/search-normal.svg" alt="" />
                    <p className="text-xs pt-[9px] font-medium text-[#6B6AFD]">Browse Market</p>
                </div>
                <div
                    onClick={() => navigate('/app/gifts')}
                    className="bg-[#6B6AFD0D] cursor-pointer w-[106px] shrink-0 rounded-[20px] flex flex-col items-center py-[29px]"
                >
                    <img src="/heart.svg" alt="" />
                    <p className="text-xs pt-[9px] font-medium text-[#6B6AFD] text-center leading-tight px-1">
                        Telegram Gifts
                    </p>
                </div>
            </div>

            {/* Collection — only this user's assets; preview max 2 */}
            <div className="pt-[49px] flex justify-between pb-6 px-3 items-center">
                <p className="font-semibold text-xl text-[#0E0636]">Your Collection</p>
                {collection.length > 2 ? (
                    <button
                        type="button"
                        onClick={() => navigate('/app/my-collection')}
                        className="text-sm font-medium text-[#6B6AFD] cursor-pointer bg-transparent border-0 p-0"
                    >
                        View All
                    </button>
                ) : null}
            </div>
            {isLoading ? (
                <p className="text-sm text-[#666F8B] px-3">Loading collection...</p>
            ) : isError ? (
                <p className="text-sm text-[#DA0909] px-3">Failed to load collection.</p>
            ) : collection.length ? (
                <div className="flex gap-3.5 px-3 overflow-x-auto pb-1">
                    {collection.slice(0, 2).map((item) => (
                        <NftCard
                            key={item.id}
                            id={item.id}
                            title={item.title}
                            username={item.username}
                            price={item.price}
                            nft={item.nft}
                            collectionMode
                            ownershipLabel={item.ownershipLabel || (item.viewerOwned ? 'Owned' : undefined)}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-sm text-[#666F8B] px-3">No NFTs in your collection yet. Mint one to see it here.</p>
            )}

            {/* Recent Activity */}
            <div className="px-3 pt-12">
                <p className="font-semibold text-xl pb-6 text-[#0E0636]">Recent Activity</p>
                <div className="pt-6 bg-[#F5F7FB] rounded-3xl space-y-2 py-4 px-3">
                    {isLoading ? (
                        <p className="text-sm text-[#666F8B] text-center py-4">Loading activity...</p>
                    ) : isError ? (
                        <p className="text-sm text-[#DA0909] text-center py-4">Failed to load activity.</p>
                    ) : recentActivity.length === 0 ? (
                        <p className="text-sm text-[#666F8B] text-center py-4">No activity yet.</p>
                    ) : (
                        recentActivity.slice(0, 6).map((tx) => (
                            <div key={tx.id} className="bg-white p-1.5 rounded-xl flex justify-between items-center">
                                <div className="flex gap-2 items-center">
                                    <div className="w-9 h-9 rounded-lg bg-[#F5F7FB] flex items-center justify-center">
                                        <img className="w-4 h-4" src={tx.icon || '/box.svg'} alt="" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-xs text-[#0E0636]">{tx.name}</p>
                                        <p className="text-[10px] font-light text-[#0E0636]">{tx.timeLabel} ago</p>
                                    </div>
                                </div>
                                <div className="pr-[5px] text-right">
                                    <p className="text-[10px] text-[#6B6AFD] font-medium">{tx.amount}</p>
                                    <p className="text-end text-[8px] text-[#666F8B]">
                                        {(() => {
                                            const amountStr = tx.amount.toLowerCase();
                                            let tonValue = NaN;

                                            // 1. Try to extract TON value directly (e.g., "0.5 TON" or "≈ 0.040 TON")
                                            const tonMatch = tx.amount.match(/(?:≈\s*)?([0-9.]+)\s*TON/i);
                                            if (tonMatch) {
                                                tonValue = parseFloat(tonMatch[1]);
                                            } 
                                            // 2. Fallback: Extract Stars and convert to TON (100k Stars = 1 TON)
                                            else if (amountStr.includes('stars')) {
                                                const starsMatch = tx.amount.match(/([0-9,.]+)\s*stars/i);
                                                if (starsMatch) {
                                                    const stars = parseFloat(starsMatch[1].replace(/,/g, ''));
                                                    tonValue = stars / 100000;
                                                }
                                            }
                                            // 3. Generic fallback for amounts without unit (assume TON)
                                            else if (!amountStr.includes('gift')) {
                                                tonValue = parseFloat(tx.amount.replace(/[^0-9.]/g, ''));
                                            }

                                            if (!isNaN(tonValue) && tonUsdPrice > 0) {
                                                return `$${(tonValue * tonUsdPrice).toFixed(2)}`;
                                            }
                                            return tx.feeLabel;
                                        })()}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

export default Home
