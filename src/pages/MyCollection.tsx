import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import NftCard from '../components/NftCard'
import { useTelegram } from '../contexts/TelegramContext'
import { useTonAddress } from '@tonconnect/ui-react'
import { useAccount } from 'wagmi'
import { userClient } from '../services/user'
import { GIFTEDFORGE_DEPLOY } from '../config/giftedforgeDeploy'

const MyCollection = () => {
    const navigate = useNavigate()
    const { user, webApp } = useTelegram()
    const tonAddress = useTonAddress()
    const tonRawAddress = useTonAddress(false)
    const { address: evmAddress, isConnected: evmConnected } = useAccount()

    const usernameForApi = user?.username ? `@${user.username}` : ''
    const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()

    const { data, isLoading, isError } = useQuery({
        queryKey: ['user-home', usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () => userClient.getHome(usernameForApi, user?.id, walletForApi || undefined),
        staleTime: 15_000,
    })

    const collection = data?.collection ?? []

    return (
        <div className="px-3 pb-24">
            <div className="flex items-center justify-between pt-2 pb-6">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="p-1"
                        aria-label="Back"
                    >
                        <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
                    </button>
                    <h1 className="text-xl font-semibold text-[#0E0636]">Your Collection</h1>
                </div>
                
                {user?.id && (
                    <button
                        onClick={() => {
                            const appDeepLinkBase = 
                                import.meta.env.VITE_TELEGRAM_APP_URL?.trim() || 
                                GIFTEDFORGE_DEPLOY.telegramMiniAppUrl || ''
                            const link = appDeepLinkBase 
                                ? `${appDeepLinkBase}${appDeepLinkBase.includes('?') ? '&' : '?'}startapp=${encodeURIComponent(`col_${user.id}`)}`
                                : `${window.location.origin}/app/collection/${user.id}`
                            
                            if (navigator.clipboard?.writeText) {
                                void navigator.clipboard.writeText(link)
                                webApp?.HapticFeedback?.notificationOccurred?.('success')
                                webApp?.showAlert?.('Collection link copied to clipboard.')
                            } else if (webApp?.showAlert) {
                                webApp.showAlert(`Copy this link:\n${link}`)
                            }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#6B6AFD33] bg-[#6B6AFD0D] text-[#6B6AFD] text-[10px] font-semibold"
                    >
                        <img src="/copy.svg" className="w-3 h-3" alt="" />
                        Share
                    </button>
                )}
            </div>

            {isLoading ? (
                <p className="text-sm text-[#666F8B]">Loading…</p>
            ) : isError ? (
                <p className="text-sm text-[#DA0909]">Failed to load your collection.</p>
            ) : collection.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-[#666F8B] text-sm">You don&apos;t have any NFTs in this app yet.</p>
                    <button
                        type="button"
                        onClick={() => navigate('/app/mint')}
                        className="mt-4 text-[#6B6AFD] text-sm font-semibold"
                    >
                        Mint your first NFT →
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-6">
                    {collection.map(item => (
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
            )}
        </div>
    )
}

export default MyCollection
