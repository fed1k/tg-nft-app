import { NavLink, useLocation } from 'react-router'

const pillPositions: Record<string, { left: string; width: string }> = {
  '/admin/view': { left: '12px', width: '88px' },
  '/admin/users': { left: '75px', width: '91px' },
  '/admin/assets': { left: '147px', width: '77px' },
  '/admin/activity': { left: '200px', width: '95px' },
  '/admin/control': { left: '270px', width: '91px' },
}

export default function AdminBottomNav() {
  const location = useLocation()
  const currentPath = location.pathname
  const currentPill = pillPositions[currentPath] ?? pillPositions['/admin/view']

  return (
    <div className="mx-3 fixed gap-10 z-100 items-center bottom-4 flex h-[72px] bg-[#0E0636] rounded-full py-4 px-3">
      <div
        style={{ left: currentPill.left, width: currentPill.width }}
        className="rounded-full bg-white transition-all duration-200 h-10 absolute bottom-4"
      />
      <NavLink to="/admin/view" className="nav-item z-50">
        {({ isActive }) => (
          <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? ' w-22' : ''}`}>
            <img src={isActive ? '/graph-active.svg' : '/graph.svg'} className="w-6 h-6" alt="" />
            {isActive && <p className="text-[#0E0636] text-sm font-semibold">View</p>}
          </div>
        )}
      </NavLink>

      <NavLink to="/admin/users" className="nav-item z-50">
        {({ isActive }) => (
          <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? 'w-22' : ''}`}>
            <img
              src={isActive ? '/profile-2user-active.svg' : '/profile-2user.svg'}
              className="w-6 h-6"
              alt=""
            />
            {isActive && <p className="text-[#0E0636] text-sm font-semibold">User</p>}
          </div>
        )}
      </NavLink>

      <NavLink to="/admin/assets" className="nav-item z-50">
        {({ isActive }) => (
          <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? 'w-22' : ''}`}>
            <img src={isActive ? '/gallery-active.svg' : '/admingallery.svg'} className="w-6 h-6" alt="" />
            {isActive && <p className="text-[#0E0636] text-sm font-semibold">Asset</p>}
          </div>
        )}
      </NavLink>

      <NavLink to="/admin/activity" className="nav-item z-50">
        {({ isActive }) => (
          <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? 'w-22' : ''}`}>
            <img
              src={isActive ? '/arrow-swap-horizontal-active.svg' : '/arrow-swap-horizontal.svg'}
              className="w-6 h-6"
              alt=""
            />
            {isActive && <p className="text-[#0E0636] text-sm font-semibold">Activity</p>}
          </div>
        )}
      </NavLink>

      <NavLink to="/admin/control" className="nav-item z-50">
        {({ isActive }) => (
          <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? ' w-22' : ''}`}>
            <img src={isActive ? '/setting-3-active.svg' : '/setting-3.svg'} className="w-6 h-6" alt="" />
            {isActive && <p className="text-[#0E0636] text-sm font-semibold">Control</p>}
          </div>
        )}
      </NavLink>
    </div>
  )
}
