import { useNavigate, useLocation } from 'react-router'
import { useTelegram } from '../contexts/TelegramContext'

const headerTextMapping: Record<string, string> = {
  '/app/wallet': 'Wallet',
  '/app/mint': 'Create NFT',
  '/app/market': 'Marketplace',
  '/app/gifts': 'Telegram Gifts',
  '/app/profile': 'Profile',
  '/app/my-collection': 'Your Collection',
  '/app/favorites': 'Favourites',
  '/app/offers': 'Offers',
}

const TopNavbar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useTelegram()
  const currentPath = location.pathname
  const isHome = currentPath === '/app/home'

  const avatarUrl = user?.photo_url ?? '/avatari.png'
  const avatarLetter = user ? user.first_name.charAt(0).toUpperCase() : null

  return (
    <nav className="flex justify-between items-center m-6">
      {isHome ? (
        <div className="flex items-center gap-2">
          <img src="/logo.svg" className="w-3 h-6" alt="" />
          <p className="font-semibold text-[#0E0636]">GiftedForge</p>
        </div>
      ) : (
        <p className="font-semibold text-[#0E0636]">
          {headerTextMapping[currentPath] ?? ''}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="p-0 bg-transparent border-0 cursor-pointer"
          onClick={() => navigate('/app/offers')}
          aria-label="Offers"
        >
          <img className="w-6 h-6" src="/notification.svg" alt="" />
        </button>
        {user?.photo_url ? (
          <button
            type="button"
            onClick={() => navigate('/app/profile')}
            className="p-0 border-0 bg-transparent cursor-pointer"
            aria-label="Profile"
          >
            <img
              className="w-7 h-7 rounded-full object-cover"
              src={avatarUrl}
              alt={user.first_name}
            />
          </button>
        ) : avatarLetter ? (
          <button
            type="button"
            onClick={() => navigate('/app/profile')}
            className="w-7 h-7 rounded-full bg-[#6B6AFD] flex items-center justify-center text-white text-xs font-bold cursor-pointer border-0"
            aria-label="Profile"
          >
            {avatarLetter}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/app/profile')}
            className="p-0 border-0 bg-transparent cursor-pointer"
            aria-label="Profile"
          >
            <img className="w-7 h-7 rounded-full object-cover" src="/avatari.png" alt="" />
          </button>
        )}
      </div>
    </nav>
  )
}

export default TopNavbar
