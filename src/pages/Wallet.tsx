import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import Modal from '../components/Modal'

// TON Connect
import { useTonConnectUI, useTonAddress, useTonWallet } from '@tonconnect/ui-react'

// Collection deployment
import {
    getCollectionAddress,
} from '../utils/tonCollection'
import { useTelegram } from '../contexts/TelegramContext'
import { userClient } from '../services/user'
import { useLanguage } from '../contexts/LanguageContext'

type TxStatus = 'idle' | 'loading' | 'success' | 'error'

// Network-aware constants
const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
const IS_TESTNET = meta.env?.VITE_TON_NETWORK === 'testnet'
const TON_API_BASE = IS_TESTNET ? 'https://testnet.tonapi.io' : 'https://tonapi.io'
const TON_EXPLORER = IS_TESTNET ? 'https://testnet.tonscan.org' : 'https://tonscan.org'

interface TonEvent {
    event_id: string
    timestamp: number
    actions: Array<{
        type: string
        status: string
        TonTransfer?: { sender: { address: string }; recipient: { address: string }; amount: number; comment?: string }
        NftItemTransfer?: { sender?: { address: string }; recipient?: { address: string }; nft: string }
        SmartContractExec?: { executor: { address: string }; contract: { address: string }; ton_attached: number }
        ContractDeploy?: { address: string; interfaces: string[] }
    }>
    is_scam: boolean
    lt: number
    in_progress: boolean
}

/** Telegram Stars checkout can fail on Desktop/Web; mobile usually works once the bot webhook answers pre_checkout_query. */
function starsTopUpPlatformHint(platform?: string): string | null {
    if (!platform) return null
    const p = platform.toLowerCase()
    if (p === 'ios' || p === 'android') return null
    return 'On some Telegram Desktop/Web builds, Stars checkout is limited. If payment still fails on phone after redeploying the API, check the bot webhook in @BotFather points to your server.'
}

