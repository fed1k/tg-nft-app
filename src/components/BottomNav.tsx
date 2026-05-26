import { NavLink, useLocation } from "react-router";

const BottomNav = () => {
    const location = useLocation();
    const currentPath = location.pathname;

    const tabs = [
        { path: "/app/home", activeIcon: "/home-active.svg", icon: "/home.svg" },
        { path: "/app/wallet", activeIcon: "/wallet-2-active.svg", icon: "/wallet-3.svg" },
        { path: "/app/mint", activeIcon: "/add-circle-active.svg", icon: "/add-circle2.svg" },
        { path: "/app/market", activeIcon: "/shop-active.svg", icon: "/shop.svg" },
        { path: "/app/profile", activeIcon: "/profile-active.svg", icon: "/profile.svg" },
    ];

    const activeIndex = tabs.findIndex(tab => tab.path === currentPath);
    const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex;

    return (
        <div className="fixed bottom-4 left-0 right-0 mx-3 h-[72px] bg-[#0E0636] rounded-full z-[100] flex items-center px-4">
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
                    <div className="w-[58px] h-10 bg-white rounded-full"></div>
                </div>

                {tabs.map((tab) => (
                    <NavLink 
                        key={tab.path} 
                        to={tab.path} 
                        className="flex-1 z-50 flex justify-center items-center h-10"
                    >
                        {({ isActive }) => (
                            <div className="flex items-center justify-center rounded-full h-10 w-full">
                                <img 
                                    src={isActive ? tab.activeIcon : tab.icon} 
                                    className="w-6 h-6 transition-all duration-200 active:scale-90" 
                                    alt="" 
                                />
                            </div>
                        )}
                    </NavLink>
                ))}
            </div>
        </div>
    );
};

export default BottomNav;