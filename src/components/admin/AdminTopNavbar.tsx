import { useNavigate } from 'react-router'
import { useLocation } from 'react-router'

const headerTextMapping: Record<string, string> = {
  '/admin/control': 'Admin Control',
  '/admin/users': 'User’s Management',
  '/admin/assets': 'Asset Gallery',
  '/admin/activity': 'Activity',
  '/admin/view': '',
}

export default function AdminTopNavbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname
  const isDashboard = currentPath === '/admin/view'
  const title = headerTextMapping[currentPath] ?? ''

  return (
    <nav className="flex justify-between items-center m-6 gap-2">
      {isDashboard ? (
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.svg" className="w-3 h-6 shrink-0" alt="" />
          <p className="font-semibold text-[#0E0636] truncate">GiftedForge</p>
        </div>
      ) : (
        <div className="w-8 shrink-0" aria-hidden />
      )}

      {!isDashboard && (
        <p className="font-semibold text-[#0E0636] text-center flex-1 truncate">{title}</p>
      )}

      {isDashboard && <div className="flex-1" />}

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="p-0 border-0 bg-transparent cursor-pointer"
          onClick={() => navigate(0)}
          aria-label="Refresh"
        >
          <img className="w-6 h-6 rounded-full object-cover" src="/rotate-right.svg" alt="" />
        </button>
        <img className="w-6 h-6" src="/notification.svg" alt="" />
      </div>
    </nav>
  )
}