const Wallet = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { t } = useLanguage()
    const { user: tgUser, webApp, isInTelegram, reportAccessBlock } = useTelegram()
    const starsCheckoutHint = starsTopUpPlatformHint(webApp?.platform)

    // ── TON ──────────────────────────────────────────────
    const [tonConnectUI] = useTonConnectUI()
    const tonAddress = useTonAddress()
    const tonRawAddress = useTonAddress(false)
    const tonWallet = useTonWallet()
    const tonConnected = !!tonWallet

    const [tonBalance, setTonBalance] = useState<string | null>(null)
    const [tonBalanceLoading, setTonBalanceLoading] = useState(false)
    const [tonEvents, setTonEvents] = useState<TonEvent[]>([])
    const [eventsLoading, setEventsLoading] = useState(false)

    const usernameForStars = tgUser?.username ? `@${tgUser.username}` : ''
    const walletForStarsApi = (tonRawAddress || tonAddress || '').trim()
    const { data: starsPanel } = useQuery({
        queryKey: ['user-profile', usernameForStars, tgUser?.id ?? 0, walletForStarsApi],
        queryFn: () =>
            userClient.getProfileStats(usernameForStars, tgUser?.id, walletForStarsApi || undefined),
        staleTime: 10_000,
    })
    const starsBalanceLabel = (starsPanel?.stars ?? 0).toLocaleString()

    // ── Modals ───────────────────────────────────────────
    const [depositModalOpen, setDepositModalOpen] = useState(false)
    const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
    const [starsModalOpen, setStarsModalOpen] = useState(false)
    const [starsTopupAmount, setStarsTopupAmount] = useState('100')
    const [starsTopupMsg, setStarsTopupMsg] = useState('')
    const [txResultModal, setTxResultModal] = useState(false)

    // ── Withdraw form ─────────────────────────────────────
    const [withdrawAddress, setWithdrawAddress] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [withdrawStatus, setWithdrawStatus] = useState<TxStatus>('idle')
    const [withdrawTxHash, setWithdrawTxHash] = useState('')
    const [withdrawError, setWithdrawError] = useState('')

    const [lastSyncedTon, setLastSyncedTon] = useState<string>('')

    // ── Fetch TON balance ─────────────────────────────────
    const fetchTonBalance = useCallback(async () => {
        if (!tonRawAddress) return
        setTonBalanceLoading(true)
        try {
            const res = await fetch(`${TON_API_BASE}/v2/accounts/${encodeURIComponent(tonRawAddress)}`)
            const data = await res.json()
            if (data?.balance !== undefined) {
                setTonBalance((Number(data.balance) / 1e9).toFixed(3))
            }
        } catch {
            setTonBalance(null)
        } finally {
            setTonBalanceLoading(false)
        }
    }, [tonRawAddress])

    // ── Fetch TON transaction history ─────────────────────
    const fetchTonEvents = useCallback(async () => {
        if (!tonRawAddress) return
        setEventsLoading(true)
        try {
            const res = await fetch(
                `${TON_API_BASE}/v2/accounts/${encodeURIComponent(tonRawAddress)}/events?limit=10&subject_only=false`
            )
            const data = await res.json()
            if (Array.isArray(data?.events)) {
                setTonEvents(data.events)
            }
        } catch {
            // silently fail — user sees empty list
        } finally {
            setEventsLoading(false)
        }
    }, [tonRawAddress])

    useEffect(() => {
        if (tonConnected && tonRawAddress) {
            fetchTonBalance()
            fetchTonEvents()
        } else {
            setTonBalance(null)
            setTonEvents([])
        }
    }, [tonConnected, tonRawAddress, fetchTonBalance, fetchTonEvents])

    useEffect(() => {
        if (!tonConnected || !tonRawAddress) return
        if (lastSyncedTon === tonRawAddress) return

        void userClient
            .syncSession({
                telegramId: tgUser?.id,
                firstName: tgUser?.first_name,
                lastName: tgUser?.last_name,
                username: tgUser?.username,
                photoUrl: tgUser?.photo_url,
                languageCode: tgUser?.language_code,
                walletAddress: tonRawAddress,
                walletType: 'TON',
            })
            .then(() => {
                setLastSyncedTon(tonRawAddress)
            })
            .catch((err) => {
                reportAccessBlock(err)
            })
    }, [tonConnected, tonRawAddress, lastSyncedTon, tgUser, reportAccessBlock])

    // ── Resume from wallet: refresh when app comes back into view ──────
    const [pendingTxBanner, setPendingTxBanner] = useState(false)
    useEffect(() => {
        const PENDING_KEY = 'tg_nft_pending_tx'
        const handleResume = () => {
            const pending = localStorage.getItem(PENDING_KEY)
            if (pending) {
                setPendingTxBanner(true)
                localStorage.removeItem(PENDING_KEY)
                setTimeout(() => {
                    fetchTonBalance()
                    fetchTonEvents()
                }, 2500)
                setTimeout(() => setPendingTxBanner(false), 8000)
            } else if (tonConnected && tonRawAddress) {
                fetchTonBalance()
                fetchTonEvents()
            }
        }
        window.addEventListener('focus', handleResume)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') handleResume()
        })
        return () => {
            window.removeEventListener('focus', handleResume)
        }
    }, [fetchTonBalance, fetchTonEvents, tonConnected, tonRawAddress])

    const [copied, setCopied] = useState(false)

    // ── Helpers ───────────────────────────────────────────
    const copyToClipboard = (text: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text)
                return
            }
        } catch {
            // ignore and fallback
        }
        if (webApp?.showAlert) {
            webApp.showAlert(`Copy this address:\n${text}`)
        } else {
            window.prompt('Copy this address', text)
        }
    }
    const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

    // ── Withdraw handler ──────────────────────────────────
    const handleWithdraw = async () => {
        if (!withdrawAddress.trim() || !withdrawAmount || isNaN(parseFloat(withdrawAmount))) return
        setWithdrawStatus('loading')
        setWithdrawError('')
        try {
            const nanotons = Math.floor(parseFloat(withdrawAmount) * 1e9)
            if (nanotons <= 0) throw new Error('Amount too low')
            localStorage.setItem('tg_nft_pending_tx', JSON.stringify({
                type: 'withdraw',
                amount: withdrawAmount,
                to: withdrawAddress.trim(),
                time: Date.now(),
            }))
            const result = await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 360,
                messages: [{
                    address: withdrawAddress.trim(),
                    amount: nanotons.toString(),
                }],
            })
            localStorage.removeItem('tg_nft_pending_tx')
            setWithdrawTxHash(result.boc ?? '')
            setWithdrawStatus('success')
            setWithdrawModalOpen(false)
            setTxResultModal(true)
            setWithdrawAddress('')
            setWithdrawAmount('')
            setTimeout(() => { fetchTonBalance(); fetchTonEvents() }, 3000)
        } catch (err: any) {
            localStorage.removeItem('tg_nft_pending_tx')
            setWithdrawStatus('error')
            setWithdrawError(
                err?.message?.includes('User declined')
                    ? 'Transaction cancelled by user.'
                    : err?.message ?? 'Transaction failed. Try again.'
            )
        }
    }

    const resetWithdraw = () => {
        setWithdrawStatus('idle')
        setWithdrawError('')
    }

    // ─────────────────────────────────────────────────────
    return (
        <div className="px-3 pb-28">

            {/* Transaction sent banner */}
            {pendingTxBanner && (
                <div className="mb-3 flex items-center gap-3 bg-green-900/40 border border-green-500/40 rounded-2xl px-4 py-3">
                    <span className="text-xl">✅</span>
                    <div>
                        <p className="text-green-400 font-semibold text-sm">{t('wallet.tx_sent_banner')}</p>
                        <p className="text-green-300/70 text-xs">{t('wallet.tx_sent_sub')}</p>
                    </div>
                </div>
            )}

            {/* ═══════════ TON WALLET CARD ═══════════ */}
            {tonConnected ? (
                <div className="bg-[#6B6AFD] rounded-3xl py-5 px-3">
                    <div className="flex justify-between items-start">
                        <div className="border-[#DAD8FF33] flex items-center gap-1.5 px-2 py-1 border rounded-lg bg-[#FFFFFF1A]">
                            <img src="/ton.jpg" className="w-4 h-4 rounded-sm" alt="" />
                            <p className="text-white font-medium text-xs">TON</p>
                        </div>
                        <button onClick={() => setStarsModalOpen(true)} className="bg-white flex gap-1 items-center justify-center rounded-full px-3 h-[21px]">
                            <img src="/star.svg" className="w-3 h-3" alt="" />
                            <p className="text-[10px] font-medium text-[#6B6AFD]">{starsBalanceLabel}</p>
                        </button>
                    </div>

                    <p className="text-sm text-white pt-6">{t('wallet.total_balance')}</p>
                    <p className="text-[32px] text-white pt-1 font-medium">
                        {tonBalanceLoading ? (
                            <span className="text-2xl opacity-70">{t('wallet.loading')}</span>
                        ) : tonBalance !== null ? (
                            `${tonBalance} TON`
                        ) : '— TON'}
                    </p>

                    <div className="pt-2 flex items-center gap-2">
                        <p className="font-mono text-sm text-[#86efac]">{shortAddress(tonAddress)}</p>
                        <button onClick={() => {
                            copyToClipboard(tonAddress)
                            setCopied(true)
                        }} title="Copy address">
                            <img src={copied ? "/copy-active.svg" : "/copy.svg"} className="w-4 h-4 opacity-80" alt="" />
                        </button>
                        <button onClick={() => { fetchTonBalance(); fetchTonEvents() }} className="ml-auto" title="Refresh">
                            <img src="/refresh-2.svg" className="w-3.5 h-3.5 opacity-70" alt="" />
                        </button>
                    </div>

                    <div className="flex gap-[9px] pt-8">
                        <button onClick={() => setDepositModalOpen(true)} className="flex-1 bg-black text-white rounded-full h-10 text-sm font-semibold">{t('wallet.deposit')}</button>
                        <button onClick={() => { resetWithdraw(); setWithdrawModalOpen(true) }} className="flex-1 rounded-full h-10 text-sm font-semibold bg-white text-[#0E063699]">{t('wallet.withdraw')}</button>
                        <button onClick={() => navigate('/swap')} className="flex-1 rounded-full h-10 text-sm font-semibold bg-white text-[#0E063699]">{t('wallet.swap')}</button>
                    </div>
                </div>
            ) : (
                <div className="bg-[#6B6AFD] rounded-3xl py-10 px-3 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                        <img src="/ton.jpg" className="w-10 h-10 rounded-xl" alt="" />
                    </div>
                    <p className="text-white font-semibold text-lg mb-1">{t('wallet.connect_ton')}</p>
                    <p className="text-white/70 text-sm mb-6">{t('wallet.ton_subtitle')}</p>
                    <button onClick={() => tonConnectUI.openModal()} className="bg-white text-[#6B6AFD] font-semibold text-sm rounded-xl px-8 py-3 w-full">
                        {t('wallet.connect_ton')}
                    </button>
                </div>
            )}

            {/* Recent Activity */}
            <div className="px-3 pt-10">
                <div className="flex items-center justify-between mb-4">
                    <p className="font-semibold text-xl text-[#0E0636]">{t('wallet.recent_activity')}</p>
                    {tonConnected && (
                        <button
                            onClick={() => { fetchTonBalance(); fetchTonEvents() }}
                            className="text-xs text-[#6B6AFD] flex items-center gap-1"
                        >
                            <img src="/refresh-2.svg" className="w-3.5 h-3.5" alt="" />
                            {t('wallet.refresh')}
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {!tonConnected ? (
                        <div className='bg-[#F5F7FB] gap-3 flex flex-col items-center rounded-[20px] py-6'>
                            <img src="/transaction.svg" className='w-12 h-12' alt="" />
                            <div className='text-center'>
                                <p className='font-semibold text-[#666F8B] text-xs'>{t('wallet.no_activity')}</p>
                            </div>
                            <button className='rounded-lg border border-[#666F8B33] w-[214px] font-medium text-xs h-10 text-[#666F8B]'>{t('wallet.make_first_tx')}</button>
                        </div>
                    ) : eventsLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-[#6B6AFD33] border-t-[#6B6AFD] rounded-full animate-spin" />
                        </div>
                    ) : tonEvents.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-[#666F8B] text-sm">{t('wallet.no_transactions')}</p>
                            <a href={`${TON_EXPLORER}/address/${tonAddress}`} target="_blank" rel="noreferrer" className="text-[#6B6AFD] text-xs mt-1 block">
                                {t('wallet.view_explorer')}
                            </a>
                        </div>
                    ) : (
                        tonEvents.map(event => {
                            if (!event.actions?.length) return null

                            const priorityOrder = ['ContractDeploy', 'NftItemTransfer', 'SmartContractExec', 'NftMint', 'TonTransfer']
                            const action = event.actions.sort(
                                (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
                            )[0]

                            let label = 'Transaction'
                            let amount = ''
                            let isIncoming = false
                            let icon = '/export.svg'

                            if (action.type === 'ContractDeploy') {
                                label = '📦 Collection Deployed'
                                amount = '-0.050 TON'
                                icon = '/export.svg'
                            } else if (action.type === 'SmartContractExec' && action.SmartContractExec) {
                                const sc = action.SmartContractExec
                                const tonAmt = (sc.ton_attached / 1e9).toFixed(3)
                                label = '🎨 NFT Minted'
                                amount = `-${tonAmt} TON`
                                icon = '/export.svg'
                            } else if (action.type === 'NftItemTransfer') {
                                label = '🖼 NFT Transfer'
                                icon = '/import.svg'
                            } else if (action.type === 'TonTransfer' && action.TonTransfer) {
                                const tt = action.TonTransfer
                                const amountTon = (tt.amount / 1e9).toFixed(3)
                                isIncoming = tt.recipient.address === tonRawAddress
                                label = isIncoming ? '⬇️ Received TON' : '⬆️ Sent TON'
                                amount = isIncoming ? `+${amountTon} TON` : `-${amountTon} TON`
                                icon = isIncoming ? '/import.svg' : '/export.svg'
                            } else {
                                label = action.type.replace(/([A-Z])/g, ' $1').trim()
                            }

                            const timeAgo = (() => {
                                const diff = Math.floor(Date.now() / 1000) - event.timestamp
                                if (diff < 60) return `${diff}s ago`
                                if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                                if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
                                return `${Math.floor(diff / 86400)}d ago`
                            })()

                            return (
                                <a
                                    key={event.event_id}
                                    href={`${TON_EXPLORER}/tx/${event.event_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="bg-[#6B6AFD0D] p-1.5 rounded-xl flex justify-between items-center no-underline"
                                >
                                    <div className="flex gap-2 items-center">
                                        <div className="w-9 h-9 rounded-lg bg-white/60 border border-[#6B6AFD22] flex items-center justify-center">
                                            <img className="w-4 h-4" src={icon} alt="" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-xs text-[#0E0636]">{label}</p>
                                            <p className="text-[10px] font-light text-[#0E063699]">{timeAgo}</p>
                                        </div>
                                    </div>
                                    {amount && (
                                        <p className={`text-xs font-semibold pr-1 ${isIncoming ? 'text-[#22c55e]' : 'text-[#0E063699]'}`}>
                                            {amount}
                                        </p>
                                    )}
                                </a>
                            )
                        })
                    )}
                    {tonEvents.length > 0 && (
                        <a
                            href={`${TON_EXPLORER}/address/${tonAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-center text-[#6B6AFD] text-xs pt-2"
                        >
                            {t('wallet.view_all_explorer')}
                        </a>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <p className="font-semibold pl-3 text-xl pt-12 pb-6 text-[#0E0636]">{t('wallet.quick_actions')}</p>
            <div className="flex gap-3.5 px-3">
                <button onClick={() => navigate('/swap')} className="bg-[#6B6AFD0D] flex-1 rounded-[20px] flex flex-col items-center py-[21px]">
                    <img className="w-6 h-6" src="/refresh-circle.svg" alt="" />
                    <p className="text-xs pt-[9px] font-medium text-[#6B6AFD] text-center">{t('wallet.swap_stars')}</p>
                </button>
                <button onClick={() => tonConnectUI.openModal()} className="bg-[#6B6AFD0D] flex-1 rounded-[20px] flex flex-col items-center py-[21px]">
                    <img className="w-6 h-6" src="/wallet-add.svg" alt="" />
                    <p className="text-xs pt-[9px] font-medium text-center text-[#6B6AFD]">
                        {tonConnected ? t('wallet.switch_wallet') : 'Connect TON'}
                    </p>
                </button>
                {tonConnected && (
                    <button onClick={() => tonConnectUI.disconnect()} className="bg-[#DA09091A] flex-1 rounded-[20px] flex flex-col items-center py-[21px]">
                        <img className="w-6 h-6" src="/frame.svg" alt="" />
                        <p className="text-xs pt-[9px] font-medium text-[#DA0909] text-center">{t('common.disconnect')}</p>
                    </button>
                )}
            </div>

            {/* ═══════════ DEPOSIT MODAL ═══════════ */}
            <Modal
                className="bottom-0 absolute w-screen m-0 rounded-b-none"
                position="bottom"
                animation="slide-up"
                isOpen={depositModalOpen}
                onClose={() => setDepositModalOpen(false)}
            >
                <h2 className="text-center font-semibold text-xl text-[#0E0636]">{t('wallet.deposit_title')}</h2>
                <p className="pt-3 text-[#666F8B] mx-auto text-center text-sm max-w-[280px]">
                    {t('wallet.deposit_scan')} TON {t('wallet.deposit_receive')}
                </p>

                <div className="my-8 flex items-center justify-center mx-auto w-[190px] h-[190px] rounded-3xl bg-[#F5F7FB] p-4">
                    {tonConnected && tonAddress ? (
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tonAddress)}&bgcolor=F5F7FB&color=0E0636&margin=0`}
                            className="w-full h-full rounded-xl"
                            alt="Wallet QR Code"
                        />
                    ) : (
                        <p className="text-[#666F8B] text-xs text-center">{t('wallet.connect_first')}</p>
                    )}
                </div>

                {tonConnected && tonAddress && (
                    <div className="flex flex-col gap-3">
                        <div className="border border-[#6B6AFD] rounded-xl px-4 py-3 bg-[#6B6AFD0D]">
                            <p className="text-[#6B6AFD] text-xs font-mono break-all">{tonAddress}</p>
                        </div>
                        <button
                            onClick={() => { copyToClipboard(tonAddress) }}
                            className="bg-[#6B6AFD] text-white text-sm rounded-xl h-[45px] flex items-center justify-center gap-2 font-semibold"
                        >
                            {t('wallet.copy_address')}
                            <img src="/copy.svg" className="w-4 h-4 brightness-0 invert" alt="" />
                        </button>
                    </div>
                )}
            </Modal>

            {/* ═══════════ WITHDRAW MODAL ═══════════ */}
            <Modal
                className="bottom-0 absolute w-screen m-0 rounded-b-none"
                position="bottom"
                animation="slide-up"
                isOpen={withdrawModalOpen}
                onClose={() => setWithdrawModalOpen(false)}
            >
                <h2 className="text-center font-semibold text-xl text-[#0E0636]">{t('wallet.withdraw_title')}</h2>
                <p className="pt-3 pb-6 text-[#666F8B] mx-auto text-center text-sm">
                    Send TON to any wallet address.
                </p>

                <label className="text-sm font-medium text-[#0E0636]">{t('wallet.recipient')}</label>
                <div className={`bg-[#6B6AFD0D] mt-2 mb-5 flex items-center rounded-xl gap-2 border pl-4 h-[52px] ${withdrawAddress ? 'border-[#6B6AFD]' : 'border-[#666F8B33]'}`}>
                    <img className="w-5 h-5" src="/wallet-2.svg" alt="" />
                    <input
                        className="placeholder:text-[#6B6AFD99] outline-none bg-transparent h-full flex-1 text-sm"
                        type="text"
                        placeholder="Enter wallet address..."
                        value={withdrawAddress}
                        onChange={e => setWithdrawAddress(e.target.value)}
                    />
                </div>

                <label className="text-sm font-medium text-[#0E0636]">{t('wallet.amount')}</label>
                <div className={`mt-2 mb-2 flex items-center rounded-xl gap-2 border pl-4 h-[52px] ${withdrawAmount ? 'border-[#6B6AFD]' : 'border-[#666F8B33]'}`}>
                    <img className="w-5 h-5 rounded" src="/ton.jpg" alt="" />
                    <input
                        className="placeholder:text-[#666F8B99] outline-none bg-transparent h-full flex-1 text-sm"
                        type="number"
                        placeholder="0.00"
                        value={withdrawAmount}
                        onChange={e => setWithdrawAmount(e.target.value)}
                    />
                    <button
                        onClick={() => setWithdrawAmount(tonBalance ?? '0')}
                        className="text-[10px] font-semibold text-[#6B6AFD] pr-4"
                    >
                        MAX
                    </button>
                </div>

                <p className="text-xs text-[#666F8B] mb-1">
                    {t('wallet.available')} {tonBalance ?? '0'} TON
                </p>
                <p className="text-xs text-[#666F8B]">
                    {t('wallet.gas_fee')} ~0.005 TON
                </p>

                {withdrawError && (
                    <div className="mt-3 bg-[#DA09091A] border border-[#DA090933] rounded-xl px-4 py-3">
                        <p className="text-[#DA0909] text-xs">{withdrawError}</p>
                    </div>
                )}

                <button
                    onClick={handleWithdraw}
                    disabled={!withdrawAddress.trim() || !withdrawAmount || withdrawStatus === 'loading'}
                    className="mt-5 w-full bg-[#6B6AFD] text-white text-sm font-semibold rounded-xl h-[48px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {withdrawStatus === 'loading' ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {t('wallet.sending')}
                        </>
                    ) : t('wallet.review_send')}
                </button>
            </Modal>

            {/* ═══════════ TX SUCCESS MODAL ═══════════ */}
            <Modal isOpen={txResultModal} onClose={() => setTxResultModal(false)}>
                <div className="text-center py-2">
                    <div className="w-16 mx-auto h-16 flex items-center justify-center rounded-full bg-green-100 mb-4">
                        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <p className="text-xl font-semibold text-[#0E0636]">{t('wallet.tx_success_title')}</p>
                    <p className="text-sm text-[#666F8B] pt-2 pb-4">{t('wallet.tx_broadcast')}</p>

                    {withdrawTxHash && (
                        <div className="bg-[#F5F7FB] rounded-xl px-4 py-3 mb-4">
                            <p className="text-[10px] text-[#666F8B] mb-1">{t('wallet.tx_reference')}</p>
                            <p className="text-xs font-mono text-[#0E0636] break-all">{withdrawTxHash.slice(0, 40)}...</p>
                        </div>
                    )}

                    <a
                        href={`${TON_EXPLORER}/address/${tonAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full h-11 border border-[#6B6AFD] text-[#6B6AFD] text-sm font-semibold rounded-xl flex items-center justify-center mb-3"
                    >
                        {t('wallet.view_explorer')}
                    </a>
                    <button
                        onClick={() => setTxResultModal(false)}
                        className="w-full h-11 bg-[#6B6AFD] text-white rounded-xl text-sm font-semibold"
                    >
                        {t('wallet.done')}
                    </button>
                </div>
            </Modal>

            {/* ═══════════ STARS MODAL ═══════════ */}
            <Modal onClose={() => setStarsModalOpen(false)} isOpen={starsModalOpen}>
                <p className="text-center text-sm text-[#666F8B]">{t('wallet.stars_balance')}</p>
                <div className="flex justify-center pt-2 items-center gap-2">
                    <p className="text-[40px] font-semibold text-[#0E0636]">{starsBalanceLabel}</p>
                    <img className="w-7 h-7" src="/stardark.svg" alt="" />
                </div>
                <p className="pt-1 text-[#666F8B] text-center text-sm">
                    Synced with your in-app balance (credits when you pay via Telegram Stars invoice).
                </p>
                {starsCheckoutHint ? (
                    <p className="mt-2 text-[11px] text-[#666F8B] text-center leading-snug">{starsCheckoutHint}</p>
                ) : null}
                <div className="mt-5">
                    <label className="block text-xs text-[#666F8B] mb-1">{t('wallet.topup_amount')}</label>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={starsTopupAmount}
                        onChange={(e) => setStarsTopupAmount(e.target.value)}
                        className="w-full rounded-xl border border-[#666F8B33] px-3 py-2 outline-none"
                        placeholder="e.g. 100"
                    />
                    {!!starsTopupMsg && (
                        <p className={`text-xs mt-2 text-center ${starsTopupMsg.includes('fail') ? 'text-[#DA0909]' : 'text-[#0C8F4F]'}`}>
                            {starsTopupMsg}
                        </p>
                    )}
                </div>
                <div className="pt-6 flex gap-3">
                    <button onClick={() => setStarsModalOpen(false)} className="flex-1 h-11 rounded-xl text-[#6B6AFD] font-semibold text-sm border border-[#6B6AFD]">{t('wallet.close')}</button>
                    <button
                        type="button"
                        onClick={async () => {
                            setStarsTopupMsg('')
                            if (!isInTelegram || !webApp?.openInvoice) {
                                setStarsTopupMsg('Top up requires opening the Mini App inside Telegram.')
                                return
                            }
                            const amt = Math.floor(Number(starsTopupAmount))
                            if (!Number.isFinite(amt) || amt < 1) {
                                setStarsTopupMsg('Enter a valid Stars amount (>= 1).')
                                return
                            }
                            try {
                                const resp = await userClient.createStarsTopupLink({
                                    amountStars: amt,
                                    telegramId: tgUser?.id,
                                    username: tgUser?.username,
                                    walletAddress: walletForStarsApi || undefined,
                                })
                                webApp.openInvoice?.(resp.link, (status) => {
                                    if (status === 'paid') {
                                        setStarsTopupMsg('Payment successful. Syncing balance...')
                                        void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
                                        void queryClient.invalidateQueries({ queryKey: ['user-home'] })
                                    } else if (status === 'cancelled') {
                                        setStarsTopupMsg('Payment cancelled.')
                                    } else if (status === 'pending') {
                                        setStarsTopupMsg(
                                            'Payment is pending. If Stars do not appear shortly, pull to refresh or reopen the app.',
                                        )
                                        void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
                                        void queryClient.invalidateQueries({ queryKey: ['user-home'] })
                                    } else if (status === 'failed') {
                                        setStarsTopupMsg(
                                            'Checkout failed. Fix webhook: URL must be https://YOUR-API/api/telegram/webhook (same bot as Mini App). If server has TELEGRAM_WEBHOOK_SECRET, set the same secret in BotFather or remove it. Then redeploy.',
                                        )
                                    } else {
                                        setStarsTopupMsg(`Payment status: ${String(status)}`)
                                    }
                                })
                            } catch (e: any) {
                                setStarsTopupMsg(e?.message || 'Top up failed.')
                            }
                        }}
                        className="flex-1 h-11 bg-[#6B6AFD] text-white rounded-xl text-sm font-semibold"
                    >
                        {t('wallet.topup_btn')}
                    </button>
                </div>
            </Modal>
        </div>
    )
}

export default Wallet
