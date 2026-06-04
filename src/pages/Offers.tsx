import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTelegram } from '../contexts/TelegramContext'
import { useTonAddress } from '@tonconnect/ui-react'
import { useAccount } from 'wagmi'
import { userClient } from '../services/user'
import { displayHandle } from '../utils/displayHandle'
import { useLanguage } from '../contexts/LanguageContext'

const Offers = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const { user } = useTelegram()
  const tonAddress = useTonAddress()
  const tonRawAddress = useTonAddress(false)
  const { address: evmAddress } = useAccount()
  const [tab, setTab] = useState<'sent' | 'received'>('received')

  const usernameForApi = user?.username ? `@${user.username}` : ''
  const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()

  const { data: remoteOffers = [], isLoading, isError } = useQuery({
    queryKey: ['user-offers', tab, usernameForApi, user?.id ?? 0, walletForApi],
    queryFn: () => userClient.getOffers(tab, usernameForApi, user?.id, walletForApi || undefined),
    staleTime: 10_000,
  })


  const offers = remoteOffers.length > 0 ? remoteOffers : []

  const getUsdPrice = (amountStr: string) => {
    const num = parseFloat(amountStr)
    if (isNaN(num)) return '$0.00'
    // Check 'stars' first — Stars amount strings contain "(≈ X TON)" so 'ton' would match too.
    if (amountStr.toLowerCase().includes('stars')) return `$${(num * 0.02).toFixed(2)}`
    if (amountStr.toLowerCase().includes('ton')) return `$${(num * 5.5).toFixed(2)}`
    return '$0.00'
  }

  const handleAction = async (action: 'accept' | 'decline' | 'cancel', id: string) => {
    try {
      if (action === 'accept') {
        await userClient.acceptOffer(id)
        queryClient.invalidateQueries({ queryKey: ['user-offers'] })
        // Stars offers are fully settled server-side. TON offers: the buyer's "Complete Purchase"
        // button (visible in their Sent tab) directs them to the asset page to pay on-chain.
      } else if (action === 'decline') {
        await userClient.declineOffer(id)
        queryClient.invalidateQueries({ queryKey: ['user-offers'] })
      } else if (action === 'cancel') {
        await userClient.cancelOffer(id)
        queryClient.invalidateQueries({ queryKey: ['user-offers'] })
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="px-3 pb-28 pt-12">
      <div className="flex items-center gap-3 pt-2 pb-6 relative justify-center">
        <button type="button" onClick={() => navigate("/app/profile")} className="p-1 absolute left-3" aria-label={t('common.back')}>
          <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
        </button>
        <h1 className="text-lg font-medium text-[#0E0636]">{t('offers.title')}</h1>
      </div>

      <div className="border flex h-11 relative border-[#666F8B33] p-1 rounded-xl mb-12">
        <div
          className={`h-9 bg-[#0E0636] transition-all ${tab === 'received' ? 'left-1' : 'left-[51%]'} absolute w-[48%] rounded-lg`}
        />

        <button
          type="button"
          onClick={() => setTab('received')}
          className={`z-10 cursor-pointer text-sm flex items-center gap-1.5 justify-center flex-1 ${tab === 'received' ? 'text-white' : 'text-[#666F8B]'}`}
        >
          <p>{t('offers.received')}</p>
        </button>

        <button
          type="button"
          onClick={() => setTab('sent')}
          className={`z-10 cursor-pointer text-sm flex items-center gap-1.5 justify-center flex-1 ${tab === 'sent' ? 'text-white' : 'text-[#666F8B]'}`}
        >
          <p>{t('offers.sent')}</p>
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#666F8B]">{t('offers.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-[#DA0909]">{t('offers.failed')}</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-[#666F8B]">{t('offers.empty')}</p>
      ) : (
        <div className="space-y-6">
          {offers.map((offer) => {
            const isSent = offer.direction === 'sent'
            const userPic = '/white-man.jpg'
            const fullName = isSent ? displayHandle(offer.toUser) : displayHandle(offer.fromUser)

            return (
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
                className={`border ${offer.status === "Pending" || ( offer.status === "Accepted" && offer.direction === "sent" ) ? "bg-[#F5F7FB]" : "bg-white"} border-[#666F8B33] rounded-2xl p-3  ${offer.assetId ? 'cursor-pointer hover:bg-[#6B6AFD0D] transition-colors' : ''
                  }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-2">
                    <img src={userPic} alt="" className="w-12 h-12 rounded-xl object-cover border border-[#666F8B33]" />
                    <div className='mt-1.5'>
                      <p className="text-sm font-medium text-[#0E0636] leading-none">{fullName}</p>
                      <p className="text-[10px] text-[#666F8B] mt-2.5"><span className='font-semibold text-xs'>{offer.amount}</span> {getUsdPrice(offer.amount)} USD</p>
                    </div>
                  </div>
                  <span className={`text-[8px] mt-1.5 px-2 py-1 rounded-full font-medium ${offer.status === 'Accepted' ? 'bg-[#6B6AFD0D] text-[#6B6AFD]' :
                    offer.status === 'Rejected' || offer.status === 'Cancelled' ? 'bg-[#F9002D0D] text-[#F9002D]' :
                      'bg-[#FF8E001A] text-[#FF8E00]'
                    }`}>
                    {offer.status}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="" onClick={(e) => e.stopPropagation()}>
                  {offer.direction === 'received' && offer.status === 'Pending' && (
                    <div className="flex gap-2 mt-4">

                      <button
                        onClick={() => handleAction('decline', offer.id)}
                        className="flex-1 border border-[#6B6AFD] text-[#6B6AFD] py-2.5 rounded-lg text-xs font-semibold hover:bg-[#DA09090D] transition-colors"
                      >
                        {t('offers.decline')}
                      </button>
                      <button
                        onClick={() => handleAction('accept', offer.id)}
                        className="flex-1 bg-[#6B6AFD] text-white py-2.5 rounded-lg text-xs font-semibold hover:bg-[#5856D6] transition-colors"
                      >
                        {t('offers.accept')}
                      </button>
                    </div>
                  )}

                  {offer.direction === 'sent' && offer.status === 'Pending' && (
                    <button
                      onClick={() => handleAction('cancel', offer.id)}
                      className="w-full bg-white mt-4 border border-[#666F8B33] text-[#666F8B] py-2.5 rounded-lg text-xs font-medium hover:bg-[#666F8B0D] transition-colors"
                    >
                      {t('offers.cancel')}
                    </button>
                  )}

                  {offer.direction === 'sent' && offer.status === 'Accepted' && offer.assetId && (
                    <button
                      onClick={() => navigate(`/asset/${offer.assetId}`)}
                      className="w-full bg-[#6B6AFD] text-white mt-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-[#5856D6] transition-colors"
                    >
                      {t('offers.complete')}
                    </button>
                  )}

                  {offer.direction === 'sent' && offer.status === 'Rejected' && (
                    <button
                      onClick={() => {
                        if (offer.assetId) navigate(`/asset/${offer.assetId}`)
                      }}
                      className="w-full mt-4 border border-[#666F8B33] text-[#666F8B] py-2.5 rounded-lg text-xs font-medium hover:bg-[#666F8B0D] transition-colors"
                    >
                      {t('offers.re_offer')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Offers
