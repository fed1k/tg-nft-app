import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import NftCard from '../components/NftCard'
import { useTelegram } from '../contexts/TelegramContext'
import { userClient } from '../services/user'

const PublicCollection = () => {
    const navigate = useNavigate()
    const { id } = useParams()
    const { user: currentUser } = useTelegram()

    // Determine if we are looking at by telegramId or username
    const isTelegramId = id && /^\d+$/.test(id)
    const telegramId = isTelegramId ? parseInt(id, 10) : undefined
    const username = !isTelegramId && id ? (id.startsWith('@') ? id : `@${id}`) : undefined

    const { data, isLoading, isError } = useQuery({
        queryKey: ['public-collection', id],
        queryFn: () => userClient.getHome(username, telegramId),
        staleTime: 30_000,
        enabled: !!id,
    })

    const collection = data?.collection ?? []
    
    // Check if viewing own collection
    const isOwnCollection = currentUser && (
        (telegramId && currentUser.id === telegramId) ||
        (username && currentUser.username && (username === `@${currentUser.username}` || username === currentUser.username))
    )

    const title = isOwnCollection ? 'Your Collection' : 'Collection'
    const subtitle = username || (telegramId ? `User ${telegramId}` : 'User Collection')

    return (
        <div className="px-3 pb-24">
            <div className="flex items-center gap-3 pt-2 pb-6">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="p-1"
                    aria-label="Back"
                >
                    <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
                </button>
                <div>
                    <h1 className="text-xl font-semibold text-[#0E0636]">{title}</h1>
                    <p className="text-xs text-[#666F8B]">{subtitle}</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6B6AFD]"></div>
                    <p className="text-sm text-[#666F8B] mt-4">Loading collection…</p>
                </div>
            ) : isError ? (
                <div className="text-center py-20">
                    <p className="text-sm text-[#DA0909]">Failed to load collection.</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-4 text-[#6B6AFD] text-sm font-semibold"
                    >
                        Try again
                    </button>
                </div>
            ) : collection.length === 0 ? (
                <div className="text-center py-20">
                    <img src="/box.svg" className="w-16 h-16 mx-auto opacity-20" alt="" />
                    <p className="text-[#666F8B] text-sm mt-4">This collection is empty.</p>
                    {isOwnCollection && (
                        <button
                            type="button"
                            onClick={() => navigate('/app/mint')}
                            className="mt-4 text-[#6B6AFD] text-sm font-semibold"
                        >
                            Mint your first NFT →
                        </button>
                    )}
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

export default PublicCollection
