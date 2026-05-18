import React, { useMemo, useState } from 'react'
import Modal from './Modal'
import { useQuery } from '@tanstack/react-query'
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react'
import { useAccount, useSendTransaction } from 'wagmi'
import { parseEther } from 'viem'
import { Address } from '@ton/core'
import { userClient } from '../services/user'
import type { GiftMarketListing } from '../services/user/client'
import type { TelegramWebApp } from '../contexts/TelegramContext'

export type GiftListingActorPayload = {
  telegramId?: number
  firstName?: string
  lastName?: string
  username?: string
  photoUrl?: string
  languageCode?: string
  walletAddress?: string
  walletType?: 'TON' | 'EVM'
}

function normalizeTonAddress(raw: string): string | null {
  const cleaned = String(raw || '').trim()
  if (!cleaned) return null
  try {
    return Address.parse(cleaned).toString({ bounceable: true })
  } catch {
    return null
  }
}

function isEthAddress(raw: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(raw || '').trim())
}

const formatTon = (value: number): string => {
  if (!Number.isFinite(value)) return '0.000'
  if (value === 0) return '0.000'
  if (value < 0.001) return value.toFixed(6)
  return value.toFixed(4)
}

type MiniAppHooks = Partial<Pick<TelegramWebApp, 'HapticFeedback' | 'showAlert'>>

type Props = {
  listing: GiftMarketListing
  open: boolean
  onClose: () => void
  initData: string
  usernameForApi: string
  walletForProfile: string
  actorPayload: GiftListingActorPayload
  starsAvailable: number
  webApp?: MiniAppHooks
  onSuccess: () => void
}

