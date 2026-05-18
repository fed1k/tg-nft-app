import { beginCell, Cell, Address, contractAddress, StateInit, storeStateInit } from '@ton/core'
import { uploadMetadataToIPFS, isPinataConfigured } from './pinata'

const IS_TESTNET = import.meta.env.VITE_TON_NETWORK === 'testnet'
export const TON_EXPLORER_COLLECTION = IS_TESTNET
    ? 'https://testnet.tonscan.org'
    : 'https://tonscan.org'

// ── Official compiled contract code from ton-blockchain/token-contract ──────
// Source: https://docs.ton.org/v3/guidelines/dapps/tutorials/nft-minting-guide
const NFT_COLLECTION_CODE_BOC =
    'te6cckECFAEAAh8AART/APSkE/S88sgLAQIBYgkCAgEgBAMAJbyC32omh9IGmf6mpqGC3oahgsQCASAIBQIBIAcGAC209H2omh9IGmf6mpqGAovgngCOAD4AsAAvtdr9qJofSBpn+pqahg2IOhph+mH/SAYQAEO4tdMe1E0PpA0z/U1NQwECRfBNDUMdQw0HHIywcBzxbMyYAgLNDwoCASAMCwA9Ra8ARwIfAFd4AYyMsFWM8WUAT6AhPLaxLMzMlx+wCAIBIA4NABs+QB0yMsCEsoHy//J0IAAtAHIyz/4KM8WyXAgyMsBE/QA9ADLAMmAE59EGOASK3wAOhpgYC42Eit8H0gGADpj+mf9qJofSBpn+pqahhBCDSenKgpQF1HFBuvgoDoQQhUZYBWuEAIZGWCqALnixJ9AQpltQnlj+WfgOeLZMAgfYBwGyi544L5cMiS4ADxgRLgAXGBEuAB8YEYGYHgAkExIREAA8jhXU1DAQNEEwyFAFzxYTyz/MzMzJ7VTgXwSED/LwACwyNAH6QDBBRMhQBc8WE8s/zMzMye1UAKY1cAPUMI43gED0lm+lII4pBqQggQD6vpPywY/egQGTIaBTJbvy9AL6ANQwIlRLMPAGI7qTAqQC3gSSbCHis+YwMlBEQxPIUAXPFhPLP8zMzMntVABgNQLTP1MTu/LhklMTugH6ANQwKBA0WfAGjhIBpENDyFAFzxYTyz/MzMzJ7VSSXwXiN0CayQ=='

const NFT_ITEM_CODE_BOC =
    'te6cckECDQEAAdAAART/APSkE/S88sgLAQIBYgMCAAmhH5/gBQICzgcEAgEgBgUAHQDyMs/WM8WAc8WzMntVIAA7O1E0NM/+kAg10nCAJp/AfpA1DAQJBAj4DBwWW1tgAgEgCQgAET6RDBwuvLhTYALXDIhxwCSXwPg0NMDAXGwkl8D4PpA+kAx+gAxcdch+gAx+gAw8AIEs44UMGwiNFIyxwXy4ZUB+kDUMBAj8APgBtMf0z+CEF/MPRRSMLqOhzIQN14yQBPgMDQ0NTWCEC/LJqISuuMCXwSED/LwgCwoAcnCCEIt3FzUFyMv/UATPFhAkgEBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AAH2UTXHBfLhkfpAIfAB+kDSADH6AIIK+vCAG6EhlFMVoKHeItcLAcMAIJIGoZE24iDC//LhkiGOPoIQBRONkchQCc8WUAvPFnEkSRRURqBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7ABBHlBAqN1viDACCAo41JvABghDVMnbbEDdEAG1xcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wCTMDI04lUC8ANqhGIu'

export const COLLECTION_STORAGE_KEY = 'ton_collection_address'

export interface CollectionDeployParams {
    ownerAddress: string
    collectionName: string
    collectionDescription: string
    royaltyPercent: number // 0–100
}

// ── TEP-64 off-chain content encoder (snake cell) ────────────────────────────
function encodeOffChainContent(url: string): Cell {
    const bytes = Buffer.from(url, 'utf-8')
    const CHUNK = 127
    const chunks: Buffer[] = []
    for (let i = 0; i < bytes.length; i += CHUNK) {
        chunks.push(bytes.slice(i, i + CHUNK))
    }

    let tailCell: Cell | null = null
    for (let i = chunks.length - 1; i >= 1; i--) {
        const b = beginCell().storeBuffer(chunks[i])
        if (tailCell) b.storeRef(tailCell)
        tailCell = b.endCell()
    }

    const root = beginCell()
        .storeUint(0x01, 8)
        .storeBuffer(chunks[0] ?? Buffer.alloc(0))
    if (tailCell) root.storeRef(tailCell)
    return root.endCell()
}

