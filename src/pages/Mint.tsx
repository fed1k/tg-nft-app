import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import Modal from '../components/Modal'
import { Address } from '@ton/core'
import { useTonConnectUI, useTonAddress, useTonWallet } from '@tonconnect/ui-react'
import { useTelegram } from '../contexts/TelegramContext'
import { buildNftMintPayload, getNextItemIndex, TON_EXPLORER } from '../utils/tonNft'
import { uploadImageToIPFS, uploadMetadataToIPFS, isPinataConfigured } from '../utils/pinata'
import { getCollectionAddress, normalizeCollectionAddress, buildCollectionDeployTransaction, saveCollectionAddress, TON_EXPLORER_COLLECTION } from '../utils/tonCollection'
import { userClient } from '../services/user'

type TxStatus = 'idle' | 'loading' | 'success' | 'error'

// Must match server MINT_FEE_TON (see server/.env). Override with VITE_MINT_FEE_TON if needed.
const MINT_FEE = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_MINT_FEE_TON?.trim() || '0.07'
const PENDING_TX_KEY = 'pendingTx'
const PENDING_MINT_DRAFT_KEY = 'pendingMintDraft'

type MintStep = { label: string; status: 'pending' | 'loading' | 'done' | 'error' }
const INITIAL_STEPS: MintStep[] = [
    { label: '📤 Uploading image to IPFS', status: 'pending' },
    { label: '📝 Uploading metadata to IPFS', status: 'pending' },
    { label: '🔗 Reading collection info', status: 'pending' },
    { label: '✍️  Waiting for wallet approval', status: 'pending' },
    { label: '💾 Saving minted NFT to database', status: 'pending' },
]

type PendingMint = {
    clientMintId: string
    name: string
    description: string
    price: string
    imageUrl: string
    metadataUrl: string
    collectionAddress: string
    walletAddress: string
    tokenId?: string
}
function savePendingMint(payload: PendingMint) {
    localStorage.setItem(PENDING_MINT_DRAFT_KEY, JSON.stringify(payload))
}

function loadPendingMint(): PendingMint | null {
    const raw = localStorage.getItem(PENDING_MINT_DRAFT_KEY)
    if (!raw) return null
    try {
        return JSON.parse(raw) as PendingMint
    } catch {
        return null
    }
}

function clearPendingMint() {
    localStorage.removeItem(PENDING_MINT_DRAFT_KEY)
    localStorage.removeItem(PENDING_TX_KEY)
}

// ─────────────────────────────────────────────────────────────────────────────
const POLL_MS = 2800
const LISTING_SYNC_MAX_MS = 120_000

