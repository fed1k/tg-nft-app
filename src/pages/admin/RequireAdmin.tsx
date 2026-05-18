import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import {
  getDesktopAdminSecret,
  getAdminSessionVia,
  isAdminDevBypass,
  isAdminSessionActive,
} from '../../utils/adminAuth'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const location = useLocation()
  const session = isAdminSessionActive()
  const dev = isAdminDevBypass()
  const via = getAdminSessionVia()

  if (dev) {
    return children
  }

  if (!session) {
    return <Navigate to="/admin-access" replace state={{ from: location.pathname }} />
  }

  if (via === 'telegram' || via === 'staff' || via === 'dev') {
    return children
  }

  if (via === 'desktop' && getDesktopAdminSecret()) {
    return children
  }

  return <Navigate to="/admin-access" replace state={{ from: location.pathname }} />
}
