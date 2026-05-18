import { useTelegram } from '../contexts/TelegramContext'

export default function AccountBlocked() {
  const { blockMessage, blockStatus, isInTelegram, webApp } = useTelegram()

  const title = blockStatus === 'Suspended' ? 'Account suspended' : 'Account banned'
  const message =
    blockMessage ||
    (blockStatus === 'Suspended'
      ? 'Your account is suspended. Contact support to restore access.'
      : 'Your account has been banned. You cannot use GiftedForge.')

  return (
    <div className="min-h-screen bg-[#0E0636] flex flex-col items-center justify-center px-6 text-center text-white">
      <div className="w-16 h-16 rounded-full bg-[#DA0909]/20 flex items-center justify-center mb-6">
        <img src="/security-safe.svg" alt="" className="w-8 h-8 opacity-90" />
      </div>
      <h1 className="text-2xl font-semibold mb-3">{title}</h1>
      <p className="text-sm text-white/80 max-w-[300px] leading-relaxed">{message}</p>
      {isInTelegram && (
        <button
          type="button"
          className="mt-10 border border-white/40 text-white text-sm font-semibold rounded-lg px-6 py-2.5"
          onClick={() => webApp?.close?.()}
        >
          Close app
        </button>
      )}
    </div>
  )
}
