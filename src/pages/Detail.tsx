import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '../components/Modal'
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react'
import { useAccount, useSendTransaction } from 'wagmi'
import { parseEther } from 'viem'
import { Address } from '@ton/core'
import { useTelegram } from '../contexts/TelegramContext'
import { userClient } from '../services/user'
import { useFavorites } from '../hooks/useFavorites'
import { getCollectionAddress } from '../utils/tonCollection'
import { GIFTEDFORGE_DEPLOY } from '../config/giftedforgeDeploy'
import {
    buildNftTransferPayload,
    fetchNftOwnerAddressFriendly,
    resolveNftItemAddressFromCollection,
    tonAddressesLooselyEqual,
} from '../utils/tonNft'

const STARS_PER_TON = 200

const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }

const normalizeTonAddress = (raw: string): string | null => {
    const cleaned = String(raw || '').trim()
    if (!cleaned) return null
    try {
        return Address.parse(cleaned).toString({ bounceable: true })
    } catch {
        return null
    }
}

const formatTon = (value: number): string => {
    if (!Number.isFinite(value)) return '0.000'
    if (value === 0) return '0.000'
    if (value < 0.001) return value.toFixed(6)
    return value.toFixed(3)
}

const Detail = () => {
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    const { user, webApp } = useTelegram()
    const paymentDefaultedRef = useRef(false)
    const { isFavorite, toggle: toggleFavorite } = useFavorites(user?.id)

    const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'stars'>('crypto')
    const [offerModal, setOfferModal] = useState(false)
    const [buyModal, setBuyModal] = useState(false)
    const [buySuccessModal, setBuySuccessModal] = useState(false)
    const [transferModal, setTransferModal] = useState(false)
    const [recipientTonInput, setRecipientTonInput] = useState('')
    const [resolvedNftItemAddress, setResolvedNftItemAddress] = useState<string | null>(null)
    const [offerValue, setOfferValue] = useState('')
    const [actionError, setActionError] = useState('')
    const [actionSuccess, setActionSuccess] = useState('')
    const [shareGiftOpen, setShareGiftOpen] = useState(false)

    // Wallet info for payment display
    const tonAddress = useTonAddress()
    const tonRawAddress = useTonAddress(false)
    const [tonConnectUI] = useTonConnectUI()
    const tonWallet = useTonWallet()
    const { address: evmAddress, isConnected: evmConnected } = useAccount()
    const { sendTransactionAsync: evmSendTx } = useSendTransaction()
    const walletAddress = tonAddress || evmAddress || ''
    const walletType = tonWallet ? 'TON' : evmConnected ? 'EVM' : undefined

    const cryptoAvailable = tonWallet
        ? 'TON Wallet Connected'
        : evmConnected
            ? 'EVM Wallet Connected'
            : 'No wallet connected'

    const usernameForApi = user?.username ? `@${user.username}` : ''
    const walletForApi = (tonRawAddress || tonAddress || evmAddress || '').trim()

    useEffect(() => {
        if (user?.id && !paymentDefaultedRef.current) {
            setPaymentMethod('stars')
            paymentDefaultedRef.current = true
        }
    }, [user?.id])

    const { data, isLoading, isError } = useQuery({
        queryKey: ['asset-detail', id, usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () =>
            userClient.getAssetDetail(id, {
                username: usernameForApi || undefined,
                telegramId: user?.id,
                walletAddress: walletForApi || undefined,
            }),
        enabled: !!id,
        retry: 1,
    })
    const { data: buyerProfile } = useQuery({
        queryKey: ['user-profile', usernameForApi, user?.id ?? 0, walletForApi],
        queryFn: () => userClient.getProfileStats(usernameForApi, user?.id, walletForApi || undefined),
        staleTime: 15_000,
    })
    const { data: platformSettings } = useQuery({
        queryKey: ['user-platform-settings'],
        queryFn: () => userClient.getPlatformSettings(),
        staleTime: 30_000,
    })

    const { data: tonPriceUsd } = useQuery({
        queryKey: ['ton-price'],
        queryFn: async () => {
            try {
                const res = await fetch('https://tonapi.io/v2/rates?tokens=ton&currencies=usd')
                const data = await res.json()
                return data.rates?.TON?.prices?.USD ?? 0
            } catch (err) {
                console.error('[Detail] Failed to fetch TON price', err)
                return 0
            }
        },
        staleTime: 60_000,
    })

    const starsAvailable = buyerProfile?.stars ?? 0

    const viewerOwned = !!data?.viewerOwned
    const asset = data?.asset
    const assetTitle = asset?.title || 'NFT Asset'
    const assetImage = asset?.nft || '/crystal-cube.jpg'
    const sellerName = asset?.username || '@seller'
    const sellerWalletAddress = asset?.sellerWalletAddress || ''
    const ownerWalletAddress = asset?.ownerWalletAddress || ''
    const sellerImage = asset?.sellerImg || '/avatari.png'
    const assetPrice = asset?.price || '0 TON'
    const itemTon = useMemo(() => {
        const parsed = parseFloat(String(assetPrice).replace(/[^\d.]/g, ''))
        return Number.isFinite(parsed) ? parsed : 0
    }, [assetPrice])
    const feePercent = Math.max(0, Number(platformSettings?.platformFeePercent ?? 0))
    const feeReceiverWalletAddress = String(platformSettings?.feeReceiverWalletAddress || '').trim()
    const platformFeeTon = Number(((itemTon * feePercent) / 100).toFixed(6))
    const sellerPayoutTon = Number(Math.max(0, itemTon - platformFeeTon).toFixed(6))
    const gasTon = 0.002
    const totalTon = itemTon + gasTon
    const priceStarsTotal = Math.round(itemTon * STARS_PER_TON)
    const priceUsdTotal = itemTon * (tonPriceUsd || 0)
    const displayPriceUsd = priceUsdTotal > 0 ? priceUsdTotal.toFixed(2) : '0.00'
    const displayPriceStars = priceStarsTotal.toLocaleString()

    const platformFeeStars = Math.round((priceStarsTotal * feePercent) / 100)
    const sellerPayoutStars = Math.max(0, priceStarsTotal - platformFeeStars)

    const actorPayload = {
        telegramId: user?.id,
        firstName: user?.first_name,
        lastName: user?.last_name,
        username: user?.username,
        photoUrl: user?.photo_url,
        languageCode: user?.language_code,
        walletAddress: walletAddress || undefined,
        walletType,
    } as const

    const collectibleShareUrl = useMemo(() => {
        const base =
            meta.env?.VITE_TELEGRAM_APP_URL?.trim() || GIFTEDFORGE_DEPLOY.telegramMiniAppUrl || ''
        if (base) {
            const sep = base.includes('?') ? '&' : '?'
            return `${base}${sep}startapp=${encodeURIComponent(`collectible_${id}`)}`
        }
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/app/detail/${encodeURIComponent(id)}`
        }
        return ''
    }, [id])

    const openShareGiftLink = () => {
        const text = `I sent you a digital gift on GiftedForge: ${assetTitle}`
        const href = `https://t.me/share/url?url=${encodeURIComponent(collectibleShareUrl)}&text=${encodeURIComponent(text)}`
        try {
            webApp?.openLink?.(href, { try_instant_view: false })
        } catch {
            window.open(href, '_blank', 'noopener,noreferrer')
        }
    }

    const collectionHint = String(asset?.collectionAddress || getCollectionAddress(platformSettings?.collectionAddress) || '').trim()

    useEffect(() => {
        setResolvedNftItemAddress(null)
    }, [asset?.id, asset?.tokenId, asset?.nftItemAddress])

    useEffect(() => {
        if (!viewerOwned || !asset?.tokenId || asset?.nftItemAddress || !collectionHint) return
        let cancelled = false
        void resolveNftItemAddressFromCollection(collectionHint, asset.tokenId).then((addr) => {
            if (!cancelled && addr) setResolvedNftItemAddress(addr)
        })
        return () => {
            cancelled = true
        }
    }, [viewerOwned, asset?.tokenId, asset?.nftItemAddress, collectionHint])

    const effectiveNftItemAddress =
        String(asset?.nftItemAddress || '').trim() || resolvedNftItemAddress || ''

    const tonWalletAccountAddress = String(
        (tonWallet as { account?: { address?: string } } | null)?.account?.address || '',
    ).trim()

    const connectedFriendly = normalizeTonAddress(
        [tonAddress, tonRawAddress, tonWalletAccountAddress].find((s) => String(s || '').trim()) || '',
    )

    const {
        data: chainOwnerFriendly,
        isFetching: chainOwnerLoading,
        isFetched: chainOwnerFetched,
    } = useQuery({
        queryKey: ['nft-chain-owner', effectiveNftItemAddress],
        queryFn: () => fetchNftOwnerAddressFriendly(effectiveNftItemAddress),
        // Load on-chain owner even before TON Connect — otherwise the gift button stays disabled with no clear reason.
        enabled: !!effectiveNftItemAddress && viewerOwned,
        staleTime: 15_000,
    })

    const walletMatchesOnChainOwner =
        !!connectedFriendly &&
        !!chainOwnerFriendly &&
        tonAddressesLooselyEqual(chainOwnerFriendly, connectedFriendly)

    /** Buyer TON on file — used when TonAPI returns no owner row. */
    const registeredOwnerFriendly = normalizeTonAddress(
        ownerWalletAddress || sellerWalletAddress || '',
    )
    const walletMatchesGiftProfileTon =
        viewerOwned &&
        !!registeredOwnerFriendly &&
        !!connectedFriendly &&
        tonAddressesLooselyEqual(registeredOwnerFriendly, connectedFriendly)

    const ownerOkForGiftTransfer =
        walletMatchesOnChainOwner ||
        (viewerOwned &&
            walletMatchesGiftProfileTon &&
            chainOwnerFetched &&
            !chainOwnerLoading &&
            chainOwnerFriendly == null)

    const transferMut = useMutation({
        mutationFn: (payload: { recipientTonAddress: string; txRef: string }) =>
            userClient.transferNft(id, {
                ...payload,
                ...actorPayload,
            }),
        onSuccess: async (res) => {
            setActionError('')
            setActionSuccess(res.message || 'Collectible sent. You can share a link with the recipient below.')
            setTransferModal(false)
            setRecipientTonInput('')
            setShareGiftOpen(true)
            await queryClient.invalidateQueries({ queryKey: ['asset-detail', id] })
            await queryClient.invalidateQueries({ queryKey: ['user-home'] })
        },
        onError: (err: Error) => {
            setActionSuccess('')
            setActionError(err.message || 'Transfer failed')
        },
    })

    const submitTonTransfer = () => {
        setActionError('')
        setActionSuccess('')
        const run = async () => {
            const nftAddr = normalizeTonAddress(effectiveNftItemAddress)
            if (!nftAddr) throw new Error('NFT contract address is not available yet. Wait for indexing or check collection settings.')

            const newOwner = normalizeTonAddress(recipientTonInput.trim())
            if (!newOwner) throw new Error('Enter a valid recipient TON address.')
            const responseDestination = normalizeTonAddress(
                [tonAddress, tonRawAddress, tonWalletAccountAddress].find((s) => String(s || '').trim()) || '',
            )
            if (!responseDestination) throw new Error('Connect your TON wallet first.')

            if (!ownerOkForGiftTransfer) {
                throw new Error(
                    'This wallet does not match on-chain NFT owner. Use the wallet that holds the NFT.',
                )
            }

            const payload = buildNftTransferPayload({
                newOwnerAddress: newOwner,
                responseDestination,
                forwardTon: '0.0001',
            })
            const result = await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 360,
                messages: [
                    {
                        address: nftAddr,
                        amount: String(Math.floor(0.05 * 1e9)),
                        payload,
                    },
                ],
            })
            transferMut.mutate({
                recipientTonAddress: newOwner,
                txRef: result.boc || `ton-transfer-${Date.now()}`,
            })
        }
        void run().catch((err: any) => {
            const message =
                err?.message?.includes('User declined') || err?.message?.includes('rejected')
                    ? 'Transaction was cancelled by user.'
                    : err?.message || 'Transfer failed.'
            setActionError(message)
        })
    }

    const offerMut = useMutation({
        mutationFn: (offerTon: number) =>
            userClient.makeOffer(id, {
                offerTon,
                paymentMethod,
                ...actorPayload,
            }),
        onSuccess: async (res) => {
            setActionError('')
            setActionSuccess(res.message || 'Offer submitted successfully.')
            setOfferModal(false)
            setOfferValue('')
            await queryClient.invalidateQueries({ queryKey: ['user-offers'] })
        },
        onError: (err: Error) => {
            setActionSuccess('')
            setActionError(err.message || 'Failed to submit offer')
        },
    })

    const buyMut = useMutation({
        mutationFn: (txRef: string) =>
            userClient.buyNow(id, {
                paymentMethod,
                txRef,
                ...actorPayload,
            }),
        onSuccess: async (res) => {
            setActionError('')
            setActionSuccess(res.message || 'Purchase completed successfully.')
            setBuyModal(false)
            setBuySuccessModal(true)
            await queryClient.invalidateQueries({ queryKey: ['user-profile'] })
            await queryClient.invalidateQueries({ queryKey: ['user-home'] })
            await queryClient.invalidateQueries({ queryKey: ['asset-detail', id] })
        },
        onError: (err: Error) => {
            setActionSuccess('')
            setActionError(err.message || 'Failed to complete purchase')
        },
    })

    const submitOffer = () => {
        const value = Number(offerValue)
        if (!Number.isFinite(value) || value <= 0) {
            setActionError('Please enter a valid offer amount.')
            return
        }
        setActionError('')
        setActionSuccess('')
        offerMut.mutate(value)
    }

    const submitBuyNow = () => {
        if (paymentMethod === 'stars') {
            if (priceStarsTotal < 1) {
                setActionError('Invalid price for Stars checkout.')
                return
            }
            if (starsAvailable < priceStarsTotal) {
                setActionError(
                    `Insufficient Stars (need ${priceStarsTotal.toLocaleString()}, have ${starsAvailable.toLocaleString()}). Top up in Wallet.`,
                )
                return
            }
            setActionError('')
            setActionSuccess('')
            setBuyModal(false)
            buyMut.mutate(`stars:${Date.now()}`)
            return
        }

        if (!sellerWalletAddress) {
            setActionError('Seller wallet address is missing for this NFT.')
            return
        }
        if (platformFeeTon > 0 && !feeReceiverWalletAddress) {
            setActionError('Platform fee receiver wallet is not configured by admin.')
            return
        }
        if (platformFeeTon > 0 && feeReceiverWalletAddress === sellerWalletAddress) {
            setActionError('Platform fee receiver must be different from seller wallet.')
            return
        }

        setActionError('')
        setActionSuccess('')
        // Close confirmation modal before wallet handoff to avoid re-showing same popup.
        setBuyModal(false)
        const run = async () => {
            let txRef = ''
            if (tonWallet) {
                const sellerTonAddress = normalizeTonAddress(sellerWalletAddress)
                if (!sellerTonAddress) {
                    throw new Error('Seller TON address format is invalid. Ask seller to reconnect wallet.')
                }
                const feeTonAddress = platformFeeTon > 0 ? normalizeTonAddress(feeReceiverWalletAddress) : null
                if (platformFeeTon > 0 && !feeTonAddress) {
                    throw new Error('Platform fee receiver TON address is invalid.')
                }

                const sellerNanotons = Math.floor(sellerPayoutTon * 1e9)
                const feeNanotons = Math.floor(platformFeeTon * 1e9)
                const messages: Array<{ address: string; amount: string }> = [
                    {
                        address: sellerTonAddress,
                        amount: String(sellerNanotons),
                    },
                ]
                if (feeNanotons > 0 && feeTonAddress) {
                    messages.push({
                        address: feeTonAddress,
                        amount: String(feeNanotons),
                    })
                }
                const result = await tonConnectUI.sendTransaction({
                    validUntil: Math.floor(Date.now() / 1000) + 360,
                    messages,
                })
                txRef = result.boc || `ton-${Date.now()}`
            } else if (evmConnected && evmAddress) {
                const sellerHash = await evmSendTx({
                    to: sellerWalletAddress as `0x${string}`,
                    value: parseEther(sellerPayoutTon.toFixed(6)),
                })
                let feeHash = ''
                if (platformFeeTon > 0 && feeReceiverWalletAddress) {
                    feeHash = await evmSendTx({
                        to: feeReceiverWalletAddress as `0x${string}`,
                        value: parseEther(platformFeeTon.toFixed(6)),
                    }) || ''
                }
                txRef = [sellerHash, feeHash].filter(Boolean).join('|') || `evm-${Date.now()}`
            } else {
                throw new Error('Please connect a wallet first.')
            }
            buyMut.mutate(txRef)
        }
        void run().catch((err: any) => {
            // Reopen confirm modal so user can retry after a failed/cancelled tx.
            setBuyModal(true)
            const message =
                err?.message?.includes('User declined') || err?.message?.includes('rejected')
                    ? 'Transaction was cancelled by user.'
                    : err?.message || 'On-chain payment failed.'
            setActionError(message)
        })
    }

    const recipientNormalizedPreview = normalizeTonAddress(recipientTonInput.trim())
    const recipientIsOwnWallet =
        !!recipientNormalizedPreview &&
        !!connectedFriendly &&
        tonAddressesLooselyEqual(recipientNormalizedPreview, connectedFriendly)
    const showChainMismatch =
        viewerOwned &&
        !!effectiveNftItemAddress &&
        !!connectedFriendly &&
        !!chainOwnerFriendly &&
        !chainOwnerLoading &&
        !walletMatchesOnChainOwner

    const awaitingOnChainDelivery =
        viewerOwned &&
        !!effectiveNftItemAddress &&
        chainOwnerFetched &&
        !chainOwnerLoading &&
        !!chainOwnerFriendly &&
        (!connectedFriendly || !walletMatchesOnChainOwner)

    const receiveWalletFriendly =
        connectedFriendly || normalizeTonAddress(ownerWalletAddress || walletForApi || '')
    const nftMetaMissing =
        viewerOwned &&
        !!effectiveNftItemAddress &&
        chainOwnerFetched &&
        !chainOwnerLoading &&
        chainOwnerFriendly == null &&
        !walletMatchesGiftProfileTon
    const canSubmitTonTransfer =
        viewerOwned &&
        !!tonWallet &&
        !!asset?.tokenId &&
        !!effectiveNftItemAddress &&
        ownerOkForGiftTransfer &&
        !chainOwnerLoading &&
        !!recipientNormalizedPreview &&
        !recipientIsOwnWallet &&
        !transferMut.isPending

    const giftCtaHardDisabled =
        !asset || !asset.tokenId || !effectiveNftItemAddress || chainOwnerLoading || transferMut.isPending

    const openGiftTransferFlow = () => {
        setActionError('')
        if (!asset?.tokenId) {
            setActionError('This collectible has no on-chain token id — transfer is unavailable.')
            return
        }
        if (!effectiveNftItemAddress) {
            setActionError(
                'NFT contract address is missing. Set VITE_TON_COLLECTION_ADDRESS (or item address on the asset) and reload.',
            )
            return
        }
        if (chainOwnerLoading) {
            webApp?.showAlert?.('Still checking on-chain ownership. Try again in a moment.')
            return
        }
        if (chainOwnerFetched && chainOwnerFriendly == null && !walletMatchesGiftProfileTon) {
            webApp?.showAlert?.(
                'Could not load this NFT from the chain (TonAPI). Wait for indexing or verify the collection address — or ensure your GiftedForge profile TON wallet matches TonConnect.',
            )
            return
        }
        if (!tonWallet) {
            const msg =
                'Gifting transfers the NFT on TON. Connect a TON wallet from the Wallet tab (same wallet that holds this NFT), then tap this again.'
            if (webApp?.showAlert) {
                webApp.showAlert(msg, () => {
                    tonConnectUI.openModal()
                })
            } else {
                window.alert(msg)
                tonConnectUI.openModal()
            }
            return
        }
        if (!ownerOkForGiftTransfer) {
            webApp?.showAlert?.(
                'Your connected TON wallet is not the on-chain owner of this NFT (and it does not match the TON wallet on your GiftedForge profile). Open Wallet → connect the wallet that actually holds this NFT.',
            )
            return
        }
        setTransferModal(true)
    }

    return (
        <div className="py-6 px-3">
            <div className="flex pb-6 px-3 items-center justify-between">
                <button onClick={() => navigate(-1)} className="cursor-pointer">
                    <img className="w-6 h-6" src="/arrow-left.svg" alt="" />
                </button>
                <button
                    type="button"
                    aria-label={isFavorite(id) ? 'Remove from favourites' : 'Save to favourites'}
                    className="cursor-pointer p-0 border-0 bg-transparent"
                    onClick={() => {
                        toggleFavorite(id, {
                            title: assetTitle,
                            username: sellerName,
                            price: assetPrice,
                            nft: assetImage,
                        })
                        webApp?.HapticFeedback?.impactOccurred?.('light')
                    }}
                >
                    <img
                        src={isFavorite(id) ? '/heart-filled.svg' : '/heart.svg'}
                        className={`w-6 h-6 ${isFavorite(id) ? '' : 'opacity-60'}`}
                        alt=""
                    />
                </button>
            </div>

            <div className="relative rounded-3xl mb-6">
                <div className="bg-[#0E06361A] rounded-3xl h-full w-full absolute z-10"></div>
                <img className="rounded-3xl w-full" src={assetImage} alt={assetTitle} />
                {viewerOwned && (
                    <span className="absolute z-20 left-3 top-3 text-xs font-semibold bg-[#6B6AFD] text-white px-2.5 py-1 rounded-lg shadow-sm">
                        You own this
                    </span>
                )}
            </div>

            <div className="px-3">
                <div className="flex justify-between items-start gap-2">
                    <div>
                        <p className="text-xl font-medium text-[#0E0636]">{assetTitle}</p>
                        {viewerOwned && (
                            <p className="text-xs text-[#6B6AFD] font-semibold pt-1">In your collection · app owner</p>
                        )}
                    </div>
                    <p className="font-semibold text-[#6B6AFD] text-xl shrink-0">{assetPrice}</p>
                </div>

                <div className="flex items-center justify-between pt-3">
                    <div className="flex items-center gap-1">
                        <img className="w-4 h-4 rounded-full object-cover" src={sellerImage} alt={sellerName} />
                        <p className="font-light text-sm text-[#0E0636]">{sellerName}</p>
                    </div>
                    <div className="flex items-center gap-1">
                        <p className="text-[#6B6AFD] font-light text-xs">${displayPriceUsd} = {displayPriceStars}</p>
                        <img className="w-3 h-3" src="/star.svg" alt="" />
                    </div>
                </div>
            </div>

            <div className="border-b border-[#666F8B33] mx-3 my-6"></div>

            {viewerOwned ? (
                <div className="px-3 pb-6 space-y-3">
                    {awaitingOnChainDelivery && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
                            <p className="text-sm font-semibold text-amber-950">Not in your TON wallet yet</p>
                            <p className="text-xs text-amber-900 leading-relaxed">
                                Payment succeeded in GiftedForge, but the NFT is still in the seller&apos;s wallet on-chain (
                                {chainOwnerFriendly?.slice(0, 8)}…). Ask {sellerName} to send this NFT to your TON address below.
                                It will not appear in Tonkeeper until they transfer it.
                            </p>
                            {receiveWalletFriendly ? (
                                <>
                                    <p className="text-[10px] text-amber-900 break-all font-mono">{receiveWalletFriendly}</p>
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-[#6B6AFD]"
                                        onClick={() => {
                                            void navigator.clipboard?.writeText(receiveWalletFriendly)
                                            webApp?.showAlert?.('TON address copied — send this to the seller.')
                                        }}
                                    >
                                        Copy my wallet address
                                    </button>
                                </>
                            ) : (
                                <p className="text-xs text-amber-900">
                                    Connect your TON wallet under Wallet, then return here to copy your address for the seller.
                                </p>
                            )}
                        </div>
                    )}
                    <p className="font-medium text-sm text-[#0E0636]">
                        {walletMatchesOnChainOwner ? 'Send as a gift' : 'On-chain transfer'}
                    </p>
                    <p className="text-xs text-[#666F8B] leading-relaxed">
                        {walletMatchesOnChainOwner
                            ? 'Transfer this collectible on-chain to another TON wallet.'
                            : 'You can send this NFT only after it appears in your connected TON wallet (seller must transfer it to you first).'}
                    </p>
                    {!asset?.tokenId && (
                        <p className="text-xs text-[#DA0909]">This item has no on-chain token index — transfer is unavailable.</p>
                    )}
                    {!!asset?.tokenId && !collectionHint && !asset?.nftItemAddress && (
                        <p className="text-xs text-[#DA0909]">
                            Set your collection address (Mint deploy or <code className="text-[11px]">VITE_TON_COLLECTION_ADDRESS</code>) so we can locate the NFT contract.
                        </p>
                    )}
                    {viewerOwned && !!effectiveNftItemAddress && chainOwnerLoading && (
                        <p className="text-xs text-[#666F8B]">Checking on-chain ownership…</p>
                    )}
                    {nftMetaMissing && (
                        <p className="text-xs text-[#DA0909]">
                            Could not load this NFT from TonAPI — wait for indexing or verify the item contract address.
                        </p>
                    )}
                    {showChainMismatch && !awaitingOnChainDelivery && (
                        <p className="text-xs text-[#DA0909]">
                            Your connected wallet is not the on-chain owner of this NFT yet.
                        </p>
                    )}
                    {ownerOkForGiftTransfer && !walletMatchesOnChainOwner && (
                        <p className="text-xs text-amber-800 leading-snug">
                            TonAPI did not return an owner for this NFT item. You can still try sending if your TonConnect
                            wallet matches the TON address on your GiftedForge profile. If the wallet rejects the tx, the
                            NFT may not be in this wallet yet — check Tonscan.
                        </p>
                    )}
                    {!tonWallet && (
                        <p className="text-xs text-[#DA0909]">Connect a TON wallet to send this NFT.</p>
                    )}
                    {!!effectiveNftItemAddress && ownerOkForGiftTransfer && (
                        <p className="text-[10px] text-[#666F8B] break-all">
                            Item contract: {effectiveNftItemAddress}
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div className="px-3">
                        <p className="font-medium text-sm text-[#0E0636] pb-4">Payment Method</p>
                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod('crypto')}
                                className={`w-full rounded-lg gap-2.5 items-center flex border p-3 transition-colors ${
                                    paymentMethod === 'crypto' ? 'border-[#6B6AFD] bg-[#6B6AFD0D]' : 'border-[#666F8B33]'
                                }`}
                            >
                                <div className={`w-9 flex items-center justify-center h-9 border rounded ${
                                    paymentMethod === 'crypto' ? 'bg-[#6B6AFD] border-[#6B6AFD]' : 'bg-[#666F8B0D] border-[#666F8B33]'
                                }`}>
                                    <img className="w-5 h-5" src="/walletgray.svg" alt="" />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className={`text-xs font-semibold ${paymentMethod === 'crypto' ? 'text-[#6B6AFD]' : 'text-[#666F8B]'}`}>
                                        Crypto
                                    </p>
                                    <p className="font-medium text-[10px] text-[#666F8B] pt-0.5">{cryptoAvailable}</p>
                                </div>
                                <div className={`w-4 h-4 border rounded-full flex items-center justify-center ${
                                    paymentMethod === 'crypto' ? 'border-[#6B6AFD]' : 'border-[#666F8B99]'
                                }`}>
                                    {paymentMethod === 'crypto' && (
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#6B6AFD]" />
                                    )}
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPaymentMethod('stars')}
                                className={`w-full rounded-lg gap-2.5 items-center flex border p-3 transition-colors ${
                                    paymentMethod === 'stars' ? 'border-[#6B6AFD] bg-[#6B6AFD0D]' : 'border-[#666F8B33]'
                                }`}
                            >
                                <div className={`w-9 flex items-center justify-center h-9 border rounded ${
                                    paymentMethod === 'stars' ? 'bg-[#6B6AFD] border-[#6B6AFD]' : 'bg-[#666F8B0D] border-[#666F8B33]'
                                }`}>
                                    <img className="w-5 h-5" src="/stargray2.svg" alt="" />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className={`text-xs font-semibold ${paymentMethod === 'stars' ? 'text-[#6B6AFD]' : 'text-[#666F8B]'}`}>
                                        Telegram Stars
                                    </p>
                                    <p className="font-medium text-[10px] text-[#666F8B] pt-0.5">
                                        {starsAvailable.toLocaleString()} in-app Stars available
                                    </p>
                                </div>
                                <div className={`w-4 h-4 border rounded-full flex items-center justify-center ${
                                    paymentMethod === 'stars' ? 'border-[#6B6AFD]' : 'border-[#666F8B99]'
                                }`}>
                                    {paymentMethod === 'stars' && (
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#6B6AFD]" />
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="border-b border-[#666F8B33] mx-3 my-6"></div>

                    <div className="px-3 pb-6">
                        <p className="font-medium text-sm text-[#0E0636] pb-4">Summary</p>
                        <div className="rounded-lg border border-[#666F8B33] pt-3">
                            <div className="flex justify-between border-b border-[#666F8B33] px-3 pb-3">
                                <p className="font-medium text-xs text-[#666F8B]">Item Price</p>
                                <p className="font-semibold text-xs text-[#666F8B]">
                                    {paymentMethod === 'crypto' ? `${itemTon.toFixed(3)} TON` : `${priceStarsTotal.toLocaleString()} Stars`}
                                </p>
                            </div>
                            <div className="flex pt-7 justify-between border-b border-[#666F8B33] px-3 pb-3">
                                <p className="font-medium text-xs text-[#666F8B]">Network</p>
                                <p className="font-semibold text-xs text-[#666F8B]">
                                    {paymentMethod === 'crypto'
                                        ? `Gas ≈ ${gasTon.toFixed(3)} TON`
                                        : 'No chain gas — in-app Stars'}
                                </p>
                            </div>
                            <div className="flex pt-4 justify-between border-b border-[#666F8B33] px-3 pb-3">
                                <p className="font-medium text-xs text-[#666F8B]">Platform Fee ({feePercent.toFixed(2)}%)</p>
                                <p className="font-semibold text-xs text-[#666F8B]">
                                    {paymentMethod === 'crypto'
                                        ? `${formatTon(platformFeeTon)} TON`
                                        : `${platformFeeStars.toLocaleString()} Stars`}
                                </p>
                            </div>
                            {paymentMethod === 'stars' && (
                                <div className="flex pt-4 justify-between border-b border-[#666F8B33] px-3 pb-3">
                                    <p className="font-medium text-xs text-[#666F8B]">Seller receives</p>
                                    <p className="font-semibold text-xs text-[#666F8B]">
                                        {sellerPayoutStars.toLocaleString()} Stars
                                    </p>
                                </div>
                            )}
                            <div className="flex pt-4 px-3 justify-between bg-[#6B6AFD0D] pb-4 mt-4">
                                <p className="text-sm font-medium text-[#0E0636]">Total</p>
                                <div>
                                    <p className="font-bold text-sm text-[#6B6AFD]">
                                        {paymentMethod === 'crypto' ? `${totalTon.toFixed(3)} TON` : `${priceStarsTotal.toLocaleString()} Stars`}
                                    </p>
                                    {paymentMethod === 'crypto' && (
                                        <p className="text-[10px] text-[#6B6AFD] text-end">Includes gas estimate</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="px-3 pb-6">
                {isLoading && <p className="text-xs text-[#666F8B] mt-3">Loading asset details...</p>}
                {isError && <p className="text-xs text-[#DA0909] mt-3">Failed to load asset details.</p>}
                {!viewerOwned && !!asset && paymentMethod === 'crypto' && !sellerWalletAddress && (
                    <p className="text-xs text-[#DA0909] mt-3">Seller wallet is not configured for this NFT.</p>
                )}
                {!viewerOwned && paymentMethod === 'stars' && starsAvailable < priceStarsTotal && (
                    <p className="text-xs text-[#DA0909] mt-3">
                        Not enough Stars. Open Wallet → Top up with Telegram Stars, then return here.
                    </p>
                )}
                {!!actionError && <p className="text-xs text-[#DA0909] mt-3">{actionError}</p>}
                {!!actionSuccess && <p className="text-xs text-[#0C8F4F] mt-3">{actionSuccess}</p>}

                {viewerOwned ? (
                    <button
                        type="button"
                        onClick={openGiftTransferFlow}
                        className="w-full mt-6 h-11 text-sm font-semibold text-white bg-[#6B6AFD] rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        disabled={giftCtaHardDisabled}
                    >
                        Send gift to wallet…
                    </button>
                ) : (
                    <div className="flex gap-2 pt-6">
                        <button
                            onClick={() => setOfferModal(true)}
                            className="flex-1 h-11 text-sm font-semibold text-[#6B6AFD] rounded-lg border border-[#6B6AFD]"
                            disabled={!asset || offerMut.isPending || buyMut.isPending}
                        >
                            Make Offer
                        </button>
                        <button
                            onClick={() => setBuyModal(true)}
                            className="flex-1 h-11 text-sm font-semibold text-white bg-[#6B6AFD] rounded-lg"
                            disabled={
                                !asset ||
                                offerMut.isPending ||
                                buyMut.isPending ||
                                (paymentMethod === 'crypto' && !sellerWalletAddress)
                            }
                        >
                            Buy Now
                        </button>
                    </div>
                )}
            </div>

            {/* Send NFT Modal */}
            <Modal
                isOpen={transferModal}
                onClose={() => {
                    setTransferModal(false)
                    setRecipientTonInput('')
                }}
            >
                <p className="text-center text-xl pb-4 font-medium text-[#0E0636]">Send gift</p>
                <p className="text-xs text-[#666F8B] text-center pb-4">
                    Recipient receives on-chain ownership (~0.05 TON forwarded with the transfer). You can share a
                    Telegram message after this succeeds.
                </p>
                <label className="text-[#0E0636] text-sm" htmlFor="recipient-ton">
                    Recipient TON address
                </label>
                <input
                    id="recipient-ton"
                    className="mt-2 w-full rounded-lg border border-[#666F8B33] px-3 py-3 text-sm outline-none bg-transparent placeholder:text-[#666F8B99]"
                    placeholder="EQ… or UQ…"
                    value={recipientTonInput}
                    onChange={(e) => setRecipientTonInput(e.target.value)}
                />
                {recipientIsOwnWallet && (
                    <p className="text-xs text-[#DA0909] pt-2">Use a different wallet than your own.</p>
                )}
                <div className="flex gap-2 pt-6">
                    <button
                        type="button"
                        onClick={() => {
                            setTransferModal(false)
                            setRecipientTonInput('')
                        }}
                        className="h-11 text-[#6B6AFD] text-sm font-semibold w-[102px] border border-[#6B6AFD] rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submitTonTransfer}
                        className="h-11 text-sm font-semibold flex-1 bg-[#6B6AFD] text-white rounded-lg disabled:opacity-40"
                        disabled={!canSubmitTonTransfer}
                    >
                        {transferMut.isPending ? 'Saving…' : 'Confirm in wallet'}
                    </button>
                </div>
            </Modal>

            {/* Make Offer Modal */}
            <Modal isOpen={offerModal} onClose={() => setOfferModal(false)}>
                <p className="text-center text-xl pb-6 font-medium text-[#0E0636]">Make Offer</p>
                <label className="text-[#0E0636] text-sm" htmlFor="offer">Your Offer</label>
                <div className="my-3 flex items-center rounded-lg gap-2 border border-[#666F8B33] pl-4 h-[56px]">
                    <img className="w-5 h-5" src="/dollar-square.svg" alt="" />
                    <input
                        id="offer"
                        className="placeholder:text-[#666F8B99] outline-none bg-transparent h-full flex-1"
                        type="number"
                        placeholder="0.00"
                        value={offerValue}
                        onChange={(e) => setOfferValue(e.target.value)}
                    />
                </div>
                <p className="text-xs text-[#0E0636]">Gas fee will be calculated at confirmation</p>
                {paymentMethod === 'stars' && offerValue && Number(offerValue) > 0 && (
                    <p className="text-xs text-[#666F8B] pt-2">
                        At the listed rate, ≈ {Math.round(Number(offerValue) * STARS_PER_TON).toLocaleString()} Stars
                    </p>
                )}
                <div className="flex gap-2 pt-6">
                    <button
                        onClick={() => setOfferModal(false)}
                        className="h-11 text-[#6B6AFD] text-sm font-semibold w-[102px] border border-[#6B6AFD] rounded-lg"
                    >
                        Close
                    </button>
                    <button
                        onClick={submitOffer}
                        className="h-11 text-sm font-semibold flex-1 bg-[#6B6AFD] text-white rounded-lg disabled:opacity-50"
                        disabled={offerMut.isPending}
                    >
                        {offerMut.isPending ? 'Submitting...' : 'Confirm Offer'}
                    </button>
                </div>
            </Modal>

            {/* Buy Now Modal */}
            <Modal isOpen={buyModal} onClose={() => setBuyModal(false)}>
                <div className="w-16 mx-auto h-16 flex items-center justify-center rounded-full bg-[#6B6AFD]">
                    <img className="w-9 h-9" src="/verify.svg" alt="" />
                </div>
                <p className="text-center py-6 text-xl font-semibold text-[#0E0636]">Confirm Purchase</p>

                <div className="rounded-lg border border-[#666F8B33] pt-3">
                    <div className="flex justify-between border-b border-[#666F8B33] px-3 pb-3">
                        <p className="font-medium text-xs text-[#666F8B]">Item Price</p>
                        <p className="font-semibold text-xs text-[#666F8B]">
                            {paymentMethod === 'crypto' ? `${itemTon.toFixed(3)} TON` : `${priceStarsTotal.toLocaleString()} Stars`}
                        </p>
                    </div>
                    <div className="flex pt-7 justify-between border-b border-[#666F8B33] px-3 pb-3">
                        <p className="font-medium text-xs text-[#666F8B]">Network</p>
                        <p className="font-semibold text-xs text-[#666F8B]">
                            {paymentMethod === 'crypto' ? `Gas ≈ ${gasTon.toFixed(3)} TON` : 'In-app Stars'}
                        </p>
                    </div>
                    <div className="flex pt-4 justify-between border-b border-[#666F8B33] px-3 pb-3">
                        <p className="font-medium text-xs text-[#666F8B]">Platform Fee ({feePercent.toFixed(2)}%)</p>
                        <p className="font-semibold text-xs text-[#666F8B]">
                            {paymentMethod === 'crypto' ? `${formatTon(platformFeeTon)} TON` : `${platformFeeStars.toLocaleString()} Stars`}
                        </p>
                    </div>
                    <div className="flex pt-4 px-3 justify-between bg-[#6B6AFD0D] pb-4 mt-4">
                        <p className="text-sm font-medium text-[#0E0636]">Total</p>
                        <div>
                            <p className="font-bold text-sm text-[#6B6AFD]">
                                {paymentMethod === 'crypto' ? `${totalTon.toFixed(3)} TON` : `${priceStarsTotal.toLocaleString()} Stars`}
                            </p>
                        </div>
                    </div>
                </div>

                {paymentMethod === 'crypto' && !tonWallet && !evmConnected && (
                    <p className="text-center text-xs text-[#DA0909] mt-4">Connect a wallet to pay on-chain.</p>
                )}

                <div className="flex gap-2 pt-6">
                    <button
                        type="button"
                        onClick={() => setBuyModal(false)}
                        className="h-11 text-[#6B6AFD] text-sm font-semibold w-[102px] border border-[#6B6AFD] rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submitBuyNow}
                        className="h-11 text-sm font-semibold flex-1 bg-[#6B6AFD] text-white rounded-lg disabled:opacity-50"
                        disabled={
                            buyMut.isPending ||
                            (paymentMethod === 'crypto' &&
                                ((!tonWallet && !evmConnected) || !sellerWalletAddress)) ||
                            (paymentMethod === 'stars' && starsAvailable < priceStarsTotal)
                        }
                    >
                        {buyMut.isPending
                            ? 'Processing...'
                            : paymentMethod === 'stars'
                              ? 'Pay with Stars'
                              : 'Confirm & Pay On-chain'}
                    </button>
                </div>
            </Modal>

            {/* Purchase Success Modal */}
            <Modal isOpen={buySuccessModal} onClose={() => setBuySuccessModal(false)}>
                <div className="w-16 mx-auto h-16 flex items-center justify-center rounded-full bg-[#6B6AFD]">
                    <img className="w-9 h-9" src="/verify.svg" alt="" />
                </div>
                <p className="text-center pt-6 text-xl font-semibold text-[#0E0636]">Purchase Complete</p>
                <p className="text-center pt-2 text-sm text-[#666F8B] leading-relaxed">
                    Payment is recorded. Your item is in <strong>Profile → Your Collection</strong>. It will{' '}
                    <strong>not</strong> appear in Tonkeeper until the seller sends the NFT to your connected TON wallet.
                    Open the item and copy your wallet address for the seller.
                </p>
                <div className="flex gap-2 pt-6">
                    <button
                        onClick={() => setBuySuccessModal(false)}
                        className="h-11 text-[#6B6AFD] text-sm font-semibold w-[120px] border border-[#6B6AFD] rounded-lg"
                    >
                        Close
                    </button>
                    <button
                        onClick={() => {
                            setBuySuccessModal(false)
                            navigate('/app/my-collection')
                        }}
                        className="h-11 text-sm font-semibold flex-1 bg-[#6B6AFD] text-white rounded-lg"
                    >
                        Your Collection
                    </button>
                </div>
            </Modal>

            <Modal
                isOpen={shareGiftOpen}
                onClose={() => {
                    setShareGiftOpen(false)
                }}
            >
                <p className="text-center text-xl font-medium text-[#0E0636] pb-2">Share your gift</p>
                <p className="text-xs text-[#666F8B] text-center pb-4 leading-relaxed">
                    Tell them to open GiftedForge and connect the wallet you sent to. You can share this link in any
                    Telegram chat.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => openShareGiftLink()}
                        className="h-11 text-sm font-semibold w-full bg-[#6B6AFD] text-white rounded-lg"
                    >
                        Share via Telegram
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard?.writeText?.(collectibleShareUrl)
                            webApp?.showAlert?.('Link copied.')
                        }}
                        className="h-11 text-sm font-semibold w-full border border-[#6B6AFD] text-[#6B6AFD] rounded-lg"
                    >
                        Copy link
                    </button>
                    <button
                        type="button"
                        onClick={() => setShareGiftOpen(false)}
                        className="h-11 text-sm font-semibold text-[#666F8B]"
                    >
                        Close
                    </button>
                </div>
            </Modal>
        </div>
    )
}

export default Detail
