import { NavLink, useLocation } from 'react-router'

const tabs = [
  { path: '/admin/view', label: 'View', activeIcon: '/graph-active.svg', icon: '/graph.svg', width: 88 },
  { path: '/admin/users', label: 'User', activeIcon: '/profile-2user-active.svg', icon: '/profile-2user.svg', width: 91 },
  { path: '/admin/assets', label: 'Asset', activeIcon: '/gallery-active.svg', icon: '/admingallery.svg', width: 77 },
  { path: '/admin/activity', label: 'Activity', activeIcon: '/arrow-swap-horizontal-active.svg', icon: '/arrow-swap-horizontal.svg', width: 95 },
  { path: '/admin/control', label: 'Control', activeIcon: '/setting-3-active.svg', icon: '/setting-3.svg', width: 91 },
]

export default function AdminBottomNav() {
  const location = useLocation()
  const currentPath = location.pathname
  const activeIndex = tabs.findIndex(tab => tab.path === currentPath)
  const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex
  const currentTab = tabs[safeActiveIndex]

  return (
    <div className="mx-3 fixed left-0 right-0 z-[100] bottom-4 flex h-[72px] bg-[#0E0636] rounded-full px-4 items-center">
      <div className="relative flex w-full items-center">
        {/* Animated Pill Background */}
        <div
          className="absolute transition-all duration-300 ease-in-out flex justify-center pointer-events-none"
          style={{
            width: '20%',
            transform: `translateX(${safeActiveIndex * 100}%)`,
            left: 0,
          }}
        >
          <div 
            style={{ width: `${currentTab.width}px` }}
            className="h-10 bg-white rounded-full transition-all duration-300"
          />
        </div>

        {tabs.map((tab) => (
          <NavLink key={tab.path} to={tab.path} className="flex-1 z-50 flex justify-center items-center h-10">
            {({ isActive }) => (
              <div className="flex items-center justify-center gap-1 rounded-full h-10 w-full">
                <img src={isActive ? tab.activeIcon : tab.icon} className="w-6 h-6" alt="" />
                {isActive && <p className="text-[#0E0636] text-sm font-semibold">{tab.label}</p>}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
