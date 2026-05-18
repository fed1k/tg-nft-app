import { beginCell, toNano, Address, Cell } from '@ton/core'

const IS_TESTNET = import.meta.env.VITE_TON_NETWORK === 'testnet'
const TON_API_BASE = IS_TESTNET ? 'https://testnet.tonapi.io' : 'https://tonapi.io'
export const TON_EXPLORER = IS_TESTNET ? 'https://testnet.tonscan.org' : 'https://tonscan.org'

/**
 * Build an off-chain content cell (TEP-64 snake encoding).
 * Handles URLs up to ~1000 chars via chained cells.
 */
function encodeOffChainContent(url: string): Cell {
    const bytes = Buffer.from(url, 'utf-8')
    const CHUNK = 127

    // Split into 127-byte chunks
    const chunks: Buffer[] = []
    for (let i = 0; i < bytes.length; i += CHUNK) {
        chunks.push(bytes.slice(i, i + CHUNK))
    }

    // Build chain from last chunk backwards
    let tailCell: Cell | null = null
    for (let i = chunks.length - 1; i >= 1; i--) {
        const b = beginCell().storeBuffer(chunks[i])
        if (tailCell) b.storeRef(tailCell)
        tailCell = b.endCell()
    }

    const root = beginCell()
        .storeUint(0x01, 8) // off-chain content marker (TEP-64)
        .storeBuffer(chunks[0] ?? Buffer.alloc(0))
    if (tailCell) root.storeRef(tailCell)

    return root.endCell()
}

/**
 * Build TEP-62 deploy_nft_item payload.
 * Returns base64-encoded BOC to pass as `payload` in sendTransaction.
 */
export function buildNftMintPayload(params: {
    itemIndex: number
    ownerAddress: string
    metadataUrl: string
}): string {
    const { itemIndex, ownerAddress, metadataUrl } = params

    // Content cell: raw URL bytes (NO TEP-64 prefix for item-level content in mint msg)
    const contentCell = beginCell()
        .storeBuffer(Buffer.from(metadataUrl))
        .endCell()

    // nftItemContent: owner address + reference to content
    const nftItemContent = beginCell()
        .storeAddress(Address.parse(ownerAddress))
        .storeRef(contentCell)
        .endCell()

    // op = 1 → deploy_nft_item (standard TON NFT Collection contract)
    // Source: https://docs.ton.org/v3/guidelines/dapps/tutorials/nft-minting-guide
    return beginCell()
        .storeUint(1, 32)               // op::deploy_nft_item = 1
        .storeUint(0, 64)               // query_id = 0
        .storeUint(itemIndex, 64)       // NFT item index in collection
        .storeCoins(toNano('0.05'))     // amount forwarded to new NFT item contract
        .storeRef(nftItemContent)
        .endCell()
        .toBoc()
        .toString('base64')
}

/**
 * Get next item index from TON API (testnet or mainnet).
 * Falls back to a random index if the collection isn't indexed yet.
 */
export async function getNextItemIndex(collectionAddress: string): Promise<number> {
    try {
        const res = await fetch(
            `${TON_API_BASE}/v2/nfts/collections/${encodeURIComponent(collectionAddress)}`
        )
        if (!res.ok) throw new Error('Collection not found')
        const data = await res.json()
        return typeof data.next_item_index === 'number' ? data.next_item_index : 0
    } catch {
        // Fallback: use a large random index (safe for testing)
        return Math.floor(Math.random() * 9_000_000) + 1_000_000
    }
}

/** Convert TON nanotons balance string to formatted TON */
export function nanosToTon(nanos: string | number): string {
    return (Number(nanos) / 1e9).toFixed(3)
}

/** TEPC-62 transfer — body for sendTransaction.payload (base64 BOC). */
export function buildNftTransferPayload(params: {
    newOwnerAddress: string
    /** Typically current wallet — receives excess TON from NFT contract */
    responseDestination: string
    forwardTon?: string
    queryId?: bigint | number
}): string {
    const forwardTon = params.forwardTon ?? '0.0001'
    const qid = params.queryId ?? 0
    const body = beginCell()
        .storeUint(0x5fcc3d14, 32)
        .storeUint(typeof qid === 'bigint' ? qid : BigInt(qid), 64)
        .storeAddress(Address.parse(params.newOwnerAddress))
        .storeAddress(Address.parse(params.responseDestination))
        .storeUint(0, 1)
        .storeCoins(toNano(forwardTon))
        .storeUint(0, 1)
        .endCell()
    return body.toBoc().toString('base64')
}

const NFT_ITEMS_PAGE = 100
const NFT_ITEMS_MAX_PAGES = 60

/**
 * Resolve NFT item contract address from collection + index (TonAPI scan).
 * Pagination bound defaults to 6000 items max.
 */
export async function resolveNftItemAddressFromCollection(
    collectionAddress: string,
    tokenId: string,
): Promise<string | null> {
    const col = String(collectionAddress || '').trim()
    const target = String(tokenId ?? '').trim()
    if (!col || target === '') return null

    let offset = 0
    for (let page = 0; page < NFT_ITEMS_MAX_PAGES; page++) {
        const res = await fetch(
            `${TON_API_BASE}/v2/nfts/collections/${encodeURIComponent(col)}/items?limit=${NFT_ITEMS_PAGE}&offset=${offset}`,
        )
        if (!res.ok) return null
        const data = await res.json()
        const items = Array.isArray(data?.nft_items) ? data.nft_items : []
        for (const it of items) {
            if (String(it?.index ?? '') === target && it?.address) {
                try {
                    return Address.parse(String(it.address)).toString({ bounceable: true })
                } catch {
                    return String(it.address).trim()
                }
            }
        }
        if (items.length < NFT_ITEMS_PAGE) break
        offset += NFT_ITEMS_PAGE
    }
    return null
}

/** Owner wallet address for NFT item (bounceable user-friendly when parsable). */
export async function fetchNftOwnerAddressFriendly(nftItemAddress: string): Promise<string | null> {
    const addr = String(nftItemAddress || '').trim()
    if (!addr) return null
    const res = await fetch(`${TON_API_BASE}/v2/nfts/${encodeURIComponent(addr)}`)
    if (!res.ok) return null
    const data = await res.json()
    const raw =
        (data?.owner as { address?: string } | undefined)?.address ??
        (typeof data?.owner === 'string' ? data.owner : null) ??
        (data?.nft as { owner?: { address?: string } } | undefined)?.owner?.address ??
        (data as { owner_address?: string })?.owner_address
    if (!raw) return null
    try {
        return Address.parse(String(raw)).toString({ bounceable: true })
    } catch {
        return String(raw).trim()
    }
}

/** Compare two TON addresses loosely (raw vs friendly). */
export function tonAddressesLooselyEqual(a: string, b: string): boolean {
    const x = String(a || '').trim()
    const y = String(b || '').trim()
    if (!x || !y) return false
    try {
        return Address.parse(x).equals(Address.parse(y))
    } catch {
        return false
    }
}
