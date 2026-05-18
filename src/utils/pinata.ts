const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string | undefined

export const isPinataConfigured = () => !!PINATA_JWT

/** Upload an image File to Pinata IPFS. Returns public gateway URL. */
export async function uploadImageToIPFS(file: File): Promise<string> {
    if (!PINATA_JWT) throw new Error('VITE_PINATA_JWT is not set in .env')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('pinataMetadata', JSON.stringify({ name: file.name }))
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PINATA_JWT}` },
        body: formData,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.details ?? 'Image upload to IPFS failed')
    }
    const data = await res.json()
    return `https://ipfs.io/ipfs/${data.IpfsHash}`
}

export interface NftMetadata {
    name: string
    description: string
    image: string           // IPFS URL of the image
    attributes?: Array<{ trait_type: string; value: string | number }>
}

/** Upload NFT metadata JSON to Pinata IPFS. Returns public gateway URL. */
export async function uploadMetadataToIPFS(metadata: NftMetadata): Promise<string> {
    if (!PINATA_JWT) throw new Error('VITE_PINATA_JWT is not set in .env')

    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: { name: `${metadata.name} — metadata.json` },
        }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.details ?? 'Metadata upload to IPFS failed')
    }
    const data = await res.json()
    return `https://ipfs.io/ipfs/${data.IpfsHash}`
}
