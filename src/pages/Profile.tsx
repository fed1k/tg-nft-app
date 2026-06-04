import { Link, useNavigate } from 'react-router'
import { useLanguage } from '../contexts/LanguageContext'
import { useQuery } from '@tanstack/react-query'
import { useTelegram } from '../contexts/TelegramContext'
import { shouldShowAdminPortalEntry } from '../utils/adminAuth'
import { useTonConnectUI, useTonAddress, useTonWallet } from '@tonconnect/ui-react'
import { useAccount, useDisconnect } from 'wagmi'
import { userClient } from '../services/user'
import { adminClient } from '../services/admin'
import { GIFTEDFORGE_DEPLOY } from '../config/giftedforgeDeploy'

const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
const SUPPORT_TELEGRAM = meta.env?.VITE_SUPPORT_TELEGRAM?.trim() || 'https://t.me/Gifted_forge_help'

const Profile = () => {
    const navigate = useNavigate()
    const { t, lang } = useLanguage()

    // Telegram user
    const { user, isInTelegram, webApp } = useTelegram()

    // TON
    const [tonConnectUI] = useTonConnectUI()
    const tonAddress = useTonAddress()
    const tonRawAddress = useTonAddress(false)
    const tonWallet = useTonWallet()
    const tonConnected = !!tonWallet

    // EVM
    const { address: evmAddress, isConnected: evmConnected, chain } = useAccount()
    const { disconnect: evmDisconnect } = useDisconnect()

    const displayName = user
        ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
        : 'Guest User'

    const username = user?.username ? `@${user.username}` : isInTelegram ? 'Telegram User' : '@guest'

    const shortAddress = (addr: string) =>
        addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : ''

    const openSupportChat = () => {
        if (webApp?.openLink) {
            try {
                webApp.openLink(SUPPORT_TELEGRAM, { try_instant_view: false })
                return
            } catch {
                // fallback below
            }
        }
        window.open(SUPPORT_TELEGRAM, '_blank', 'noopener,noreferrer')
    }

    const copyToClipboard = (text: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(text)
                webApp?.HapticFeedback?.notificationOccurred?.('success')
                webApp?.showAlert?.('Copied to clipboard.')
                return
            }
        } catch {
            // ignore and fallback
        }
        if (webApp?.showAlert) {
            webApp.showAlert(`Copy this value:\n${text}`)
        } else {
            window.prompt('Copy this value', text)
        }
    }

    const { data: adminAccessCheck } = useQuery({
        queryKey: ['admin-access-check', user?.id ?? 0, user?.username ?? ''],
        queryFn: () =>
            adminClient.checkAccess({
                telegramId: user?.id,
                username: user?.username,
            }),
        enabled: !!user?.id,
        staleTime: 60_000,
    })
    const showAdminPortal = shouldShowAdminPortalEntry() || adminAccessCheck?.authorized === true
    const usernameForApi = user?.username ? `@${user.username}` : ''
    const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()
    const { data: profileStats } = useQuery({
        queryKey: ['user-profile', usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () => userClient.getProfileStats(usernameForApi, user?.id, walletForApi || undefined),
        staleTime: 15000,
    })
    const referralCode = profileStats?.referralCode || (user ? `REF${user.id}` : 'REF000000')
    const referralStats = profileStats?.referral ?? { totalEarnedUsd: 0, referrals: 0, pendingUsd: 0 }
    const appDeepLinkBase =
        meta.env?.VITE_TELEGRAM_APP_URL?.trim() || GIFTEDFORGE_DEPLOY.telegramMiniAppUrl || ''
    const referralLink = appDeepLinkBase
        ? `${appDeepLinkBase}${appDeepLinkBase.includes('?') ? '&' : '?'}startapp=${encodeURIComponent(referralCode)}`
        : `https://t.me/share/url?text=${encodeURIComponent(`Use my referral code: ${referralCode}`)}`

    return (
        <div className="px-3 pb-30">
            {/* Profile Header Card */}
            <div className="bg-[#6B6AFD] rounded-3xl py-5 px-3">
                <div className="flex justify-between items-center border-b border-[#DAD8FF33] pb-4">
                    <div className="flex gap-2 items-center">
                        {user?.photo_url ? (
                            <img
                                className="w-11 h-11 rounded-full object-cover"
                                src={user.photo_url}
                                alt={displayName}
                            />
                        ) : (
                            <div className="w-11 h-11 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-lg">
                                {displayName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-white font-semibold text-sm">{displayName}</p>
                            <p className="text-[10px] text-white font-light pt-0.5">{username}</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            const msg =
                                'Your name and photo come from Telegram. Connect or change crypto wallets from the Wallet tab.'
                            if (webApp?.showAlert) webApp.showAlert(msg)
                            else window.alert(msg)
                        }}
                        className="bg-white flex gap-1 items-center justify-center rounded-full w-[86px] h-[21px] cursor-pointer border-0"
                    >
                        <img src="/edit.svg" className="w-3 h-3" alt="" />
                        <p className="text-[10px] font-medium text-[#6B6AFD]">{t('profile.edit')}</p>
                    </button>
                </div>

                <div className="flex text-center pt-4">
                    <div className="px-5 py-[7px]">
                        <p className="text-xl font-semibold text-white">{profileStats?.nftsOwned ?? 0}</p>
                        <p className="text-xs text-[#DAD8FF] pt-2">{t('profile.nfts_owned')}</p>
                    </div>
                    <div className="border-x py-[7px] border-[#DAD8FF33] px-5">
                        <p className="text-xl font-semibold text-white">{profileStats?.activeListings ?? 0}</p>
                        <p className="text-xs text-[#DAD8FF] pt-2">{t('profile.active_listings')}</p>
                    </div>
                    <div className="px-6 py-[7px]">
                        <p className="text-xl font-semibold text-white">{profileStats?.stars ?? 0}</p>
                        <p className="text-xs text-[#DAD8FF] pt-2">{t('profile.stars')}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 pt-8">
                    <div className="flex gap-[9px]">
                        <button
                            onClick={() => navigate('/app/wallet')}
                            className="flex-1 cursor-pointer bg-black text-white rounded-full h-10 text-sm font-semibold"
                        >
                            {t('profile.wallet')}
                        </button>
                        {/* .. */}
                        <button
                            onClick={() => navigate('/app/mint')}
                            className="flex-1 cursor-pointer rounded-full h-10 text-sm font-semibold bg-white text-[#0E0636]"
                        >
                            {t('profile.create_nft')}
                        </button>
                    </div>
                    {isInTelegram && (
                        <button
                            type="button"
                            onClick={() => navigate('/app/wallet')}
                            className="w-full cursor-pointer bg-white/20 text-white border border-white/40 rounded-full h-10 text-sm font-semibold"
                        >
                            {t('profile.topup_stars')}
                        </button>
                    )}
                </div>
            </div>

            <div className="pt-12 pl-3">
                {/* Referral */}
                <p className="font-semibold text-xl text-[#0E0636] pb-6">{t('profile.referral_code')}</p>
                <div className="border border-[#666F8B33] rounded-2xl bg-[#F5F7FB66] p-2.5">
                    <p className="text-xs text-center py-2 rounded-lg border border-[#666F8B33] text-[#666F8B]">
                        #{referralCode}
                    </p>
                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={() => copyToClipboard(`#${referralCode}`)}
                            className="text-xs py-1 flex-1 rounded-lg border border-[#666F8B33] text-[#666F8B]"
                        >
                            {t('common.copy')}
                        </button>
                        <button
                            onClick={() => copyToClipboard(referralLink)}
                            className="text-xs py-1 flex-1 rounded-lg border border-[#666F8B33] text-[#666F8B]"
                        >
                            {t('common.share')}
                        </button>
                    </div>
                    <div className="border-t text-center border-[#666F8B33] flex mt-4 pt-4">
                        <div className="px-8 py-[5px]">
                            <p className="text-sm font-semibold text-[#0E0636]">${referralStats.totalEarnedUsd.toFixed(2)}</p>
                            <p className="text-[8px] text-[#666F8B] pt-2">{t('profile.total_earned')}</p>
                        </div>
                        <div className="border-x py-[5px] border-[#666F8B33] px-8">
                            <p className="text-sm font-semibold text-[#0E0636]">{String(referralStats.referrals).padStart(2, '0')}</p>
                            <p className="text-[8px] text-[#666F8B] pt-2">{t('profile.referrals')}</p>
                        </div>
                        <div className="px-8 py-[5px]">
                            <p className="text-sm font-semibold text-[#0E0636]">${referralStats.pendingUsd.toFixed(2)}</p>
                            <p className="text-[8px] text-[#666F8B] pt-2">{t('profile.pending')}</p>
                        </div>
                    </div>
                </div>

                {/* Connected Wallets */}
                <div>
                    <p className="text-[#0E0636] font-semibold text-xl pt-12 pb-6">{t('profile.connected_wallets')}</p>

                    {!tonConnected && !evmConnected && (
                        <div
                            onClick={() => navigate('/app/wallet')}
                            className="border border-dashed border-[#666F8B33] rounded-2xl py-6 text-center cursor-pointer hover:bg-[#6B6AFD0D] transition-colors"
                        >
                            <p className="text-sm text-[#666F8B]">{t('profile.no_wallets')}</p>
                            <p className="text-xs text-[#6B6AFD] pt-1 font-medium">{t('profile.tap_connect')}</p>
                        </div>
                    )}

                    {/* TON Wallet */}
                    {tonConnected && tonAddress && (
                        <div className="bg-[#6B6AFD0D] gap-2.5 flex items-center mb-3 border border-[#6B6AFD] rounded-2xl py-3 px-[13px]">
                            <img className="w-9 h-9 rounded-lg border border-[#6B6AFD]" src="/ton.jpg" alt="" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-[#6B6AFD]">{t('wallet.connect_ton').replace('Connect ', '')}</p>
                                <p className="text-[10px] text-[#6B6AFD] pt-0.5 truncate">{shortAddress(tonAddress)}</p>
                            </div>
                            <div className="flex gap-2 items-center">
                                <button onClick={() => copyToClipboard(tonAddress)}>
                                    <img src="/copy.svg" className="w-4 h-4 opacity-60" alt="" />
                                </button>
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                            </div>
                        </div>
                    )}

                    {/* EVM Wallet */}
                    {evmConnected && evmAddress && (
                        <div className="bg-[#6B6AFD0D] gap-2.5 flex items-center mb-3 border border-[#6B6AFD] rounded-2xl py-3 px-[13px]">
                            <img className="w-9 h-9 rounded-lg border border-[#6B6AFD]" src="/eth.png" alt="" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-[#6B6AFD]">
                                    {t('wallet.connect_evm').replace('Connect ', '')} {chain?.name ? `(${chain.name})` : ''}
                                </p>
                                <p className="text-[10px] text-[#6B6AFD] pt-0.5 truncate">{shortAddress(evmAddress)}</p>
                            </div>
                            <div className="flex gap-2 items-center">
                                <button onClick={() => copyToClipboard(evmAddress)}>
                                    <img src="/copy.svg" className="w-4 h-4 opacity-60" alt="" />
                                </button>
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                            </div>
                        </div>
                    )}

                    {/* Disconnect buttons */}
                    {(tonConnected || evmConnected) && (
                        <div className="flex gap-2 mt-2">
                            {tonConnected && (
                                <button
                                    onClick={() => tonConnectUI.disconnect()}
                                    className="flex-1 py-2 text-xs rounded-lg border border-[#DA0909] text-[#DA0909]"
                                >
                                    {t('profile.disconnect_ton')}
                                </button>
                            )}
                            {evmConnected && (
                                <button
                                    onClick={() => evmDisconnect()}
                                    className="flex-1 py-2 text-xs rounded-lg border border-[#DA0909] text-[#DA0909]"
                                >
                                    {t('profile.disconnect_evm')}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {showAdminPortal && (
                    <div className="pt-12">
                        <p className="text-[#0E0636] font-semibold text-xl pb-6">{t('profile.administration')}</p>
                        <Link
                            to="/admin-access"
                            className="gap-2.5 flex items-center border border-[#6B6AFD] rounded-2xl py-3 px-[13px] bg-[#6B6AFD0D] no-underline text-inherit"
                        >
                            <div className="w-9 h-9 border border-[#6B6AFD] flex items-center justify-center rounded-lg">
                                <img className="w-5 h-5 rounded-lg" src="/setting-3.svg" alt="" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-[#6B6AFD]">{t('profile.admin_panel')}</p>
                                <p className="text-[10px] text-[#666F8B] pt-0.5">{t('profile.admin_subtitle')}</p>
                            </div>
                            <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                        </Link>
                    </div>
                )}

                {/* Content */}
                <div className="pt-12">
                    <p className="text-[#0E0636] font-semibold text-xl">{t('profile.content')}</p>
                    <div className="flex flex-col gap-3 mt-6">
                        <div className="border border-[#666F8B33] rounded-2xl p-3 bg-transparent hover:bg-[#6B6AFD0D] transition-colors">
                            <button
                                type="button"
                                onClick={() => navigate('/app/my-collection')}
                                className="gap-2.5 flex w-full text-left items-center cursor-pointer bg-transparent border-0 p-0"
                            >
                                <div className="w-9 h-9 border border-[#666F8B33] flex items-center justify-center rounded-lg">
                                    <img className="w-5 h-5 rounded-lg" src="/gallery.svg" alt="" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-[#666F8B]">{t('profile.my_collections')}</p>
                                    <p className="text-[10px] text-[#666F8B] pt-0.5">{t('profile.my_collections_sub')}</p>
                                </div>
                                <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                            </button>

                            {user?.id && (
                                <div className="mt-3 pt-3 border-t border-[#666F8B1A] flex gap-2">
                                    <button
                                        onClick={() => {
                                            const link = appDeepLinkBase
                                                ? `${appDeepLinkBase}${appDeepLinkBase.includes('?') ? '&' : '?'}startapp=${encodeURIComponent(`col_${user.id}`)}`
                                                : `${window.location.origin}/app/collection/${user.id}`
                                            copyToClipboard(link)
                                        }}
                                        className="flex-1 py-1.5 text-[10px] font-semibold text-[#6B6AFD] bg-[#6B6AFD14] rounded-lg"
                                    >
                                        {t('profile.share_collection')}
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate('/app/favorites')}
                            className="gap-2.5 flex w-full text-left items-center mt-3 border border-[#666F8B33] rounded-2xl py-3 px-[13px] cursor-pointer hover:bg-[#6B6AFD0D] transition-colors bg-transparent"
                        >
                            <div className="w-9 h-9 border border-[#666F8B33] flex items-center justify-center rounded-lg">
                                <img className="w-5 h-5 rounded-lg" src="/heart.svg" alt="" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-[#666F8B]">{t('profile.favourites')}</p>
                                <p className="text-[10px] text-[#666F8B] pt-0.5">{t('profile.favourites_sub')}</p>
                            </div>
                            <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/offers')}
                            className="gap-2.5 flex w-full text-left items-center mt-3 border border-[#666F8B33] rounded-2xl py-3 px-[13px] cursor-pointer hover:bg-[#6B6AFD0D] transition-colors bg-transparent"
                        >
                            <div className="w-9 h-9 border border-[#666F8B33] flex items-center justify-center rounded-lg">
                                <img className="w-5 h-5 rounded-lg" src="/taggray.svg" alt="" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-[#666F8B]">{t('profile.offers')}</p>
                                <p className="text-[10px] text-[#666F8B] pt-0.5">{t('profile.offers_sub')}</p>
                            </div>
                            <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                        </button>
                    </div>
                </div>

                {/* Support */}
                <div className="pt-12">
                    <p className="text-[#0E0636] font-semibold text-xl">{t('profile.support')}</p>
                    <div>
                        <button
                            type="button"
                            onClick={() => openSupportChat()}
                            className="gap-2.5 flex w-full text-left items-center mt-6 border border-[#666F8B33] rounded-2xl py-3 px-[13px] cursor-pointer hover:bg-[#6B6AFD0D] transition-colors bg-transparent"
                        >
                            <div className="w-9 h-9 border border-[#666F8B33] flex items-center justify-center rounded-lg">
                                <img className="w-5 h-5 rounded-lg" src="/message-question.svg" alt="" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-[#666F8B]">{t('profile.help')}</p>
                                <p className="text-[10px] text-[#666F8B] pt-0.5">{t('profile.help_sub')}</p>
                            </div>
                            <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/languages')}
                            className="gap-2.5 flex w-full text-left items-center mt-6 border border-[#666F8B33] rounded-2xl py-3 px-[13px] cursor-pointer hover:bg-[#6B6AFD0D] transition-colors bg-transparent"
                        >
                            <div className="w-9 h-9 border border-[#666F8B33] flex items-center justify-center rounded-lg">
                                <img className="w-5 h-5 rounded-lg" src="/globe.svg" alt="" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-[#666F8B]">{t('profile.language')}</p>
                                <p className="text-[10px] text-[#666F8B] pt-0.5">{t(lang === 'ru' ? 'lang.ru_region' : 'lang.en_region')}</p>
                            </div>
                            <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                        </button>

                        <button
                            type="button"
                            onClick={() => openSupportChat()}
                            className="gap-2.5 flex w-full text-left items-center mt-3 border border-[#666F8B33] rounded-2xl py-3 px-[13px] cursor-pointer hover:bg-[#6B6AFD0D] transition-colors bg-transparent"
                        >
                            <div className="w-9 h-9 border border-[#666F8B33] flex items-center justify-center rounded-lg">
                                <img className="w-5 h-5 rounded-lg" src="/flag.svg" alt="" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-[#666F8B]">{t('profile.report')}</p>
                                <p className="text-[10px] text-[#666F8B] pt-0.5">{t('profile.report_sub')}</p>
                            </div>
                            <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
                        </button>
                    </div>
                </div>

                {/* Disconnect All */}
                {(tonConnected || evmConnected) && (
                    <button
                        onClick={() => {
                            if (tonConnected) tonConnectUI.disconnect()
                            if (evmConnected) evmDisconnect()
                        }}
                        className="bg-[#DA09091A] w-full mt-12 rounded-lg py-3 text-sm font-semibold text-[#DA0909]"
                    >
                        {t('profile.disconnect_all')}
                    </button>
                )}
            </div>
        </div>
    )
}

export default Profile
