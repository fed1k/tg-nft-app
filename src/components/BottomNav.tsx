import { NavLink, useLocation } from "react-router";

const BottomNav = () => {

    const location = useLocation();

    // Get current path (e.g. "/app/home", "/app/profile")
    const currentPath = location.pathname;

    // / Define position & width for each tab
    const pillPositions = {
        "/app/home": { left: "12px", width: "88px" },
        "/app/wallet": { left: "75px", width: "91px" },
        "/app/mint": { left: "147px", width: "77px" },
        "/app/market": { left: "200px", width: "95px" },
        "/app/profile": { left: "270px", width: "91px" },
    };

    const currentPill = pillPositions[currentPath as keyof typeof pillPositions] || pillPositions["/app/home"];

    return (
        <div className="mx-3 fixed gap-10 z-100 items-center bottom-4 flex h-[72px] bg-[#0E0636] rounded-full py-4 px-3">
            <div style={{
                left: currentPill.left,
                width: currentPill.width,
            }} className="rounded-full bg-white transition-all h-10 absolute bottom-4 "></div>
            <NavLink to="/app/home" className="nav-item z-50">
                {({ isActive }) => (
                    <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? " w-22" : ""}`}>
                        <img src={isActive ? "/home-active.svg" : "/home.svg"} className={`w-6 h-6 `} alt="" />
                        {isActive && <p className="text-[#0E0636] text-sm font-semibold">Home</p>}
                    </div>
                )}
            </NavLink>

            <NavLink to="/app/wallet" className="nav-item z-50">
                {({ isActive }) => (
                    <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? "w-22" : ""}`}>
                        <img src={isActive ? "/wallet-2-active.svg" : "/wallet-3.svg"} className={`w-6 h-6 `} alt="" />
                        {isActive && <p className="text-[#0E0636] text-sm font-semibold">Wallet</p>}
                    </div>
                )}
            </NavLink>

            <NavLink to="/app/mint" className="nav-item z-50">
                {({ isActive }) => (
                    <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? "w-22" : ""}`}>
                        <img src={isActive ? "/add-circle-active.svg" : "/add-circle2.svg"} className={`w-6 h-6 `} alt="" />
                        {isActive && <p className="text-[#0E0636] text-sm font-semibold">Mint</p>}
                    </div>
                )}
            </NavLink>

            <NavLink to="/app/market" className="nav-item z-50">
                {({ isActive }) => (
                    <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? "w-22" : ""}`}>
                        <img src={isActive ? "/shop-active.svg" : "/shop.svg"} className={`w-6 h-6 `} alt="" />
                        {isActive && <p className="text-[#0E0636] text-sm font-semibold">Market</p>}
                    </div>
                )}
            </NavLink>

            <NavLink to="/app/profile" className="nav-item z-50">
                {({ isActive }) => (
                    <div className={`flex items-center justify-center gap-1 rounded-full h-10 ${isActive ? " w-22" : ""}`}>
                        <img src={isActive ? "/profile-active.svg" : "/profile.svg"} className={`w-6 h-6 `} alt="" />
                        {isActive && <p className="text-[#0E0636] text-sm font-semibold">Profile</p>}
                    </div>
                )}
            </NavLink>
        </div>
    )
}

export default BottomNav