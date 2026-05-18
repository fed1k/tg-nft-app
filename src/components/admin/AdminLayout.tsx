import { Outlet } from 'react-router'
import AdminBottomNav from './AdminBottomNav'
import AdminTopNavbar from './AdminTopNavbar'

export default function AdminLayout() {
  return (
    <div>
      <AdminTopNavbar />
      <div className="px-3">
        <Outlet />
      </div>
      <AdminBottomNav />
    </div>
  )
}
