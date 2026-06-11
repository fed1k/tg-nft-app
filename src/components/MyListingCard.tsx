import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { AdminAsset } from '../services/admin/types'

interface MyListingCardProps {
    asset: AdminAsset
}

const IPFS_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
]
const FALLBACK_IMAGE = '/crystal-cube.jpg'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    Active:  { bg: 'bg-[#D6F5E3]', text: 'text-[#1A7A45]', label: 'Active' },
    Pending: { bg: 'bg-[#FFF3CD]', text: 'text-[#8A6500]', label: 'Pending' },
    Owned:   { bg: 'bg-[#E8E8FF]', text: 'text-[#3B3B9E]', label: 'Sold' },
    Flagged: { bg: 'bg-[#FFE5E5]', text: 'text-[#C0392B]', label: 'Flagged' },
    Removed: { bg: 'bg-[#F0F0F0]', text: 'text-[#666F8B]', label: 'Removed' },
}

export default function MyListingCard({ asset }: MyListingCardProps) {
    const navigate = useNavigate()
    const { id, nft, title, price, status, category } = asset

    const [gatewayIdx, setGatewayIdx] = useState(0)
    const [imgSrc, setImgSrc] = useState('')

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
    const statusStyle = STATUS_STYLES[status] ?? { bg: 'bg-[#F0F0F0]', text: 'text-[#666F8B]', label: status }

    return (
        <div
            className="rounded-3xl overflow-hidden border border-[#0E063620] bg-white shadow-sm cursor-pointer"
            onClick={() => navigate(`/asset/${id}`)}
        >
            {/* Image */}
            <div className="relative w-full h-[130px] bg-[#0E06360D]">
                <img
                    src={resolvedImage}
                    alt={title}
                    className="w-full h-full object-cover"
                    onError={() => {
                        if (ipfsPath && gatewayIdx < IPFS_GATEWAYS.length - 1) {
                            setGatewayIdx(v => v + 1)
                            return
                        }
                        if (resolvedImage !== FALLBACK_IMAGE) setImgSrc(FALLBACK_IMAGE)
                    }}
                />
                {/* Status badge */}
                <span className={`absolute top-2.5 right-2.5 text-[9px] font-semibold px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                    {statusStyle.label}
                </span>
            </div>

            {/* Info */}
            <div className="px-3 pt-3 pb-4">
                <p className="text-xs font-semibold text-[#0E0636] truncate">{title}</p>
                {category && (
                    <p className="text-[9px] text-[#666F8B] mt-0.5">{category}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-semibold text-[#6B6AFD]">{price}</span>
                    <span className="text-[9px] text-[#666F8B]">Your listing</span>
                </div>

                <button
                    onClick={e => { e.stopPropagation(); navigate(`/asset/${id}`) }}
                    className="mt-3 w-full h-[28px] rounded-xl bg-[#0E0636] text-white text-[10px] font-semibold hover:bg-[#1a0f5c] transition-colors"
                >
                    Manage
                </button>
            </div>
        </div>
    )
}
