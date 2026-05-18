import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTonAddress } from '@tonconnect/ui-react'
import { useTelegram } from '../contexts/TelegramContext'
import { userClient } from '../services/user'

const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
const IS_TESTNET = meta.env?.VITE_TON_NETWORK === 'testnet'
const TON_API_BASE = IS_TESTNET ? 'https://testnet.tonapi.io' : 'https://tonapi.io'

/** Matches server STARS_PER_TON_NUM: 1,000 ★ = 0.01 TON */
const STARS_PER_TON = 100_000

const Swap = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { user } = useTelegram()
    const tonFriendly = useTonAddress()
    const tonRaw = useTonAddress(false)
    const [activeTab, setActiveTab] = useState<'stars' | 'crypto'>('stars')
    const [fromAmount, setFromAmount] = useState('')
    const [tonBalance, setTonBalance] = useState<string | null>(null)
    const [swapMessage, setSwapMessage] = useState('')

    const usernameForApi = user?.username ? `@${user.username}` : ''
    const walletForApi = (tonRaw || tonFriendly || '').trim()

    const { data: profile } = useQuery({
        queryKey: ['user-profile', usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () => userClient.getProfileStats(usernameForApi, user?.id, walletForApi || undefined),
        staleTime: 10_000,
    })

    const starsNumeric = profile?.stars ?? 0
    const starsFormatted = starsNumeric.toLocaleString()

    const fetchTonBal = useCallback(async () => {
        if (!tonRaw) {
            setTonBalance(null)
            return
        }
        try {
            const res = await fetch(`${TON_API_BASE}/v2/accounts/${encodeURIComponent(tonRaw)}`)
            const data = await res.json()
            if (data?.balance !== undefined) {
                setTonBalance((Number(data.balance) / 1e9).toFixed(4))
            }
        } catch {
            setTonBalance(null)
        }
    }, [tonRaw])

    useEffect(() => {
        void fetchTonBal()
    }, [fetchTonBal])

    const cryptoSymbol = 'TON'
    const cryptoBalance = tonBalance ?? '0.0000'

    const fromBalance =
        activeTab === 'stars' ? `${starsFormatted} Stars` : `${cryptoBalance} ${cryptoSymbol}`

    const toAmount = fromAmount
        ? activeTab === 'stars'
            ? (parseFloat(fromAmount) / STARS_PER_TON).toFixed(5)
            : (parseFloat(fromAmount) * STARS_PER_TON).toFixed(0)
        : '0.00'

    const toLabel = activeTab === 'stars' ? cryptoSymbol : 'Stars'

    const swapMut = useMutation({
        mutationFn: () => {
            const amt = Math.floor(parseFloat(fromAmount))
            if (!Number.isFinite(amt) || amt < 1) {
                return Promise.reject(new Error('Enter a valid Stars amount (whole number).'))
            }
            if (amt > starsNumeric) {
                return Promise.reject(new Error('Amount exceeds your Stars balance.'))
            }
            return userClient.swapStarsToTon({
                amountStars: amt,
                telegramId: user?.id,
                username: user?.username,
                walletAddress: walletForApi || undefined,
            })
        },
        onSuccess: (res) => {
            setSwapMessage(res.message || 'Swap completed.')
            setFromAmount('')
            void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
            void queryClient.invalidateQueries({ queryKey: ['user-home'] })
        },
        onError: (err: Error) => {
            setSwapMessage(err.message || 'Swap failed.')
        },
    })

    const tonConnected = !!tonFriendly || !!tonRaw
    const canPreviewStarsToTon =
        activeTab === 'stars' &&
        !!fromAmount &&
        parseFloat(fromAmount) >= 1 &&
        tonConnected &&
        Math.floor(parseFloat(fromAmount)) <= starsNumeric

    const handlePreview = () => {
        setSwapMessage('')
        if (activeTab === 'crypto') {
            setSwapMessage('TON → Stars is not available yet. Use Stars → TON.')
            return
        }
        swapMut.mutate()
    }

    return (
        <div className="p-6 min-h-screen bg-white">
            <button type="button" onClick={() => navigate(-1)}>
                <img className="w-6 cursor-pointer h-6" src="/arrow-left.svg" alt="" />
            </button>
            <h2 className="py-6 text-xl mb-6 font-medium text-[#0E0636] border-b border-[#666F8B33]">Swap</h2>

            <div className="border flex h-11 relative border-[#666F8B33] p-1 rounded-xl">
                <div
                    className={`h-9 bg-[#0E0636] transition-all ${activeTab === 'stars' ? 'left-1' : 'left-[51%]'} absolute w-[48%] rounded-lg`}
                />

                <button
                    type="button"
                    onClick={() => setActiveTab('stars')}
                    className={`z-10 cursor-pointer flex items-center gap-1.5 justify-center flex-1 ${activeTab === 'stars' ? 'text-white' : 'text-[#666F8B]'}`}
                >
                    <p>Stars</p>
                    <img
                        className={activeTab === 'stars' ? 'filter brightness-0 invert' : ''}
                        src="/arrow-right-full.svg"
                        alt=""
                    />
                    <p>TON</p>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('crypto')}
                    className={`z-10 cursor-pointer flex items-center gap-1.5 justify-center flex-1 ${activeTab === 'crypto' ? 'text-white' : 'text-[#666F8B]'}`}
                >
                    <p>TON</p>
                    <img
                        className={activeTab === 'crypto' ? 'filter brightness-0 invert' : ''}
                        src="/arrow-right-full.svg"
                        alt=""
                    />
                    <p>Stars</p>
                </button>
            </div>

            <div className="relative">
                <div className="bg-[#6B6AFD] rounded-3xl py-5 px-3 mt-8">
                    <div className="flex justify-between items-start">
                        <p className="text-sm text-white">From</p>
                        <div className="bg-white flex gap-1 items-center justify-center rounded-full px-3 h-[21px] max-w-[70%]">
                            <p className="text-[10px] font-medium text-[#6B6AFD] truncate">Balance: {fromBalance}</p>
                            {activeTab === 'stars' && <img src="/star.svg" className="w-3 h-3 -translate-y-px shrink-0" alt="" />}
                        </div>
                    </div>
                    <input
                        className="text-[32px] text-white pt-2 bg-transparent outline-none w-full placeholder:text-white/50"
                        type="number"
                        min={0}
                        step={activeTab === 'stars' ? 1 : 'any'}
                        placeholder="0.00"
                        value={fromAmount}
                        onChange={e => setFromAmount(e.target.value)}
                    />
                    <p className="font-light text-sm text-white">{activeTab === 'stars' ? 'Stars' : cryptoSymbol}</p>
                </div>

                <button
                    type="button"
                    onClick={() => setActiveTab(t => (t === 'stars' ? 'crypto' : 'stars'))}
                    className="absolute cursor-pointer left-1/2 -translate-x-1/2 top-[112px] w-12 h-12 rounded-xl flex items-center justify-center border-2 border-[#6B6AFD] bg-white z-10"
                >
                    <img className="w-6 h-6" src="/arrow-3.svg" alt="" />
                </button>

                <div className="bg-[#6B6AFD] rounded-3xl py-5 px-3 mt-4">
                    <div className="flex justify-between items-start">
                        <p className="text-sm text-white">To</p>
                        <div className="bg-white flex gap-1 items-center justify-center rounded-full px-3 h-[21px]">
                            <p className="text-[10px] font-medium text-[#6B6AFD]">Estimated</p>
                        </div>
                    </div>
                    <p className="text-[32px] text-white pt-2">{toAmount}</p>
                    <p className="font-light text-sm text-white">{toLabel}</p>
                </div>
            </div>

            <div className="border-t border-[#666F8B33] mt-6 pt-6">
                <p className="font-medium text-sm text-[#0E0636] pb-6">Exchange Rates</p>
                <div className="border border-[#666F8B33] rounded-lg pt-4">
                    <div className="flex justify-between px-[13px]">
                        <p className="font-medium text-xs text-[#666F8B]">
                            1,000 <img className="inline -translate-y-px" src="/stargray.svg" alt="" />
                        </p>
                        <p className="font-semibold text-xs text-[#666F8B]">= 0.01 {cryptoSymbol}</p>
                    </div>
                    <p className="text-end font-light text-[10px] pr-[13px] text-[#666F8B] pt-2">
                        In-app Stars balance · Refreshes when you open this screen
                    </p>
                    <div className="border-t flex p-3 mt-4 justify-between border-[#666F8B33]">
                        <p className="font-medium text-xs text-[#666F8B]">Platform Fee (0.5%)</p>
                        <p className="font-medium text-xs text-[#666F8B]">
                            {fromAmount ? (parseFloat(fromAmount) * 0.005).toFixed(2) : '0'}{' '}
                            <img className="inline -translate-y-px" src="/stargray.svg" alt="" />
                        </p>
                    </div>
                </div>
            </div>

            <p className="text-[11px] text-[#666F8B] mt-4 leading-relaxed">
                Stars → TON updates your in-app Stars balance. Receiving TON in your wallet still requires a separate
                transfer or future custodial payout.
            </p>

            {!tonConnected && (
                <p className="text-center text-xs text-[#DA0909] mt-4">Connect a TON wallet to confirm swap.</p>
            )}

            {!!swapMessage && (
                <p className={`text-center text-xs mt-3 ${swapMessage.includes('fail') || swapMessage.includes('not available') ? 'text-[#DA0909]' : 'text-[#0C8F4F]'}`}>
                    {swapMessage}
                </p>
            )}

            <button
                type="button"
                disabled={!canPreviewStarsToTon || swapMut.isPending}
                onClick={handlePreview}
                className="w-full mt-6 border font-semibold text-sm text-[#6B6AFD] rounded-lg border-[#6B6AFD] h-11 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {swapMut.isPending ? 'Processing…' : activeTab === 'crypto' ? 'Coming soon' : 'Confirm swap'}
            </button>
        </div>
    )
}

export default Swap