function buildStateInit(params: CollectionDeployParams, metadataUrl: string): StateInit {
    const collectionCode = Cell.fromBase64(NFT_COLLECTION_CODE_BOC)
    const nftItemCode = Cell.fromBase64(NFT_ITEM_CODE_BOC)

    const owner = Address.parse(params.ownerAddress)
    const royaltyBase = 1000
    const royaltyFactor = Math.min(Math.floor((params.royaltyPercent / 100) * royaltyBase), royaltyBase)

    const royaltyCell = beginCell()
        .storeUint(royaltyFactor, 16)
        .storeUint(royaltyBase, 16)
        .storeAddress(owner) // royalties go to owner
        .endCell()

    const collectionContent = encodeOffChainContent(metadataUrl)
    const commonContent = beginCell()
        .storeBuffer(Buffer.from('')) // per-item base URL (empty = use full URL in item)
        .endCell()

    const contentCell = beginCell()
        .storeRef(collectionContent)
        .storeRef(commonContent)
        .endCell()

    const dataCell = beginCell()
        .storeAddress(owner)
        .storeUint(0, 64)        // next_item_index = 0
        .storeRef(contentCell)
        .storeRef(nftItemCode)
        .storeRef(royaltyCell)
        .endCell()

    return { code: collectionCode, data: dataCell }
}

/** Build the TON Connect transaction for deploying a new NFT collection */
export async function buildCollectionDeployTransaction(
    params: CollectionDeployParams
): Promise<{ address: string; stateInitBoc: string; amount: string; metadataUrl: string }> {
    // Upload collection metadata to IPFS if Pinata is configured
    let metadataUrl: string
    if (isPinataConfigured()) {
        metadataUrl = await uploadMetadataToIPFS({
            name: params.collectionName,
            description: params.collectionDescription,
            image: 'https://placehold.co/400x400/6B6AFD/ffffff?text=NFT',
        })
    } else {
        // Without Pinata: upload to a free public JSON API (jsonblob.com)
        // This gives us a real URL that blockchain explorers can fetch
        try {
            const res = await fetch('https://jsonblob.com/api/jsonBlob', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    name: params.collectionName,
                    description: params.collectionDescription || `${params.collectionName} NFT Collection`,
                    image: 'https://placehold.co/400x400/6B6AFD/ffffff?text=NFT',
                    external_link: '',
                    royalty_basis_points: Math.floor(params.royaltyPercent * 100),
                }),
            })
            if (res.ok) {
                // jsonblob returns the URL in the Location header
                metadataUrl = res.headers.get('Location') || res.url
            } else {
                throw new Error('jsonblob unavailable')
            }
        } catch {
            // Ultimate fallback: a short IPFS URL pointing to a known placeholder metadata
            // This is a publicly pinned empty collection metadata on IPFS
            metadataUrl = 'https://ipfs.io/ipfs/QmYF3JXqNaXNGf7E8iqbEpDpwP1G9eBHaFrKr4G8YEWU7'
        }
    }

    const stateInit = buildStateInit(params, metadataUrl)

    // Calculate deterministic contract address from StateInit
    const address = contractAddress(0, stateInit)

    // Serialize StateInit to BOC
    const siBuilder = beginCell()
    storeStateInit(stateInit)(siBuilder)
    const stateInitBoc = siBuilder.endCell().toBoc().toString('base64')

    return {
        // Contracts MUST use bounceable format (EQ...) — TON Connect rejects non-bounceable for contracts
        address: address.toString({ bounceable: true }),
        stateInitBoc,
        amount: '0.05', // 0.05 TON covers deployment gas
        metadataUrl,
    }
}

/**
 * Normalize any TON address to bounceable format (EQ...).
 * TON Connect sendTransaction requires bounceable addresses for smart contracts.
 * Returns null if the address is invalid, missing, or a placeholder.
 */
export function normalizeCollectionAddress(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null
    const cleaned = raw.trim()
    // Skip obvious .env placeholders (contain dots, template text, or are too short)
    if (cleaned.includes('...') || cleaned.includes('your_') || cleaned.includes('<') || cleaned.length < 48) {
        return null
    }
    try {
        // Address.parse() accepts raw (0:hex), bounceable (EQ...) and non-bounceable (UQ...)
        return Address.parse(cleaned).toString({ bounceable: true })
    } catch {
        return null
    }
}

/** Save deployed collection address to localStorage (always in bounceable format) */
export function saveCollectionAddress(address: string) {
    const normalized = normalizeCollectionAddress(address) ?? address
    localStorage.setItem(COLLECTION_STORAGE_KEY, normalized)
}

/** Get collection address in bounceable format — reads .env first, then localStorage */
export function getCollectionAddress(): string | null {
    const raw =
        import.meta.env.VITE_TON_COLLECTION_ADDRESS?.trim() ||
        localStorage.getItem(COLLECTION_STORAGE_KEY) ||
        null
    return normalizeCollectionAddress(raw)
}
