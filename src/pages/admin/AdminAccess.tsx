import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useNavigate } from 'react-router'
import { useTelegram } from '../../contexts/TelegramContext'
import { adminClient } from '../../services/admin'
import {
  getDesktopAdminSecret,
  grantAdminSession,
  isAdminDevBypass,
  isAdminSessionActive,
} from '../../utils/adminAuth'

export default function AdminAccess() {
  const navigate = useNavigate()
  const { user, webApp, isInTelegram } = useTelegram()
  const [secret, setSecret] = useState('')
  const [checking, setChecking] = useState(false)
  const bypass = isAdminDevBypass()
  const desktopSecret = getDesktopAdminSecret()
  const already = isAdminSessionActive()

  if (already) {
    return <Navigate to="/admin/view" replace />
  }

  const tryContinue = async () => {
    if (bypass) {
      grantAdminSession('dev')
      navigate('/admin/view', { replace: true })
      return
    }

    if (isInTelegram && user?.id) {
      setChecking(true)
      try {
        const result = await adminClient.checkAccess({
          telegramId: user.id,
          username: user.username,
        })
        if (result.authorized) {
          grantAdminSession('staff')
          navigate('/admin/view', { replace: true })
          return
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to verify admin access'
        webApp?.showAlert?.(msg) ?? window.alert(msg)
        return
      } finally {
        setChecking(false)
      }
    }

    if (desktopSecret && secret.trim() === desktopSecret) {
      grantAdminSession('desktop')
      navigate('/admin/view', { replace: true })
      return
    }

    const msg = isInTelegram
      ? 'This Telegram account is not in the admin list. Ask an owner to add your exact @username under Admin → Control → Admins, open GiftedForge once, then try again.'
      : 'Open inside the Telegram Mini App as an authorized admin, or enter the operations passphrase.'
    webApp?.showAlert?.(msg) ?? window.alert(msg)
  }

  return (
    <div className="bg-[#0E0636] min-h-screen pt-12 px-6">
      <Link to="/app/profile" className="flex items-center gap-2 no-underline">
        <img className="w-6 h-6" src="/arrow-left-white.svg" alt="" />
        <p className="text-white">Back</p>
      </Link>

      <div className="flex items-center gap-2 pt-17">
        <img className="w-3 h-6" src="/whitelogo.svg" alt="" />
        <p className="text-white font-semibold">GiftedForge</p>
      </div>
      <p className="font-medium text-white text-2xl leading-[38px] pt-12">
        Verify your Telegram <br /> account to continue as Admin
      </p>

      <button
        type="button"
        disabled={checking}
        onClick={() => void tryContinue()}
        className="border border-white text-white mt-12 rounded-lg w-full h-11.5 text-sm font-semibold cursor-pointer hover:bg-white/10 disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Continue with Telegram'}
      </button>

      {desktopSecret && (
        <div className="mt-8">
          <label className="block text-white/80 text-xs mb-2">Operations passphrase (non-Telegram)</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full rounded-lg border border-white/30 bg-white/10 text-white px-3 py-2 text-sm outline-none placeholder:text-white/40"
            placeholder="Enter passphrase"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void tryContinue()}
            className="mt-3 w-full rounded-lg bg-[#6B6AFD] text-white text-sm font-semibold py-2.5 cursor-pointer"
          >
            Verify passphrase
          </button>
        </div>
      )}

      {bypass && (
        <p className="mt-4 text-xs text-amber-200/90 text-center">
          Dev bypass is on — remove VITE_ADMIN_DEV_BYPASS before production.
        </p>
      )}

      <p className="pt-6 font-light text-center max-w-[280px] mx-auto text-xs text-white leading-relaxed">
        Owners add admins by @username in the control panel. The new admin must use the same Telegram @username and
        open GiftedForge at least once before signing in.
      </p>
    </div>
  )
}
