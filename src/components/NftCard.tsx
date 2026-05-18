import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTelegram } from '../contexts/TelegramContext'
import { useFavorites } from '../hooks/useFavorites'

interface NftCardProps {
    nft?: string
    title?: string
    username?: string
    price?: string
    id?: string | number
    /** Your Collection: no Buy Now / heart — open detail only. */
    collectionMode?: boolean
    /** Show "Owned" / "Your listing" badge on the card */
    ownershipLabel?: string
    /** When set, hides marketplace buy flow and shows admin status + manage action. */
    adminMode?: boolean
    assetStatus?: string
    onAdminManage?: () => void
}

const NftCard = ({
    nft = '/crystal-cube.jpg',
    title = 'Crystal Cube',
    username = '@alexa',
    price = '0.08 TON',
    id = 1,
    collectionMode = false,
    ownershipLabel,
    adminMode = false,
    assetStatus,
    onAdminManage,
}: NftCardProps) => {
    const navigate = useNavigate()
    const { user, webApp } = useTelegram()
    const { isFavorite, toggle } = useFavorites(user?.id)
    const FALLBACK_IMAGE = '/crystal-cube.jpg'
    const IPFS_GATEWAYS = ['https://gateway.pinata.cloud/ipfs/','https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/']
    const [gatewayIdx, setGatewayIdx] = useState(0)
    const [imgSrc, setImgSrc] = useState<string>('')

    const ipfsPathFromAny = useMemo(() => {
        const raw = String(nft || '').trim()
        if (!raw) return ''
        if (raw.startsWith('ipfs://')) return raw.replace(/^ipfs:\/\//, '')
        const m = raw.match(/\/ipfs\/(.+)$/i)
        return m?.[1] || ''
    }, [nft])

    const normalizedImage = useMemo(() => {
        const raw = String(nft || '').trim()
        if (!raw) return FALLBACK_IMAGE
        if (ipfsPathFromAny) return `${IPFS_GATEWAYS[gatewayIdx]}${ipfsPathFromAny}`
        if (raw.startsWith('//')) return `https:${raw}`
        return raw
    }, [nft, gatewayIdx, ipfsPathFromAny])

    useEffect(() => {
        setGatewayIdx(0)
        setImgSrc('')
    }, [nft])

    const resolvedImage = imgSrc || normalizedImage

    const fid = String(id ?? '')
    const favorited = fid ? isFavorite(fid) : false

    return (
        <div className="border relative border-[#666F8B33] rounded-3xl px-2 pt-2 pb-5 bg-[#6B6AFD0D]">
            <div className="bg-[#0E06361A] h-[107px] w-[150px] absolute z-10 rounded-2xl"></div>
            {!adminMode && !collectionMode && fid ? (
                <button
                    type="button"
                    aria-label={favorited ? 'Remove from favourites' : 'Save to favourites'}
                    className="z-50 right-4.5 top-4.5 absolute p-0 border-0 bg-transparent cursor-pointer"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggle(fid, { title, username, price, nft: String(nft || '') })
                        webApp?.HapticFeedback?.impactOccurred?.('light')
                    }}
                >
                    <img
                        src={favorited ? '/heart-filled.svg' : '/heart.svg'}
                        className={`w-3.5 h-3.5 ${favorited ? '' : 'filter brightness-0 invert'}`}
                        alt=""
                    />
                </button>
            ) : null}
            {adminMode && assetStatus && (
                <span className="absolute z-50 right-2 top-2 text-[8px] font-semibold bg-[#0E0636] text-white px-1.5 py-0.5 rounded">
                    {assetStatus}
                </span>
            )}
            {ownershipLabel && !adminMode && (
                <span className="absolute z-50 left-2 top-2 text-[8px] font-semibold bg-[#6B6AFD] text-white px-1.5 py-0.5 rounded">
                    {ownershipLabel}
                </span>
            )}
            <img
                className="w-[150px] h-[107px] rounded-2xl cursor-pointer"
                src={resolvedImage}
                alt={title}
                onError={() => {
                    console.error('[NftCard] image load failed', {
                        id,
                        title,
                        nftRaw: nft,
                        failedSrc: resolvedImage,
                        fallback: FALLBACK_IMAGE,
                    })
                    if (ipfsPathFromAny && gatewayIdx < IPFS_GATEWAYS.length - 1) {
                        setGatewayIdx((v) => v + 1)
                        return
                    }
                    if (resolvedImage !== FALLBACK_IMAGE) setImgSrc(FALLBACK_IMAGE)
                }}
                onClick={() => (adminMode ? onAdminManage?.() : navigate(`/asset/${id}`))}
            />
            <p
                className="pt-4 pb-2 text-xs font-medium text-[#0E0636] cursor-pointer"
                onClick={() => (adminMode ? onAdminManage?.() : navigate(`/asset/${id}`))}
            >
                {title}
            </p>
            <div className="flex items-center justify-between pb-4">
                <p className="font-light text-[10px] text-[#0E0636]">{username}</p>
                <p className="font-semibold text-[#6B6AFD] text-[10px]">{price}</p>
            </div>

            <button
                onClick={() => (adminMode ? onAdminManage?.() : navigate(`/asset/${id}`))}
                className="border h-[25px] text-[10px] text-[#6B6AFD] font-semibold border-[#6B6AFD] bg-white w-full rounded-lg hover:bg-[#6B6AFD] hover:text-white transition-colors"
            >
                {adminMode ? 'Manage' : collectionMode ? 'View' : 'Buy Now'}
            </button>
        </div>
    )
}

export default NftCard
