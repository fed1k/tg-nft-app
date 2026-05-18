import { ReactNode } from 'react'
import AccountBlocked from '../pages/AccountBlocked'
import { useTelegram } from '../contexts/TelegramContext'

export default function RequireAppAccess({ children }: { children: ReactNode }) {
  const { accessState } = useTelegram()

  if (accessState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FB] text-[#666F8B] text-sm">
        Checking account…
      </div>
    )
  }

  if (accessState === 'blocked') {
    return <AccountBlocked />
  }

  return <>{children}</>
}
