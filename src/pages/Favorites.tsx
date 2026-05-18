import { useNavigate } from 'react-router'
import NftCard from '../components/NftCard'
import { useTelegram } from '../contexts/TelegramContext'
import { useFavorites } from '../hooks/useFavorites'

const Favorites = () => {
  const navigate = useNavigate()
  const { user } = useTelegram()
  const { entries } = useFavorites(user?.id)

  return (
    <div className="px-3 pb-28">
      <div className="flex items-center gap-3 pt-2 pb-6">
        <button type="button" onClick={() => navigate(-1)} className="p-1" aria-label="Back">
          <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
        </button>
        <h1 className="text-xl font-semibold text-[#0E0636]">Favourites</h1>
      </div>

      <p className="text-[11px] text-[#666F8B] pb-4 leading-relaxed px-1">
        Saved NFTs from the marketplace sync on this device. Tap the heart on any listing to save or remove.
      </p>

      {entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#666F8B] text-sm">No favourites yet.</p>
          <button
            type="button"
            onClick={() => navigate('/app/market')}
            className="mt-4 text-[#6B6AFD] text-sm font-semibold"
          >
            Browse marketplace →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6">
          {entries.map((item) => (
            <NftCard
              key={item.id}
              id={item.id}
              title={item.title}
              username={item.username || '@seller'}
              price={item.price || '—'}
              nft={item.nft}
              collectionMode={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Favorites