const Mint = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { webApp, isInTelegram, user } = useTelegram()

    // Wallets
    const [tonConnectUI] = useTonConnectUI()
    const tonAddress = useTonAddress()          // user-friendly (UQ... format for user wallets)
    const tonRawAddress = useTonAddress(false)  // raw 0:hex format — use for payload building
    const tonWallet = useTonWallet()
    const walletConnected = !!tonWallet
    const walletLabel = tonWallet
        ? `TON: ${tonAddress.slice(0, 8)}...${tonAddress.slice(-4)}`
        : ''
    const { data: platformSettings } = useQuery({
        queryKey: ['user-platform-settings'],
        queryFn: () => userClient.getPlatformSettings(),
        staleTime: 30_000,
    })
    const platformFeePercent = Math.max(0, Number(platformSettings?.platformFeePercent ?? 0))
    const feeReceiverWalletAddress = String(platformSettings?.feeReceiverWalletAddress || '').trim()
    const mintFeeTonNum = Number.parseFloat(MINT_FEE) || 0
    const platformFeeOnMintTon = Number(((mintFeeTonNum * platformFeePercent) / 100).toFixed(6))

    // Collection address — reactive: re-reads localStorage whenever the user returns to this tab
    const [COLLECTION_ADDRESS, setCollectionAddress] = useState<string | null>(() => getCollectionAddress(platformSettings?.collectionAddress))
    useEffect(() => {
        const refresh = () => {
            const addr = getCollectionAddress(platformSettings?.collectionAddress)
            if (addr) setCollectionAddress(addr)
        }
        refresh()
        // Re-check when tab gains focus (user returns from wallet or wallet page)
        window.addEventListener('focus', refresh)
        document.addEventListener('visibilitychange', refresh)
        return () => {
            window.removeEventListener('focus', refresh)
            document.removeEventListener('visibilitychange', refresh)
        }
    }, [platformSettings?.collectionAddress])

    // Form state
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Progress modal (browser fallback)
    const [progressOpen, setProgressOpen] = useState(false)
    const [successOpen, setSuccessOpen] = useState(false)
    const [steps, setSteps] = useState<MintStep[]>(INITIAL_STEPS)
    const [isMinting, setIsMinting] = useState(false)
    const [mintError, setMintError] = useState('')
    const [txHash, setTxHash] = useState('')
    const [mintedImageUrl, setMintedImageUrl] = useState('')
    const [isRecoveringMint, setIsRecoveringMint] = useState(false)
    const [recoveryMessage, setRecoveryMessage] = useState('')

    // ── Deploy Collection state ────────────────────────────
    const [deployCollectionModal, setDeployCollectionModal] = useState(false)
    const [deploySuccessModal, setDeploySuccessModal] = useState(false)
    const [collectionName, setCollectionName] = useState('')
    const [collectionDesc, setCollectionDesc] = useState('')
    const [collectionRoyalty, setCollectionRoyalty] = useState(5)
    const [deployStatus, setDeployStatus] = useState<TxStatus>('idle')
    const [deployError, setDeployError] = useState('')
    const [deployedAddress, setDeployedAddress] = useState('')

    const isFormValid = !!name.trim() && !!price.trim() && !!imageFile && walletConnected

    // ── Step helpers ───────────────────────────────────────────
    const updateStep = (i: number, status: MintStep['status']) =>
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status } : s))

    const haptic = useCallback((type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning') => {
        if (!webApp) return
        if (type === 'success' || type === 'error' || type === 'warning') {
            webApp.HapticFeedback.notificationOccurred(type)
        } else {
            webApp.HapticFeedback.impactOccurred(type)
        }
    }, [webApp])

    const persistMintToBackend = useCallback(
        async (payload: PendingMint) => {
            await userClient.createPendingMint({
                clientMintId: payload.clientMintId,
                title: payload.name.trim(),
                description: payload.description.trim(),
                priceTon: Number(payload.price),
                image: payload.imageUrl,
                metadataUrl: payload.metadataUrl,
                collectionAddress: payload.collectionAddress,
                tokenId: payload.tokenId,
                category: 'Collectibles',
                marketTab: 'Explore',
                telegramId: user?.id,
                firstName: user?.first_name,
                lastName: user?.last_name,
                username: user?.username,
                photoUrl: user?.photo_url,
                languageCode: user?.language_code,
                walletAddress: payload.walletAddress || undefined,
                walletType: 'TON',
            })
        },
        [user],
    )

    const pollMintListingSync = useCallback(async (clientMintId: string, txRef: string, maxMs = LISTING_SYNC_MAX_MS) => {
        const started = Date.now()
        while (Date.now() - started < maxMs) {
            try {
                const result = await userClient.resumePendingMint(clientMintId, txRef)
                if (result.ok) return { ok: true as const }
                if (!('pending' in result) || !result.pending) {
                    return {
                        ok: false as const,
                        pending: false as const,
                        reason: (result as { message?: string }).message,
                    }
                }
            } catch {
                // transient User API errors — keep polling until deadline
            }
            await new Promise(r => setTimeout(r, POLL_MS))
        }
        return { ok: false as const, pending: true as const, reason: 'timeout' }
    }, [])

    const verifyAndSync = useCallback(async (txRef: string) => {
        const pending = loadPendingMint()
        if (!pending || isRecoveringMint) return
        setIsRecoveringMint(true)
        try {
            const result = await pollMintListingSync(pending.clientMintId, txRef, 45_000)
            if (result.ok) {
                clearPendingMint()
                localStorage.removeItem(PENDING_TX_KEY)
                setRecoveryMessage(`Recovered and synced "${pending.name}" after wallet return.`)
                await queryClient.invalidateQueries({ queryKey: ['user-market'] })
                await queryClient.invalidateQueries({ queryKey: ['user-home'] })
                await queryClient.refetchQueries({ queryKey: ['user-market'] })
                await queryClient.refetchQueries({ queryKey: ['user-home'] })
            }
        } catch {
            // leave pending data for next retry cycle
        } finally {
            setIsRecoveringMint(false)
        }
    }, [isRecoveringMint, pollMintListingSync, queryClient])

    // ── Core mint logic ───────────────────────────────────────────────────────
    const doMint = useCallback(async () => {
        if (!imageFile) throw new Error('No image selected')
        if (!COLLECTION_ADDRESS) throw new Error(
            'Collection address not set.\nAsk admin to set Global Collection Address in Admin Panel, or deploy your own using the button below.'
        )

        setSteps(INITIAL_STEPS)
        setMintError('')
        setIsMinting(true)

        if (!tonWallet) {
            setIsMinting(false)
            throw new Error('Connect your TON wallet to mint.')
        }
        if (platformFeeOnMintTon > 0 && !feeReceiverWalletAddress) {
            setIsMinting(false)
            throw new Error('Admin fee receiver wallet is not configured.')
        }

        let imageUrl = ''
        let metadataUrl = ''
        let txRef = ''

        // Step 1: Upload image
        updateStep(0, 'loading')
        if (isPinataConfigured()) {
            imageUrl = await uploadImageToIPFS(imageFile)
            setMintedImageUrl(imageUrl)
        } else {
            imageUrl = 'https://ipfs.io/ipfs/QmTESTplaceholderImageUrl'
        }
        updateStep(0, 'done')

        // Step 2: Upload metadata
        updateStep(1, 'loading')
        if (isPinataConfigured()) {
            metadataUrl = await uploadMetadataToIPFS({
                name,
                description,
                image: imageUrl,
                attributes: [
                    { trait_type: 'Price', value: `${price} TON` },
                    { trait_type: 'Network', value: 'TON Mainnet' },
                ],
            })
        } else {
            metadataUrl = `https://raw.githubusercontent.com/ton-blockchain/token-contract/main/nft/nft-item.fc`
        }
        updateStep(1, 'done')

        // Step 3: Get next item index
        updateStep(2, 'loading')
        const itemIndex = await getNextItemIndex(COLLECTION_ADDRESS)
        updateStep(2, 'done')
        const clientMintId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `mint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        // Step 4: Send TON transaction
        updateStep(3, 'loading')
        // Use raw address (0:hex) for owner inside the payload — most compatible
        const ownerAddr = tonRawAddress || tonAddress
        // TonAPI account events: prefer raw hex format for reliable server-side matching
        const walletForSync = tonRawAddress || tonAddress || ''
        const payload = buildNftMintPayload({ itemIndex, ownerAddress: ownerAddr, metadataUrl })

        // Normalize collection address to bounceable EQ... format — required by TON Connect
        const collectionAddr = normalizeCollectionAddress(COLLECTION_ADDRESS)
        if (!collectionAddr) throw new Error('Invalid collection address format')

        // For backend verification, raw hex address is most stable across different user-friendly forms
        let collectionRaw = COLLECTION_ADDRESS
        try {
            if (COLLECTION_ADDRESS) collectionRaw = Address.parse(COLLECTION_ADDRESS).toRawString()
        } catch { /* fallback to original if parsing fails */ }

        // Persist pending mint before wallet open; allows recovery if app is backgrounded.
        savePendingMint({
            clientMintId,
            name,
            description,
            price,
            imageUrl,
            metadataUrl,
            collectionAddress: collectionAddr,
            walletAddress: walletForSync,
            tokenId: String(itemIndex),
        })
        await persistMintToBackend({
            clientMintId,
            name,
            description,
            price,
            imageUrl,
            metadataUrl,
            collectionAddress: collectionRaw || collectionAddr,
            walletAddress: walletForSync,
            tokenId: String(itemIndex),
        })

        const messages: Array<{ address: string; amount: string; payload?: string }> = [{
            address: collectionAddr,  // EQ... bounceable format
            amount: String(Math.floor(mintFeeTonNum * 1e9)),
            payload,
        }]
        if (platformFeeOnMintTon > 0 && feeReceiverWalletAddress) {
            messages.push({
                address: feeReceiverWalletAddress,
                amount: String(Math.floor(platformFeeOnMintTon * 1e9)),
            })
        }
        const result = await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages,
        })
        txRef = result.boc?.slice(0, 44) ?? 'confirmed'
        setTxHash(txRef)
        localStorage.setItem(PENDING_TX_KEY, txRef)
        updateStep(3, 'done')

        // Wallet returned success — wait for backend to acknowledge receipt
        updateStep(4, 'loading')
        let syncOk = false
        try {
            const r = await userClient.resumePendingMint(clientMintId, txRef)
            syncOk = r.ok
            if (r.ok) {
                updateStep(4, 'done')
                clearPendingMint()
                localStorage.removeItem(PENDING_TX_KEY)
                void queryClient.invalidateQueries({ queryKey: ['user-market'] })
                void queryClient.invalidateQueries({ queryKey: ['user-home'] })
                void queryClient.refetchQueries({ queryKey: ['user-market'] })
                void queryClient.refetchQueries({ queryKey: ['user-home'] })
            } else if ('pending' in r && r.pending) {
                // Start background polling, but allow user to close modal
                void pollMintListingSync(clientMintId, txRef, LISTING_SYNC_MAX_MS).then(res => {
                    if (res.ok) {
                        clearPendingMint()
                        localStorage.removeItem(PENDING_TX_KEY)
                        void queryClient.invalidateQueries({ queryKey: ['user-market'] })
                        void queryClient.invalidateQueries({ queryKey: ['user-home'] })
                    }
                })
            }
        } catch (err) {
            console.error('[mint-sync-init] failed', err)
        }

        setIsMinting(false)
        return { ok: syncOk }
    }, [imageFile, name, description, price, tonAddress, tonRawAddress, tonWallet, tonConnectUI, COLLECTION_ADDRESS, persistMintToBackend, pollMintListingSync, queryClient, platformFeeOnMintTon, feeReceiverWalletAddress, mintFeeTonNum])

    // ── Deploy Collection handler ─────────────────────────
    const handleDeployCollection = async () => {
        if (!collectionName.trim()) return
        if (!tonWallet || !tonAddress) {
            setDeployError('Connect your TON wallet to deploy.')
            return
        }
        setDeployStatus('loading')
        setDeployError('')
        try {
            const { address, stateInitBoc, amount } = await buildCollectionDeployTransaction({
                ownerAddress: tonRawAddress || tonAddress,
                collectionName: collectionName.trim(),
                collectionDescription: collectionDesc.trim(),
                royaltyPercent: collectionRoyalty,
            })

            // ⚡ Save address BEFORE opening wallet — so if app reloads on redirect, address is persisted
            saveCollectionAddress(address)
            setDeployedAddress(address)
            setCollectionAddress(address) // Update local state so Mint UI refreshes

            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [{
                    address,
                    amount: String(Math.floor(parseFloat(amount) * 1e9)),
                    stateInit: stateInitBoc,
                }],
            })

            setDeployStatus('success')
            setDeployCollectionModal(false)
            setDeploySuccessModal(true)
        } catch (err: any) {
            setDeployStatus('error')
            setDeployError(
                err?.message?.includes('User declined')
                    ? 'Cancelled by user.'
                    : err?.message ?? 'Deployment failed. Try again.'
            )
        }
    }

    // ── Telegram MainButton handler ───────────────────────────────────────────
    const handleTelegramMint = useCallback(() => {
        if (!isFormValid || !webApp) return
        haptic('medium')

        webApp.showConfirm(
            `Mint "${name}" NFT?\n\nMint fee: ${MINT_FEE} TON\nPlatform fee: ${platformFeeOnMintTon.toFixed(3)} TON\nWallet: ${walletLabel}`,
            async (confirmed) => {
                if (!confirmed) return

                webApp.MainButton.showProgress(true)
                webApp.MainButton.setParams({ text: 'Minting...', is_active: false })

                try {
                    const result = await doMint()
                    webApp.MainButton.hideProgress()
                    haptic('success')
                    
                    const msg = result?.ok 
                        ? `"${name}" has been minted on TON Mainnet and is now live in the marketplace.`
                        : `"${name}" was minted! We're currently syncing it to the marketplace — it will appear shortly.`

                    webApp.showPopup({
                        title: result?.ok ? '🎉 NFT Minted!' : '⏳ Minting Syncing...',
                        message: `${msg}\n\nView on tonscan.org`,
                        buttons: [
                            { id: 'home', type: 'default', text: 'Go to Home' },
                            { id: 'another', type: 'cancel', text: 'Mint Another' },
                        ],
                    }, (buttonId) => {
                        if (buttonId === 'home') {
                            handleReset()
                            navigate('/app/home')
                        } else {
                            handleReset()
                        }
                    })
                } catch (err: any) {
                    webApp.MainButton.hideProgress()
                    webApp.MainButton.setParams({ text: '🚀 Mint NFT', is_active: true })
                    haptic('error')
                    if (err?.message?.includes('User declined') || err?.message?.includes('rejected')) {
                        clearPendingMint()
                    }
                    const msg = err?.message?.includes('User declined') || err?.message?.includes('rejected')
                        ? 'Transaction was cancelled.'
                        : err?.message ?? 'Minting failed. Try again.'
                    webApp.showAlert(`❌ ${msg}`)
                    setIsMinting(false)
                }
            }
        )
    }, [isFormValid, webApp, name, walletLabel, doMint, haptic, navigate])

    // ── Browser fallback handler ──────────────────────────────────────────────
    const handleBrowserMint = async () => {
        setProgressOpen(true)
        try {
            await doMint()
            setProgressOpen(false)
            setSuccessOpen(true)
        } catch (err: any) {
            if (err?.message?.includes('User declined') || err?.message?.includes('rejected')) {
                clearPendingMint()
            }
            const msg = err?.message?.includes('User declined') || err?.message?.includes('rejected')
                ? '❌ Transaction was cancelled.'
                : `❌ ${err?.message ?? 'Minting failed.'}`
            setMintError(msg)
            setSteps(prev => prev.map(s =>
                s.status === 'loading' ? { ...s, status: 'error' } : s
            ))
            setIsMinting(false)
        }
    }

    const handleMintClick = () => {
        if (!walletConnected) { navigate('/app/wallet'); return }
        if (!isFormValid) return
        haptic('light')
        if (isInTelegram && webApp?.showConfirm) {
            handleTelegramMint()
        } else {
            handleBrowserMint()
        }
    }

    const handleReset = () => {
        setName(''); setDescription(''); setPrice('')
        setImageFile(null); setImagePreview(null)
        setSteps(INITIAL_STEPS); setMintError(''); setTxHash(''); setMintedImageUrl('')
        setRecoveryMessage('')
        setIsMinting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ── Telegram MainButton lifecycle ─────────────────────────────────────────
    useEffect(() => {
        if (!webApp?.MainButton || !isInTelegram) return
        const btn = webApp.MainButton

        if (isFormValid && !isMinting) {
            btn.setParams({
                text: '🚀 Mint NFT',
                color: '#6B6AFD',
                text_color: '#FFFFFF',
                is_visible: true,
                is_active: true,
            })
            btn.onClick(handleTelegramMint)
        } else if (!isMinting) {
            btn.hide()
        }

        return () => {
            btn.offClick(handleTelegramMint)
            if (!isMinting) btn.hide()
        }
    }, [isFormValid, isMinting, isInTelegram, webApp, handleTelegramMint])

    // Hide MainButton on unmount
    useEffect(() => {
        return () => { webApp?.MainButton?.hide() }
    }, [webApp])

    useEffect(() => {
        const onResume = () => {
            const tx = localStorage.getItem(PENDING_TX_KEY)
            if (tx) {
                void verifyAndSync(tx)
                return
            }
            const pending = loadPendingMint()
            const storedTx = localStorage.getItem(PENDING_TX_KEY) || ''
            if (pending?.clientMintId) {
                void pollMintListingSync(pending.clientMintId, storedTx, 20_000).then((result) => {
                    if (result.ok) {
                        clearPendingMint()
                        localStorage.removeItem(PENDING_TX_KEY)
                        setRecoveryMessage(`Recovered and synced "${pending.name}" after wallet return.`)
                        void queryClient.invalidateQueries({ queryKey: ['user-market'] })
                        void queryClient.invalidateQueries({ queryKey: ['user-home'] })
                        void queryClient.refetchQueries({ queryKey: ['user-market'] })
                        void queryClient.refetchQueries({ queryKey: ['user-home'] })
                    }
                }).catch(() => {
                    // keep retrying on next resume
                })
            }
        }
        onResume()
        const onFocus = () => { onResume() }
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                onResume()
            }
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [verifyAndSync, pollMintListingSync, queryClient])

    // ── File change ───────────────────────────────────────────────────────────
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        haptic('light')
        setImageFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setImagePreview(reader.result as string)
        reader.readAsDataURL(file)
    }

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className={`px-5 pb-${isInTelegram ? '30' : '30'}`}>

            {/* No collection — full-screen prompt matching app design */}
            {!COLLECTION_ADDRESS && (
                <div className="mt-6 rounded-3xl overflow-hidden">
                    {/* Top gradient banner */}
                    <div className="bg-[#6B6AFD] px-5 pt-8 pb-10 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🎨</span>
                        </div>
                        <p className="text-white font-semibold text-lg mb-1">Collection Required</p>
                        <p className="text-white/75 text-sm">
                            Deploy your NFT collection first — it only takes a few seconds.
                        </p>
                    </div>

                    {/* Steps card */}
                    <div className="bg-white mx-3 -mt-5 rounded-2xl px-4 py-4 shadow-sm">
                        {[
                            { n: '1', text: 'Connect your TON wallet' },
                            { n: '2', text: 'Tap "Deploy Collection Now" below' },
                            { n: '3', text: 'Enter name → Approve in wallet' },
                            { n: '4', text: 'Ready to mint your first NFT!' },
                        ].map(step => (
                            <div key={step.n} className="flex items-center gap-3 py-2">
                                <div className="w-6 h-6 rounded-full bg-[#6B6AFD] flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-[10px] font-bold">{step.n}</span>
                                </div>
                                <p className="text-sm text-[#0E0636]">{step.text}</p>
                            </div>
                        ))}
                    </div>

                    <div className="px-3 mt-3">
                        <button
                            onClick={() => setDeployCollectionModal(true)}
                            className="w-full bg-[#6B6AFD] text-white font-semibold text-sm rounded-2xl py-4 flex items-center justify-center gap-2"
                        >
                            <span>🚀</span>
                            <span>Deploy Collection Now</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Image picker — large tap area */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <button
                onClick={() => { haptic('light'); fileInputRef.current?.click() }}
                className={`mt-6 w-full rounded-3xl overflow-hidden transition-all ${imagePreview
                    ? 'h-[240px] border-2 border-[#6B6AFD]'
                    : 'h-[200px] border-2 border-dashed border-[#6B6AFD66] hover:border-[#6B6AFD] hover:bg-[#6B6AFD08]'
                    }`}
            >
                {imagePreview ? (
                    <div className="relative w-full h-full">
                        <img src={imagePreview} className="w-full h-full object-cover" alt="NFT" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                    <span className="text-xs text-white">✏️</span>
                                </div>
                                <p className="text-white text-xs font-medium">Tap to change image</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-[#6B6AFD15] flex items-center justify-center">
                            <svg className="w-8 h-8 text-[#6B6AFD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[#6B6AFD] font-semibold text-sm">Tap to select image</p>
                            <p className="text-[#666F8B] text-[10px] text-center mt-1">PNG · JPG · GIF · WebP</p>
                        </div>
                    </div>
                )}
            </button>

            {/* Form fields */}
            <div className="mt-6 space-y-4">

                {/* Name */}
                <div>
                    <label className="text-sm font-semibold text-[#0E0636] block mb-1.5">
                        NFT Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => { setName(e.target.value); haptic('light') }}
                        maxLength={50}
                        placeholder="e.g. Crystal Cube #001"
                        className="w-full border border-[#666F8B33] rounded-xl px-4 py-3 text-sm text-[#0E0636] outline-none focus:border-[#6B6AFD] focus:bg-[#6B6AFD04] transition-colors placeholder:text-[#666F8B66]"
                    />
                </div>

                {/* Description */}
                <div>
                    <div className="flex justify-between mb-1.5">
                        <label className="text-sm font-semibold text-[#0E0636]">Description</label>
                        <span className="text-xs text-[#666F8B]">{description.length}/200</span>
                    </div>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value.slice(0, 200))}
                        placeholder="Describe your NFT..."
                        rows={3}
                        className="w-full border border-[#666F8B33] rounded-xl px-4 py-3 text-sm text-[#0E0636] outline-none focus:border-[#6B6AFD] focus:bg-[#6B6AFD04] transition-colors resize-none placeholder:text-[#666F8B66]"
                    />
                </div>

                {/* Price */}
                <div>
                    <label className="text-sm font-semibold text-[#0E0636] block mb-1.5">
                        List Price (TON) <span className="text-red-500">*</span>
                    </label>
                    <div className={`flex items-center border rounded-xl px-4 transition-colors ${price ? 'border-[#6B6AFD] bg-[#6B6AFD04]' : 'border-[#666F8B33]'}`}>
                        <img className="w-5 h-5 rounded shrink-0" src="/ton.jpg" alt="" />
                        <input
                            type="number"
                            value={price}
                            onChange={e => setPrice(e.target.value)}
                            placeholder="0.00"
                            className="flex-1 py-3 pl-3 text-sm text-[#0E0636] outline-none bg-transparent placeholder:text-[#666F8B66]"
                        />
                    </div>
                    <p className="text-[10px] text-[#666F8B] mt-1 pl-1">
                        + {MINT_FEE} TON mint fee · {platformFeeOnMintTon.toFixed(3)} TON platform fee
                    </p>
                </div>

                {/* Wallet status */}
                <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${walletConnected ? 'border-[#6B6AFD33] bg-[#6B6AFD08]' : 'border-[#666F8B33] bg-[#F5F7FB]'}`}>
                    {walletConnected ? (
                        <>
                            <div className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />
                            <p className="text-xs text-[#6B6AFD] font-medium flex-1">{walletLabel}</p>
                            <span className="text-[10px] text-green-500 font-semibold">Ready</span>
                        </>
                    ) : (
                        <>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#666F8B] shrink-0" />
                            <p className="text-xs text-[#666F8B] flex-1">Connect a TON wallet (EVM coming soon)</p>
                            <button
                                onClick={() => navigate('/app/wallet')}
                                className="text-[10px] font-semibold text-[#6B6AFD]"
                            >
                                Connect →
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Mint button — only shown in BROWSER (not Telegram, where MainButton is used) */}
            {!isInTelegram && (
                <button
                    onClick={handleMintClick}
                    disabled={!isFormValid}
                    className="mt-8 w-full h-[52px] bg-[#6B6AFD] text-white rounded-2xl text-sm font-bold disabled:opacity-40 hover:bg-[#5a59e0] transition-colors shadow-lg shadow-[#6B6AFD44]"
                >
                    {!walletConnected ? '🔗 Connect TON Wallet'
                        : !imageFile ? '📷 Select Image to Continue'
                            : !name ? '✏️ Enter NFT Name'
                                : !price ? '💰 Enter Price'
                                    : '🚀 Mint NFT on Testnet'}
                </button>
            )}

            {/* In Telegram — hint that MainButton will appear */}
            {isInTelegram && isFormValid && (
                <div className="mt-6 text-center">
                    <p className="text-xs text-[#666F8B]">
                        ↓ Tap the <span className="font-semibold text-[#6B6AFD]">Mint NFT</span> button below
                    </p>
                </div>
            )}

            {!!recoveryMessage && (
                <div className="mt-4 rounded-xl border border-[#0C8F4F33] bg-[#0C8F4F14] px-3 py-2">
                    <p className="text-xs text-[#0C8F4F]">{recoveryMessage}</p>
                </div>
            )}

            {/* ═══ PROGRESS MODAL (browser fallback) ═══ */}
            <Modal isOpen={progressOpen} onClose={() => { if (!isMinting) { setProgressOpen(false); setMintError(''); setSteps(INITIAL_STEPS) } }}>
                <p className="text-center text-xl font-semibold text-[#0E0636] pb-1">
                    {isMinting ? 'Minting in Progress' : mintError ? 'Minting Failed' : 'Done!'}
                </p>
                <p className="text-center text-xs text-[#666F8B] pb-5">TON Mainnet</p>

                <div className="space-y-4 mb-5">
                    {steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${step.status === 'done' ? 'bg-green-100'
                                : step.status === 'loading' ? 'bg-[#6B6AFD20]'
                                    : step.status === 'error' ? 'bg-red-100'
                                        : 'bg-[#F5F7FB]'
                                }`}>
                                {step.status === 'done' && <span className="text-green-600 text-sm">✓</span>}
                                {step.status === 'loading' && <div className="w-4 h-4 border-2 border-[#6B6AFD] border-t-transparent rounded-full animate-spin" />}
                                {step.status === 'error' && <span className="text-red-500 text-sm">✗</span>}
                                {step.status === 'pending' && <span className="text-[#666F8B] text-xs">{i + 1}</span>}
                            </div>
                            <p className={`text-sm ${step.status === 'done' ? 'text-green-600 font-medium'
                                : step.status === 'loading' ? 'text-[#6B6AFD] font-medium'
                                    : step.status === 'error' ? 'text-red-500'
                                        : 'text-[#666F8B]'
                                }`}>{step.label}</p>
                        </div>
                    ))}
                </div>

                {mintError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                        <p className="text-red-600 text-xs">{mintError}</p>
                    </div>
                )}

                {mintError && (
                    <div className="flex gap-3">
                        <button onClick={() => { setSteps(INITIAL_STEPS); setMintError(''); setIsMinting(false) }}
                            className="flex-1 h-11 border border-[#6B6AFD] text-[#6B6AFD] text-sm rounded-xl">
                            Try Again
                        </button>
                        <button onClick={() => { setProgressOpen(false); setSteps(INITIAL_STEPS); setMintError(''); setIsMinting(false) }}
                            className="flex-1 h-11 bg-[#DA0909] text-white text-sm rounded-xl">
                            Cancel
                        </button>
                    </div>
                )}

                {isMinting && !mintError && (
                    <p className="text-center text-xs text-[#666F8B]">
                        Please approve in your wallet app...
                    </p>
                )}
            </Modal>

            {/* ═══ SUCCESS MODAL (browser fallback) ═══ */}
            <Modal isOpen={successOpen} onClose={() => { setSuccessOpen(false); handleReset(); navigate('/app/home') }}>
                <div className="text-center py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-[#6B6AFD] flex items-center justify-center mb-4">
                        <img className="w-9 h-9" src="/verify.svg" alt="" />
                    </div>
                    <p className="text-xl font-bold text-[#0E0636]">NFT Minted! 🎉</p>
                    <p className="text-sm text-[#666F8B] mt-1 mb-4">
                        <span className="font-semibold text-[#0E0636]">"{name}"</span> is live on TON Mainnet
                    </p>

                    {mintedImageUrl && (
                        <div className="w-24 h-24 mx-auto rounded-2xl overflow-hidden mb-4 border-2 border-[#6B6AFD33]">
                            <img src={mintedImageUrl} className="w-full h-full object-cover" alt="" />
                        </div>
                    )}

                    {txHash && (
                        <div className="bg-[#F5F7FB] rounded-xl px-3 py-2.5 mb-4 text-left">
                            <p className="text-[10px] text-[#666F8B] mb-1">Tx Reference</p>
                            <p className="text-[10px] font-mono text-[#0E0636] break-all">{txHash}</p>
                        </div>
                    )}

                    {COLLECTION_ADDRESS && (
                        <a href={`${TON_EXPLORER}/nft/${COLLECTION_ADDRESS}`} target="_blank" rel="noreferrer"
                            className="block mb-3 text-sm text-[#6B6AFD] font-medium">
                            View on Explorer ↗
                        </a>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => { setSuccessOpen(false); handleReset() }}
                            className="flex-1 h-11 border border-[#6B6AFD] text-[#6B6AFD] text-sm rounded-xl">
                            Mint Another
                        </button>
                        <button onClick={() => { setSuccessOpen(false); handleReset(); navigate('/app/home') }}
                            className="flex-1 h-11 bg-[#6B6AFD] text-white text-sm font-bold rounded-xl">
                            Go Home
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ═══════════ DEPLOY COLLECTION MODAL ═══════════ */}
            <Modal
                className="bottom-0 absolute w-screen m-0 rounded-b-none"
                position="bottom"
                animation="slide-up"
                isOpen={deployCollectionModal}
                onClose={() => setDeployCollectionModal(false)}
            >
                <h2 className="text-center font-semibold text-xl text-[#0E0636]">Deploy NFT Collection</h2>
                <p className="pt-2 pb-5 text-[#666F8B] text-center text-xs">
                    Your collection contract will be deployed on TON {import.meta.env?.VITE_TON_NETWORK === 'testnet' ? 'Testnet' : 'Mainnet'}.
                    Cost: ~0.05 TON
                </p>

                <label className="text-sm font-medium text-[#0E0636]">Collection Name *</label>
                <input
                    className="mt-2 mb-4 w-full h-[52px] border border-[#6B6AFD33] rounded-xl px-4 text-sm outline-none focus:border-[#6B6AFD] bg-[#6B6AFD0D]"
                    placeholder="e.g. My Awesome NFTs"
                    value={collectionName}
                    onChange={e => setCollectionName(e.target.value)}
                    maxLength={64}
                />

                <label className="text-sm font-medium text-[#0E0636]">Description</label>
                <textarea
                    className="mt-2 mb-4 w-full border border-[#6B6AFD33] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#6B6AFD] bg-[#6B6AFD0D] resize-none"
                    placeholder="Describe your NFT collection..."
                    rows={3}
                    value={collectionDesc}
                    onChange={e => setCollectionDesc(e.target.value)}
                    maxLength={256}
                />

                <div className="mb-5">
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-[#0E0636]">Royalty</label>
                        <span className="text-sm font-semibold text-[#6B6AFD]">{collectionRoyalty}%</span>
                    </div>
                    <input
                        type="range"
                        min={0} max={15} step={1}
                        value={collectionRoyalty}
                        onChange={e => setCollectionRoyalty(Number(e.target.value))}
                        className="w-full accent-[#6B6AFD]"
                    />
                    <div className="flex justify-between text-[10px] text-[#666F8B] mt-1">
                        <span>0%</span><span>5%</span><span>10%</span><span>15%</span>
                    </div>
                </div>

                {deployError && (
                    <div className="mb-4 bg-[#DA09091A] border border-[#DA090933] rounded-xl px-4 py-3">
                        <p className="text-[#DA0909] text-xs">{deployError}</p>
                    </div>
                )}

                <button
                    onClick={handleDeployCollection}
                    disabled={!collectionName.trim() || deployStatus === 'loading'}
                    className="w-full bg-[#6B6AFD] text-white text-sm font-semibold rounded-xl h-[48px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {deployStatus === 'loading' ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Deploying...
                        </>
                    ) : '🚀 Deploy Collection'}
                </button>
            </Modal>

            {/* ═══════════ DEPLOY SUCCESS MODAL ═══════════ */}
            <Modal isOpen={deploySuccessModal} onClose={() => setDeploySuccessModal(false)}>
                <div className="text-center py-2">
                    <div className="text-5xl mb-4">🎉</div>
                    <p className="text-xl font-semibold text-[#0E0636]">Collection Deployed!</p>
                    <p className="text-sm text-[#666F8B] pt-2 pb-4">
                        Your NFT collection is live on TON blockchain. You can now mint NFTs into it.
                    </p>
                    <div className="bg-[#F5F7FB] rounded-xl px-4 py-3 mb-4 text-left">
                        <p className="text-[10px] text-[#666F8B] mb-1">Collection Address</p>
                        <p className="font-mono text-xs text-[#0E0636] break-all">{deployedAddress}</p>
                    </div>
                    <div className="flex gap-2 mb-3">
                        <a
                            href={`${TON_EXPLORER_COLLECTION}/address/${deployedAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 h-11 border border-[#6B6AFD] text-[#6B6AFD] text-sm font-semibold rounded-xl flex items-center justify-center"
                        >
                            View on Explorer ↗
                        </a>
                        <button
                            onClick={() => {
                                if (navigator.clipboard) {
                                    navigator.clipboard.writeText(deployedAddress)
                                } else {
                                    webApp?.showAlert(`Address: ${deployedAddress}`)
                                }
                            }}
                            className="flex-1 h-11 bg-[#6B6AFD0D] text-[#6B6AFD] text-sm font-semibold rounded-xl"
                        >
                            Copy Address
                        </button>
                    </div>
                    <button
                        onClick={() => { setDeploySuccessModal(false); }}
                        className="w-full h-11 bg-[#6B6AFD] text-white rounded-xl text-sm font-semibold"
                    >
                        Start Minting →
                    </button>
                </div>
            </Modal>
        </div>
    )
}

export default Mint
