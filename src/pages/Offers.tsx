import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTelegram } from '../contexts/TelegramContext'
import { useTonAddress } from '@tonconnect/ui-react'
import { useAccount } from 'wagmi'
import { userClient } from '../services/user'
import { displayHandle } from '../utils/displayHandle'

const Offers = () => {
  const navigate = useNavigate()
  const { user } = useTelegram()
  const tonAddress = useTonAddress()
  const tonRawAddress = useTonAddress(false)
  const { address: evmAddress } = useAccount()
  const [tab, setTab] = useState<'all' | 'sent' | 'received'>('all')

  const usernameForApi = user?.username ? `@${user.username}` : ''
  const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()

  const { data: offers = [], isLoading, isError } = useQuery({
    queryKey: ['user-offers', tab, usernameForApi, user?.id ?? 0, walletForApi],
    queryFn: () => userClient.getOffers(tab, usernameForApi, user?.id, walletForApi || undefined),
    staleTime: 10_000,
  })

  return (
    <div className="px-3 pb-28">
      <div className="flex items-center gap-3 pt-2 pb-6">
        <button type="button" onClick={() => navigate(-1)} className="p-1" aria-label="Back">
          <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
        </button>
        <h1 className="text-xl font-semibold text-[#0E0636]">Offers</h1>
      </div>

      <div className="flex gap-2 pb-5">
        {(['all', 'sent', 'received'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              tab === t ? 'bg-[#0E0636] text-white' : 'bg-[#F5F7FB] text-[#666F8B]'
            }`}
          >
            {t === 'all' ? 'All' : t === 'sent' ? 'Sent' : 'Received'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-[#666F8B]">Loading offers...</p>
      ) : isError ? (
        <p className="text-sm text-[#DA0909]">Failed to load offers.</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-[#666F8B]">No offers found for this view.</p>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <div
              key={offer.id}
              role={offer.assetId ? 'button' : undefined}
              tabIndex={offer.assetId ? 0 : undefined}
              onClick={() => {
                if (offer.assetId) navigate(`/asset/${offer.assetId}`)
              }}
              onKeyDown={(e) => {
                if (offer.assetId && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  navigate(`/asset/${offer.assetId}`)
                }
              }}
              className={`border border-[#666F8B33] rounded-2xl p-3 bg-[#F5F7FB66] ${
                offer.assetId ? 'cursor-pointer hover:bg-[#6B6AFD0D] transition-colors' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <p className="text-sm font-semibold text-[#0E0636]">{offer.title}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6B6AFD0D] text-[#6B6AFD]">
                  {offer.status}
                </span>
              </div>
              <div className="pt-2 flex justify-between text-xs text-[#666F8B]">
                <p>{offer.direction === 'sent' ? 'You sent' : 'You received'}</p>
                <p>{offer.amount}</p>
              </div>
              <div className="pt-1 flex justify-between text-[10px] text-[#666F8B]">
                <p>
                  {displayHandle(offer.fromUser)} → {displayHandle(offer.toUser)}
                </p>
                <p>{offer.timeLabel} ago</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Offers
