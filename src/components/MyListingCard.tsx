import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { AdminAsset } from '../services/admin/types'
import { useTelegram } from '../contexts/TelegramContext'
import { useFavorites } from '../hooks/useFavorites'

interface MyListingCardProps {
    asset: AdminAsset
}

const IPFS_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
]
const FALLBACK_IMAGE = '/crystal-cube.jpg'

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
    Active:  { dot: 'bg-[#22C55E]', text: 'text-[#16A34A]', label: 'Active' },
    Pending: { dot: 'bg-[#F59E0B]', text: 'text-[#D97706]', label: 'Pending' },
    Owned:   { dot: 'bg-[#6B6AFD]', text: 'text-[#4B4ACE]', label: 'Sold' },
    Flagged: { dot: 'bg-[#EF4444]', text: 'text-[#DC2626]', label: 'Flagged' },
    Removed: { dot: 'bg-[#9CA3AF]', text: 'text-[#6B7280]', label: 'Removed' },
}

export default function MyListingCard({ asset }: MyListingCardProps) {
    const navigate = useNavigate()
    const { user, webApp } = useTelegram()
    const { isFavorite, toggle } = useFavorites(user?.id)
    const { id, nft, title, price, status } = asset

    const [gatewayIdx, setGatewayIdx] = useState(0)
    const [imgSrc, setImgSrc] = useState('')

    const fid = String(id ?? '')
    const favorited = fid ? isFavorite(fid) : false

    const ipfsPath = useMemo(() => {
        const raw = String(nft || '').trim()
        if (raw.startsWith('ipfs://')) return raw.replace(/^ipfs:\/\//, '')
        const m = raw.match(/\/ipfs\/(.+)$/i)
        return m?.[1] || ''
    }, [nft])

    const normalizedImage = useMemo(() => {
        const raw = String(nft || '').trim()
        if (!raw) return FALLBACK_IMAGE
        if (ipfsPath) return `${IPFS_GATEWAYS[gatewayIdx]}${ipfsPath}`
        if (raw.startsWith('//')) return `https:${raw}`
        return raw
    }, [nft, gatewayIdx, ipfsPath])

    useEffect(() => {
        setGatewayIdx(0)
        setImgSrc('')
    }, [nft])

    const resolvedImage = imgSrc || normalizedImage
    const statusStyle = STATUS_STYLES[status] ?? { dot: 'bg-[#9CA3AF]', text: 'text-[#6B7280]', label: status }

    return (
        <div
            className="rounded-2xl border border-[#E8E8F0] bg-white p-3 flex items-center gap-3 cursor-pointer"
            onClick={() => navigate(`/asset/${id}`)}
        >
            {/* Thumbnail */}
            <div className="relative w-20.5 h-20.5 shrink-0">
                <img
                    src={resolvedImage}
                    alt={title}
                    className="w-full h-full object-cover rounded-xl"
                    onError={() => {
                        if (ipfsPath && gatewayIdx < IPFS_GATEWAYS.length - 1) {
                            setGatewayIdx(v => v + 1)
                            return
                        }
                        if (resolvedImage !== FALLBACK_IMAGE) setImgSrc(FALLBACK_IMAGE)
                    }}
                />
                <button
                    type="button"
                    className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center"
                    onClick={e => {
                        e.stopPropagation()
                        toggle(fid, { title, username: asset.username, price, nft: String(nft || '') })
                        webApp?.HapticFeedback?.impactOccurred?.('light')
                    }}
                >
                    <img
                        src={favorited ? '/heart-filled.svg' : '/heart.svg'}
                        className={`w-3 h-3 ${favorited ? '' : 'filter brightness-0 invert'}`}
                        alt=""
                    />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusStyle.dot}`} />
                    <span className={`text-[10px] font-medium ${statusStyle.text}`}>{statusStyle.label}</span>
                </div>
                <p className="text-sm font-semibold text-[#0E0636] truncate">{title}</p>
                <p className="text-sm font-semibold text-[#0E0636] mt-0.5">{price}</p>
            </div>

            {/* Three-dot menu */}
            <button
                type="button"
                className="shrink-0 p-2 flex items-center gap-0.75"
                onClick={e => {
                    e.stopPropagation()
                    navigate(`/asset/${id}`)
                }}
            >
                <span className="w-0.75 h-0.75 rounded-full bg-[#9CA3AF]" />
                <span className="w-0.75 h-0.75 rounded-full bg-[#9CA3AF]" />
                <span className="w-0.75 h-0.75 rounded-full bg-[#9CA3AF]" />
            </button>
        </div>
    )
}