export default function GiftMarketBuyModal({
  listing,
  open,
  onClose,
  initData,
  usernameForApi,
  walletForProfile,
  actorPayload,
  starsAvailable,
  webApp,
  onSuccess,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const tonFriendly = useTonAddress()
  const tonRawAddress = useTonAddress(false)
  const [tonConnectUI] = useTonConnectUI()
  const tonWallet = useTonWallet()
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const { sendTransactionAsync: evmSendTx } = useSendTransaction()

  const { data: platformSettings } = useQuery({
    queryKey: ['user-platform-settings'],
    queryFn: () => userClient.getPlatformSettings(),
    enabled: open,
    staleTime: 30_000,
  })

  const pricing = listing.pricing === 'ton' || listing.pricing === 'stars' ? listing.pricing : listing.priceTon > 0 ? 'ton' : 'stars'

  const baseTonPrice = pricing === 'ton' ? Math.max(Number(listing.priceTon) || 0, Number.EPSILON) : 0

  const feePercent = Math.max(0, Number(platformSettings?.platformFeePercent ?? 0))
  const feeReceiverWalletAddress = String(platformSettings?.feeReceiverWalletAddress || '').trim()

  const platformFeeTon = Number(((baseTonPrice * feePercent) / 100).toFixed(9))
  const sellerPayoutTon = Number(Math.max(0, baseTonPrice - platformFeeTon).toFixed(9))

  const platformFeeStars = Math.round((Math.max(Number(listing.priceStars) || 0, 0) * feePercent) / 100)
  const deliveryStarsHint = Math.max(0, Number(listing.telegramStarCost) || 0)

  const sellerWalletAddress = listing.sellerWalletAddress || ''
  const sellerTonAddress = normalizeTonAddress(sellerWalletAddress)
  const sellerIsEvmPayee = isEthAddress(sellerWalletAddress)

  /** TON-priced checkout: hints which payout rail the seller uses (TonConnect vs EVM). */
  const cryptoCheckoutHint = !sellerWalletAddress
    ? '—'
    : !sellerTonAddress && !sellerIsEvmPayee
      ? 'Invalid seller payout'
      : sellerTonAddress
        ? tonWallet && tonFriendly
          ? 'TON connected'
          : 'Connect TON wallet'
        : evmConnected
          ? 'EVM connected'
          : 'Connect EVM wallet'

  const canBuyStars = pricing === 'stars' && listing.priceStars >= 1 && starsAvailable >= listing.priceStars
  /** For TON, buyer pays chain first; Telegram delivery debits Stars on server — require balance up front. */
  const canDeliverAfterTon =
    pricing !== 'ton' || deliveryStarsHint <= 0 || starsAvailable >= deliveryStarsHint

  /** Seller may have TON-friendly or 0x wallet on file (mirrors NFT flow); buyer must use matching wallet type. */
  const canPayTonCheckout =
    pricing !== 'ton' ||
    (!!sellerWalletAddress &&
      canDeliverAfterTon &&
      !!(
        (sellerTonAddress && tonWallet && tonFriendly) ||
        (sellerIsEvmPayee && evmConnected && evmAddress)
      ))

  async function submitStars() {
    setMsg('')
    setBusy(true)
    try {
      await userClient.buyGiftMarketListing({
        initData,
        listingId: listing.id,
        paymentMethod: 'stars',
        ...actorPayload,
        walletAddress: walletForProfile || actorPayload.walletAddress,
      })
      webApp?.HapticFeedback?.notificationOccurred?.('success')
      onSuccess()
      onClose()
    } catch (e: unknown) {
      webApp?.HapticFeedback?.notificationOccurred?.('error')
      setMsg((e as Error)?.message || 'Purchase failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitTon() {
    setMsg('')
    if (pricing !== 'ton' || listing.priceTon <= 0) return

    if (!sellerTonAddress && !sellerIsEvmPayee) {
      setMsg('Seller wallet on file is invalid (need TON address or 0x EVM address).')
      return
    }
    if (!canDeliverAfterTon) {
      setMsg(
        `You need ${deliveryStarsHint.toLocaleString()} in-app Stars for Telegram delivery after paying TON. Available: ${starsAvailable.toLocaleString()}.`,
      )
      return
    }
    if (platformFeeTon > 0 && !feeReceiverWalletAddress) {
      setMsg('Platform fee receiver is not configured.')
      return
    }
    if (platformFeeTon > 0 && feeReceiverWalletAddress === sellerWalletAddress) {
      setMsg('Platform fee receiver must differ from seller wallet (admin setup).')
      return
    }

    let feeTonAddress: string | null = null
    let feeEthAddress: `0x${string}` | null = null
    if (platformFeeTon > 0 && feeReceiverWalletAddress) {
      if (sellerTonAddress) {
        feeTonAddress = normalizeTonAddress(feeReceiverWalletAddress)
        if (!feeTonAddress) {
          setMsg('Platform fee must be a valid TON address for this seller wallet type.')
          return
        }
      } else {
        feeEthAddress = isEthAddress(feeReceiverWalletAddress)
          ? (feeReceiverWalletAddress.trim() as `0x${string}`)
          : null
        if (!feeEthAddress) {
          setMsg('Platform fee must be a valid EVM (0x…) address when seller is paid on EVM.')
          return
        }
      }
    }

    setBusy(true)
    try {
      let txRef = ''
      const sellerNanotons = Math.floor(sellerPayoutTon * 1e9)
      const feeNanotons = Math.floor(platformFeeTon * 1e9)

      if (sellerTonAddress && tonWallet && tonFriendly) {
        const messages: Array<{ address: string; amount: string }> = [
          { address: sellerTonAddress, amount: String(sellerNanotons) },
        ]
        if (feeNanotons > 0 && feeTonAddress) {
          messages.push({ address: feeTonAddress, amount: String(feeNanotons) })
        }
        const result = await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 360,
          messages,
        })
        txRef = result.boc || `ton-${Date.now()}`
      } else if (sellerIsEvmPayee && evmConnected && evmAddress) {
        const toSeller = sellerWalletAddress.trim() as `0x${string}`
        const sellerHash =
          (await evmSendTx({
            to: toSeller,
            value: parseEther(sellerPayoutTon.toFixed(6)),
          })) || ''
        let feeHash = ''
        if (platformFeeTon > 0 && feeEthAddress) {
          feeHash =
            (await evmSendTx({
              to: feeEthAddress,
              value: parseEther(platformFeeTon.toFixed(6)),
            })) || ''
        }
        txRef = [sellerHash, feeHash].filter(Boolean).join('|') || `evm-${Date.now()}`
      } else {
        setMsg(
          sellerTonAddress
            ? 'Connect TonConnect (TON) — this seller listing pays a TON-format wallet.'
            : 'Connect EVM — this seller listing pays a 0x wallet.',
        )
        setBusy(false)
        return
      }

      await userClient.buyGiftMarketListing({
        initData,
        listingId: listing.id,
        paymentMethod: 'crypto',
        txRef,
        ...actorPayload,
        walletAddress:
          walletForProfile || actorPayload.walletAddress || tonFriendly || tonRawAddress || evmAddress || '',
        walletType: tonWallet ? 'TON' : evmConnected ? 'EVM' : undefined,
      })
      webApp?.HapticFeedback?.notificationOccurred?.('success')
      onSuccess()
      onClose()
    } catch (e: unknown) {
      webApp?.HapticFeedback?.notificationOccurred?.('error')
      const m = (e as Error)?.message || ''
      setMsg(m.includes('User declined') ? 'Wallet cancelled.' : m || 'Payment failed.')
    } finally {
      setBusy(false)
    }
  }

  const title = pricing === 'ton' ? `Buy • ${listing.priceTon} TON` : `Buy • ${listing.priceStars.toLocaleString()} Stars`

  const summary = useMemo(() => {
    if (pricing === 'ton') {
      return `${formatTon(listing.priceTon)} TON listing · ~${deliveryStarsHint} ★ Telegram delivery fee from Stars`
    }
    return `${listing.priceStars.toLocaleString()} Stars (includes escrow split seller + fee + Telegram cost)`
  }, [pricing, listing.priceTon, listing.priceStars, deliveryStarsHint])

  return (
    <Modal isOpen={open} onClose={() => !busy && onClose()}>
      <p className="text-center text-lg font-semibold text-[#0E0636] pb-1">{title}</p>
      <p className="text-[11px] text-[#666F8B] text-center pb-3 leading-snug">{summary}</p>

      <div className="rounded-xl bg-[#F5F7FB] px-3 py-2 text-[11px] text-[#0E0636] space-y-1 mb-2">
        <p>
          After payment the bot sends the gift to{' '}
          <strong>{usernameForApi || `Telegram ${actorPayload.telegramId ?? '—'}`}</strong> — it appears under your Telegram
          gifts (same Telegram delivery contract as collectible sends).
        </p>
      </div>

      {pricing === 'ton' ? (
        <>
          <p className="text-xs text-[#666F8B] pb-1">
            Pay seller + platform ({feePercent}% fee){' '}
            <span className="text-[#0E0636] font-medium">{cryptoCheckoutHint}</span>
          </p>
          <ul className="text-[11px] text-[#666F8B] space-y-0.5 pb-2">
            <li>→ Seller payout: ~{formatTon(sellerPayoutTon)} TON</li>
            <li>→ Platform fee: ~{formatTon(platformFeeTon)} TON</li>
          </ul>
          {deliveryStarsHint > 0 ? (
            <p className="text-[11px] text-amber-800 pb-2">
              Delivery: Telegram charges ~{deliveryStarsHint} Stars — deducted from your GiftedForge Stars after the chain
              payment confirms (you have {starsAvailable.toLocaleString()}).
            </p>
          ) : null}
          {!sellerWalletAddress ? (
            <p className="text-[11px] text-[#DA0909]">Seller wallet missing — listing cannot be settled in TON yet.</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-xs text-[#666F8B] pb-1">
            Full price {listing.priceStars.toLocaleString()} Stars · Fee {platformFeeStars.toLocaleString()} ★ ({feePercent}%)
          </p>
          {starsAvailable < listing.priceStars ? (
            <p className="text-[11px] text-[#DA0909] pb-2">Insufficient Stars balance.</p>
          ) : null}
        </>
      )}

      {msg ? <p className="text-[11px] text-[#DA0909] text-center pb-2">{msg}</p> : null}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onClose()}
          className="flex-1 h-11 rounded-xl border border-[#6B6AFD] text-[#6B6AFD] text-sm font-semibold"
        >
          Cancel
        </button>
        {pricing === 'ton' ? (
          <button
            type="button"
            disabled={busy || !canPayTonCheckout}
            onClick={() => void submitTon()}
            className="flex-1 h-11 rounded-xl bg-[#0E0636] text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy ? '…' : 'Pay & receive gift'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canBuyStars}
            onClick={() => void submitStars()}
            className="flex-1 h-11 rounded-xl bg-[#6B6AFD] text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy ? '…' : 'Pay with Stars'}
          </button>
        )}
      </div>
    </Modal>
  )
}
