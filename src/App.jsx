// src/components/AppLayout.jsx
// import { Outlet } from "react-router-dom";
import { Outlet } from "react-router";
import BottomNav from "./components/BottomNav";
import TopNavbar from "./components/TopNavbar";


export default function AppLayout() {
  return (
    <div className="app-container">
      <TopNavbar />
      <main className="main-content">
        <Outlet />           {/* Pages like Home, Profile, etc. will render here */}
      </main>

      <BottomNav />          {/* Sticky bottom navigation */}
    </div>
  );
}