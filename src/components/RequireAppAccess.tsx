import { useState, type ReactNode } from 'react'
import AccountBlocked from '../pages/AccountBlocked'
import { useTelegram } from '../contexts/TelegramContext'

function WaitlistGate() {
  const { activateWithCode, activationCodeError } = useTelegram()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    await activateWithCode(code)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0E0636] flex flex-col items-center justify-center px-6 text-center text-white">
      <div className="w-16 h-16 rounded-full bg-[#6B6AFD]/20 flex items-center justify-center mb-6">
        <img src="/security-safe.svg" alt="" className="w-8 h-8 opacity-90" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">Invite only</h1>
      <p className="text-sm text-white/70 max-w-[280px] leading-relaxed mb-8">
        GiftedForge is currently in early access. Enter your activation code to continue.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-[280px] space-y-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          autoCapitalize="characters"
          className="w-full bg-white/10 border border-white/20 text-white placeholder:text-white/30 rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-center outline-none focus:border-[#6B6AFD]"
        />
        {activationCodeError && (
          <p className="text-xs text-red-400">{activationCodeError}</p>
        )}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full bg-[#6B6AFD] text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Activate'}
        </button>
      </form>
    </div>
  )
}

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

  if (accessState === 'waitlist_locked') {
    return <WaitlistGate />
  }

  return <>{children}</>
}
