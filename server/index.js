import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import {
  EMBEDDED_TELEGRAM_BOT_TOKEN,
  GIFTEDFORGE_FRONTEND_ORIGIN,
} from './giftedforgeDeploy.js'

const app = express()

const PORT = Number(process.env.ADMIN_API_PORT || 4000)
const MONGODB_URI = process.env.MONGODB_URI?.trim()?.replace(/^['"]|['"]$/g, '')
const TON_NETWORK = String(process.env.TON_NETWORK || 'mainnet').trim()
const TON_API_BASE = TON_NETWORK === 'mainnet' ? 'https://tonapi.io' : 'https://testnet.tonapi.io'
const MINT_FEE_TON = Number.parseFloat(String(process.env.MINT_FEE_TON || '0.07')) || 0.07
/** If true, listings are created only after TonAPI sees the mint fee transfer (slower, stricter). */
const MINT_REQUIRE_CHAIN_VERIFY = String(process.env.MINT_REQUIRE_CHAIN_VERIFY || '').toLowerCase() === 'true'
const DEFAULT_CLIENT_ORIGINS = ['http://localhost:5173', GIFTEDFORGE_FRONTEND_ORIGIN]
const ENV_CLIENT_ORIGINS = String(process.env.ADMIN_CLIENT_ORIGIN || '')
  .split(/[,\s]+/)
  .map((v) => v.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const CLIENT_ORIGINS = Array.from(
  new Set(
    [...DEFAULT_CLIENT_ORIGINS, ...ENV_CLIENT_ORIGINS].map((o) => String(o).trim().replace(/\/+$/, '')),
  ),
)
const ASSET_CATEGORIES = new Set(['3D Art', 'Collectibles', 'Gaming'])
const MARKET_TABS = new Set(['Explore', 'StarGifts'])
const REFERRAL_BONUS_USD = Number.parseFloat(String(process.env.REFERRAL_BONUS_USD || '5')) || 5
const _embedTok = String(EMBEDDED_TELEGRAM_BOT_TOKEN || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
const _envTok = String(process.env.TELEGRAM_BOT_TOKEN || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
/** Non-empty `EMBEDDED_TELEGRAM_BOT_TOKEN` wins over env (testing / wrong Vercel token). Production: leave embedded empty and use env only. */
const TELEGRAM_BOT_TOKEN =
  _embedTok.length > 15 && _embedTok.includes(':') ? _embedTok : _envTok || _embedTok
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()

if (!MONGODB_URI) {
  // Hard-stop so panel never silently falls back to fake data.
  throw new Error('MONGODB_URI is required in environment')
}

app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = origin?.replace(/\/+$/, '')
      if (!origin || CLIENT_ORIGINS.includes(normalizedOrigin)) {
        return callback(null, true)
      }
      return callback(
        new Error(`CORS blocked for origin: ${origin}. Allowed: ${CLIENT_ORIGINS.join(', ')}`),
      )
    },
    credentials: false,
  }),
)
app.use(express.json())
app.use((req, _res, next) => {
  req._rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  console.log(`[${req._rid}] ${req.method} ${req.path}`)
  next()
})

const commonOpts = { timestamps: true, versionKey: false }

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, unique: true, sparse: true, index: true },
    img: { type: String, default: '/white-man.jpg' },
    name: { type: String, required: true, trim: true },
    walletCount: { type: Number, default: 0 },
    balanceLabel: { type: String, default: '$0' },
    stars: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Active', 'Flagged', 'Suspended', 'Banned'],
      default: 'Active',
    },
    email: { type: String, trim: true },
    username: { type: String, trim: true },
    walletAddress: { type: String, trim: true },
    referralCode: { type: String, trim: true, unique: true, sparse: true, index: true },
    referredByCode: { type: String, trim: true },
    referralCount: { type: Number, default: 0 },
    referralEarnedUsd: { type: Number, default: 0 },
    referralPendingUsd: { type: Number, default: 0 },
  },
  commonOpts,
)

const assetSchema = new mongoose.Schema(
  {
    nft: { type: String, default: '/crystal-cube.jpg' },
    title: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true },
    tokenId: { type: String, trim: true, index: true },
    /** TEP-62 NFT item contract — resolved via TonAPI after mint when possible */
    nftItemAddress: { type: String, trim: true },
    collectionAddress: { type: String, trim: true },
    metadataUrl: { type: String, trim: true },
    category: { type: String, default: 'Collectibles', trim: true },
    marketTab: { type: String, enum: ['Explore', 'StarGifts'], default: 'Explore' },
    price: { type: String, default: '0 TON', trim: true },
    status: {
      type: String,
      enum: ['Active', 'Pending', 'Owned', 'Removed', 'Flagged'],
      default: 'Pending',
    },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  commonOpts,
)

const txSchema = new mongoose.Schema(
  {
    icon: { type: String, default: '/box.svg' },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Mint', 'Swap', 'Gift', 'Deposit', 'Withdraw'],
      required: true,
    },
    fromUser: { type: String, required: true, trim: true },
    toUser: { type: String, required: true, trim: true },
    amount: { type: String, required: true, trim: true },
    feeLabel: { type: String, default: '', trim: true },
    /** Optional link back to marketplace asset (e.g. offer rows). */
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAsset' },
  },
  commonOpts,
)

const starsPaymentSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, index: true },
    providerPaymentChargeId: { type: String, trim: true, index: true },
    telegramPaymentChargeId: { type: String, trim: true, unique: true, index: true },
    currency: { type: String, trim: true },
    totalAmount: { type: Number, required: true },
    payload: { type: String, trim: true },
    rawUpdate: { type: mongoose.Schema.Types.Mixed },
  },
  commonOpts,
)

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true },
    /** Linked when the user has opened GiftedForge (AdminUser row exists). */
    telegramId: { type: Number, index: true },
    roles: { type: [String], default: ['support'] },
    online: { type: Boolean, default: false },
  },
  commonOpts,
)

const settingsSchema = new mongoose.Schema(
  {
    platformFeePercent: { type: Number, default: 2 },
    feeReceiverWalletAddress: { type: String, default: '', trim: true },
    /** In-app Stars collected from Stars-based marketplace checkout (not on-chain). */
    platformStarsAccrued: { type: Number, default: 0 },
    maxUploadMb: { type: Number, default: 500 },
    tonEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  commonOpts,
)

const alertSchema = new mongoose.Schema(
  {
    icon: { type: String, default: '/danger.svg' },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
    timeBadge: { type: String, default: 'Now' },
  },
  commonOpts,
)

const pendingMintSchema = new mongoose.Schema(
  {
    clientMintId: { type: String, required: true, unique: true, index: true },
    walletAddress: { type: String, required: true, trim: true },
    collectionAddress: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    metadataUrl: { type: String, trim: true },
    category: { type: String, default: 'Collectibles' },
    marketTab: { type: String, default: 'Explore' },
    priceTon: { type: Number, required: true },
    txRef: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'confirmed', 'saved', 'failed'], default: 'pending' },
    telegramId: { type: Number },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    username: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    languageCode: { type: String, trim: true },
    walletType: { type: String, enum: ['TON', 'EVM'] },
    tokenId: { type: String, trim: true },
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAsset' },
    verifyError: { type: String, trim: true },
    lastCheckedAt: { type: Date },
  },
  commonOpts,
)

/** P2P Telegram gift listings (regular gifts). Payment: in-app Stars or TON (seller wallet). Fulfillment: bot sendGift → gift appears on buyer’s Telegram profile (Telegram does not remove the seller’s original row for regular gifts). */
const giftListingSchema = new mongoose.Schema(
  {
    sellerTelegramId: { type: Number, required: true, index: true },
    sellerUsername: { type: String, trim: true, default: '' },
    giftId: { type: String, required: true, trim: true },
    ownedGiftId: { type: String, trim: true, default: '' },
    giftKind: { type: String, enum: ['regular'], default: 'regular' },
    emoji: { type: String, default: '🎁' },
    label: { type: String, default: '', trim: true },
    telegramStarCost: { type: Number, default: 0 },
    /** `stars` — buyer pays GiftedForge Stars; `ton` — buyer pays seller + platform via TON wallet. */
    pricing: { type: String, enum: ['stars', 'ton'], default: 'stars', index: true },
    priceStars: { type: Number, default: 0, min: 0 },
    priceTon: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Active', 'Processing', 'Sold', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    buyerTelegramId: { type: Number },
    buyerUsername: { type: String, trim: true, default: '' },
    soldAt: { type: Date },
  },
  commonOpts,
)
giftListingSchema.index({ status: 1, createdAt: -1 })

const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', userSchema)
const AdminAsset = mongoose.models.AdminAsset || mongoose.model('AdminAsset', assetSchema)
const AdminTransaction =
  mongoose.models.AdminTransaction || mongoose.model('AdminTransaction', txSchema)
const StarsPayment =
  mongoose.models.StarsPayment || mongoose.model('StarsPayment', starsPaymentSchema)
const AdminStaff = mongoose.models.AdminStaff || mongoose.model('AdminStaff', staffSchema)
const AdminSettings = mongoose.models.AdminSettings || mongoose.model('AdminSettings', settingsSchema)
const AdminAlert = mongoose.models.AdminAlert || mongoose.model('AdminAlert', alertSchema)
const PendingMint = mongoose.models.PendingMint || mongoose.model('PendingMint', pendingMintSchema)
const GiftListing = mongoose.models.GiftListing || mongoose.model('GiftListing', giftListingSchema)

function fmtDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

function minutesAgoLabel(createdAt) {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr`
  return `${Math.floor(hrs / 24)} day`
}

function toAdminUser(doc) {
  const rawBalance = String(doc.balanceLabel || '').trim()
  const balanceLabel = /^Connected\s/i.test(rawBalance) || !rawBalance ? '$0' : rawBalance
  return {
    id: String(doc._id),
    img: doc.img,
    name: doc.name,
    walletCount: doc.walletCount,
    balanceLabel,
    stars: doc.stars,
    joinDate: fmtDate(doc.createdAt),
    status: doc.status,
    email: doc.email,
    username: doc.username,
    walletAddress: doc.walletAddress,
    referralCode: doc.referralCode,
    referredByCode: doc.referredByCode,
    referralCount: Number(doc.referralCount) || 0,
    referralEarnedUsd: Number(doc.referralEarnedUsd) || 0,
    referralPendingUsd: Number(doc.referralPendingUsd) || 0,
  }
}

function toAdminAsset(doc) {
  return {
    id: String(doc._id),
    nft: doc.nft,
    title: doc.title,
    username: doc.username,
    tokenId: doc.tokenId || undefined,
    metadataUrl: doc.metadataUrl || undefined,
    nftItemAddress: doc.nftItemAddress || undefined,
    collectionAddress: doc.collectionAddress || undefined,
    category: doc.category,
    marketTab: doc.marketTab,
    price: doc.price,
    status: doc.status,
    ownerUserId: doc.ownerUserId ? String(doc.ownerUserId) : undefined,
  }
}

function toGiftListing(doc) {
  if (!doc) return null
  const priceTonNum = Number(doc.priceTon) || 0
  const priceStarsNum = Number(doc.priceStars) || 0
  const pricingRaw = String(doc.pricing || '').trim()
  const pricing =
    pricingRaw === 'ton' || pricingRaw === 'stars'
      ? pricingRaw
      : priceTonNum > 0
        ? 'ton'
        : 'stars'

  return {
    id: String(doc._id),
    sellerTelegramId: doc.sellerTelegramId,
    sellerUsername: doc.sellerUsername || '',
    giftId: doc.giftId,
    ownedGiftId: doc.ownedGiftId || '',
    giftKind: doc.giftKind || 'regular',
    emoji: doc.emoji || '🎁',
    label: doc.label || 'Gift',
    telegramStarCost: Number(doc.telegramStarCost) || 0,
    pricing,
    priceStars: priceStarsNum,
    priceTon: priceTonNum,
    status: doc.status,
    buyerTelegramId: doc.buyerTelegramId,
    buyerUsername: doc.buyerUsername || '',
    soldAt: doc.soldAt ? doc.soldAt.toISOString() : undefined,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined,
    /** Filled by list endpoints via AdminUser lookup */
    sellerWalletAddress: '',
  }
}

async function enrichGiftListingsWithSellerWallets(rows) {
  const objs = rows.map((r) => (r && typeof r.toObject === 'function' ? r.toObject() : r))
  const tgIds = [
    ...new Set(
      objs
        .map((d) => d.sellerTelegramId)
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ]
  if (!tgIds.length) return objs.map((d) => toGiftListing(d))
  const sellers = await AdminUser.find({ telegramId: { $in: tgIds } })
    .select('telegramId walletAddress')
    .lean()
  const map = new Map(sellers.map((s) => [s.telegramId, String(s.walletAddress || '').trim()]))
  return objs.map((d) => ({
    ...toGiftListing(d),
    sellerWalletAddress: map.get(d.sellerTelegramId) || '',
  }))
}

const NFT_ITEMS_PAGE = 100
const NFT_ITEMS_MAX_PAGES = 60

async function resolveNftItemAddressTonApi(collectionAddress, tokenId) {
  const col = String(collectionAddress || '').trim()
  const target = String(tokenId ?? '').trim()
  if (!col || !target) return null
  let offset = 0
  for (let page = 0; page < NFT_ITEMS_MAX_PAGES; page++) {
    try {
      const res = await fetch(
        `${TON_API_BASE}/v2/nfts/collections/${encodeURIComponent(col)}/items?limit=${NFT_ITEMS_PAGE}&offset=${offset}`,
      )
      if (!res.ok) return null
      const data = await res.json()
      const items = Array.isArray(data?.nft_items) ? data.nft_items : []
      for (const it of items) {
        if (String(it?.index ?? '') === target && it?.address) {
          return String(it.address).trim()
        }
      }
      if (items.length < NFT_ITEMS_PAGE) break
      offset += NFT_ITEMS_PAGE
    } catch {
      return null
    }
  }
  return null
}

async function findUserByWalletLoose(walletRaw) {
  const norm = normalizeLooseAddress(walletRaw)
  if (!norm) return null
  const candidates = await AdminUser.find({
    walletAddress: { $exists: true, $nin: [null, ''] },
  })
    .select('_id username name walletAddress telegramId stars img balanceLabel walletCount status')
    .limit(5000)
    .lean()
  for (const u of candidates) {
    if (normalizeLooseAddress(u.walletAddress) === norm) return u
  }
  return null
}

function toAdminTx(doc) {
  return {
    id: String(doc._id),
    icon: doc.icon,
    name: doc.name,
    type: doc.type,
    fromUser: doc.fromUser,
    toUser: doc.toUser,
    timeLabel: minutesAgoLabel(doc.createdAt),
    amount: doc.amount,
    feeLabel: doc.feeLabel,
  }
}

function toAdminStaff(doc) {
  const roles = doc.roles ?? []
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    username: doc.username,
    telegramId: doc.telegramId != null ? Number(doc.telegramId) : undefined,
    roles,
    isOwner: roles.includes('owner'),
    online: !!doc.online,
    createdAt: fmtDate(doc.createdAt),
  }
}

function toAdminAlert(doc) {
  return {
    id: String(doc._id),
    icon: doc.icon,
    title: doc.title,
    subtitle: doc.subtitle,
    timeBadge: doc.timeBadge,
  }
}

function parsePageParams(req) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

function parseSortParam(sortRaw) {
  const raw = String(sortRaw || '-createdAt')
  if (raw.startsWith('-')) return { [raw.slice(1)]: -1 }
  return { [raw]: 1 }
}

function sanitizeUsername(username) {
  const s = String(username || '').trim()
  if (!s) return ''
  return s.startsWith('@') ? s : `@${s.replace(/^@/, '')}`
}

async function linkStaffTelegramIdFromSession(telegramId, username) {
  const tgId = Number(telegramId)
  if (!Number.isFinite(tgId) || tgId <= 0) return
  const u = sanitizeUsername(username)
  if (!u) return
  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await AdminStaff.updateMany(
    { username: { $regex: new RegExp(`^${esc}$`, 'i') } },
    { $set: { telegramId: tgId } },
  )
}

/** Admin panel access: Control → Admins (`AdminStaff` collection) only. */
async function resolveAdminAccess(telegramIdRaw, usernameRaw) {
  const tgId = Number(telegramIdRaw)
  const hasTg = Number.isFinite(tgId) && tgId > 0

  const username = sanitizeUsername(usernameRaw)
  if (hasTg) {
    const byTg = await AdminStaff.findOne({ telegramId: tgId }).lean()
    if (byTg) return { authorized: true, via: 'staff_telegram_id' }
  }
  if (username) {
    const esc = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const byUser = await AdminStaff.findOne({
      username: { $regex: new RegExp(`^${esc}$`, 'i') },
    }).lean()
    if (byUser) return { authorized: true, via: 'staff_username' }
  }

  return { authorized: false, via: null }
}

function normalizeReferralCode(input) {
  const raw = String(input || '').trim().replace(/^#/, '')
  if (!raw) return ''
  const match = raw.match(/REF[0-9A-Z]+/i)
  const code = (match ? match[0] : raw).toUpperCase()
  if (!code.startsWith('REF')) return ''
  return code.replace(/[^A-Z0-9]/g, '')
}

function defaultReferralCodeForUser(userDoc) {
  if (userDoc?.telegramId) return `REF${String(userDoc.telegramId)}`
  const id = String(userDoc?._id || '').replace(/[^a-fA-F0-9]/g, '').slice(-8).toUpperCase()
  return id ? `REF${id}` : ''
}

async function ensureUserReferralCode(userDoc) {
  if (!userDoc) return ''
  const existing = normalizeReferralCode(userDoc.referralCode)
  if (existing) return existing

  let next = defaultReferralCodeForUser(userDoc)
  if (!next) return ''
  const owner = await AdminUser.findOne({ referralCode: next })
  if (owner && String(owner._id) !== String(userDoc._id)) {
    next = `${next}${String(userDoc._id).slice(-4).toUpperCase()}`
  }
  userDoc.referralCode = next
  await userDoc.save()
  return next
}

/** Match AdminUser for dashboard / profile (Telegram @username, telegramId, or TON/EVM wallet). */
function panelUserOrConditions(usernameRaw, telegramIdRaw, walletRaw) {
  const or = []
  const q = sanitizeUsername(usernameRaw)
  const tgId = Number(telegramIdRaw)
  const hasTg = Number.isFinite(tgId) && tgId > 0
  const w = String(walletRaw || '').trim()
  if (q) or.push({ username: q })
  if (hasTg) or.push({ telegramId: tgId })
  if (w) or.push({ walletAddress: w })
  return or
}

async function findPanelUser(usernameRaw, telegramIdRaw, walletRaw) {
  const q = sanitizeUsername(usernameRaw)
  const tgId = Number(telegramIdRaw)
  const hasTg = Number.isFinite(tgId) && tgId > 0
  const w = String(walletRaw || '').trim()
  return findUserByIdentityPriority({ username: q, telegramId: hasTg ? tgId : null, walletAddress: w })
}

const BLOCKED_USER_STATUSES = new Set(['Banned', 'Suspended'])

function isUserAccessBlocked(status) {
  return BLOCKED_USER_STATUSES.has(String(status || ''))
}

function userBlockPayload(status) {
  const s = String(status || 'Banned')
  const isBanned = s === 'Banned'
  return {
    code: isBanned ? 'USER_BANNED' : 'USER_SUSPENDED',
    message: isBanned
      ? 'Your account has been banned. You cannot use GiftedForge.'
      : 'Your account is suspended. Contact support to restore access.',
    status: s,
  }
}

function assertUserCanUsePlatform(user) {
  if (!user || !isUserAccessBlocked(user.status)) return
  const payload = userBlockPayload(user.status)
  const err = new Error(payload.message)
  err.statusCode = 403
  err.code = payload.code
  err.userStatus = payload.status
  throw err
}

function identityFromReq(req) {
  const q = req.query || {}
  const b = req.body || {}
  return {
    username: q.username ?? b.username,
    telegramId: q.telegramId ?? b.telegramId,
    walletAddress: q.walletAddress ?? b.walletAddress,
  }
}

async function findUserByIdentityPriority({ username, telegramId, walletAddress }) {
  const q = sanitizeUsername(username)
  const tgId = Number(telegramId)
  const hasTg = Number.isFinite(tgId) && tgId > 0
  const w = String(walletAddress || '').trim()

  // Deterministic identity resolution:
  // prefer Telegram id (strongest identity), then username, then wallet.
  if (hasTg) {
    const byTg = await AdminUser.findOne({ telegramId: tgId })
    if (byTg) return byTg
  }
  if (q) {
    const byUsername = await AdminUser.findOne({ username: q })
    if (byUsername) return byUsername
  }
  if (w) {
    const byWallet = await AdminUser.findOne({ walletAddress: w })
    if (byWallet) return byWallet
  }
  return null
}

function parseOwnerTelegramIds(raw) {
  const s = String(raw || '').trim()
  if (!s) return []
  return [
    ...new Set(
      s
        .split(/[\s,]+/)
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ]
}

function getProtectedOwnerTelegramIds() {
  const fromEnv = parseOwnerTelegramIds(
    process.env.OWNER_TELEGRAM_IDS || process.env.MAIN_ADMIN_TELEGRAM_ID || '',
  )
  return fromEnv.length ? fromEnv : [7435118437]
}

/** Ensures main owner(s) exist in AdminStaff — runs once per server instance after Mongo connects. */
async function ensureBootstrapOwnerStaff() {
  let ids = parseOwnerTelegramIds(process.env.OWNER_TELEGRAM_IDS || process.env.MAIN_ADMIN_TELEGRAM_ID || '')
  const staffCount = await AdminStaff.countDocuments()
  if (staffCount === 0 && ids.length === 0) ids = [7435118437]
  if (!ids.length) return

  for (const tgId of ids) {
    const linkedUser = await AdminUser.findOne({ telegramId: tgId }).lean()
    const username = linkedUser?.username
      ? sanitizeUsername(linkedUser.username)
      : `@user${tgId}`
    const name = linkedUser?.name || `Owner ${tgId}`
    const email = linkedUser?.email || `owner${tgId}@giftedforge.local`

    const existing = await AdminStaff.findOne({
      $or: [{ telegramId: tgId }, { username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }],
    })

    if (existing) {
      const roles = new Set([...(existing.roles || []), 'owner'])
      await AdminStaff.updateOne(
        { _id: existing._id },
        { $set: { telegramId: tgId, roles: [...roles] } },
      )
      continue
    }

    await AdminStaff.create({
      name,
      email,
      username,
      telegramId: tgId,
      roles: ['owner'],
    })
    console.log(`[bootstrap-owner] AdminStaff upserted for telegramId=${tgId} (${username})`)
  }
}

function listingHandlesForUser(userRow, usernameRaw) {
  const handles = new Set()
  const q = sanitizeUsername(usernameRaw)
  if (q) handles.add(q)
  if (userRow?.username) handles.add(userRow.username)
  if (userRow?.telegramId != null) handles.add(`@user${userRow.telegramId}`)
  return [...handles]
}

function buildUserCollectionQuery(userRow, handles) {
  const collectionOr = []
  if (userRow?._id) collectionOr.push({ ownerUserId: userRow._id })
  if (handles.length) collectionOr.push({ username: { $in: handles }, status: { $ne: 'Removed' } })
  return collectionOr.length > 0 ? { $or: collectionOr } : null
}

function enrichAssetForViewer(doc, userRow, handles) {
  const base = toAdminAsset(doc)
  const viewerOwned =
    !!userRow?._id && !!doc.ownerUserId && String(doc.ownerUserId) === String(userRow._id)
  const listingUsername = sanitizeUsername(doc.username || '').toLowerCase()
  const isYourListing = handles.some((h) => sanitizeUsername(h).toLowerCase() === listingUsername)
  let ownershipLabel
  if (viewerOwned) {
    ownershipLabel = doc.status === 'Active' && isYourListing ? 'Your listing' : 'Owned'
  }
  return { ...base, viewerOwned, ownershipLabel }
}

/** 1 TON = 100,000 Stars at display rate 1,000 ★ = 0.01 TON */
const STARS_PER_TON_NUM = 100_000

function ensureValidAssetInput({ title, username, category, marketTab }) {
  if (!title?.trim() || !username?.trim()) {
    const err = new Error('title and username are required')
    err.statusCode = 400
    throw err
  }
  if (category && !ASSET_CATEGORIES.has(category.trim())) {
    const err = new Error('category must be one of: 3D Art, Collectibles, Gaming')
    err.statusCode = 400
    throw err
  }
  if (marketTab && !MARKET_TABS.has(marketTab)) {
    const err = new Error('marketTab must be Explore or StarGifts')
    err.statusCode = 400
    throw err
  }
}

function parseTonAmount(value) {
  const n = Number.parseFloat(String(value || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function normalizeLooseAddress(addr) {
  return String(addr || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function tonTransferRecipientAddress(action) {
  if (action?.type !== 'TonTransfer' || !action?.TonTransfer) return ''
  const rec = action.TonTransfer.recipient
  if (!rec) return ''
  if (typeof rec === 'string') return rec
  return rec.address || rec.user_friendly || ''
}

function tonTransferSenderAddress(action) {
  if (action?.type !== 'TonTransfer' || !action?.TonTransfer) return ''
  const s = action.TonTransfer.sender
  if (!s) return ''
  if (typeof s === 'string') return s
  return s.address || s.user_friendly || ''
}

function tonTransferAmountNano(tt) {
  const a = tt?.amount
  if (a == null) return 0
  const n = typeof a === 'string' ? Number(a) : Number(a)
  return Number.isFinite(n) ? n : 0
}

async function fetchAccountEventsForMint(accountId) {
  const res = await fetch(
    `${TON_API_BASE}/v2/accounts/${encodeURIComponent(accountId)}/events?limit=100&subject_only=false`,
  )
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data?.events) ? data.events : []
}

function createPendingMintPayload(body = {}) {
  const {
    clientMintId,
    walletAddress,
    collectionAddress,
    title,
    description,
    image,
    metadataUrl,
    category = 'Collectibles',
    marketTab = 'Explore',
    priceTon,
    txRef,
    tokenId,
    telegramId,
    firstName,
    lastName,
    username,
    photoUrl,
    languageCode,
    walletType = 'TON',
  } = body

  if (!String(clientMintId || '').trim()) {
    const err = new Error('clientMintId is required')
    err.statusCode = 400
    throw err
  }
  if (!String(walletAddress || '').trim()) {
    const err = new Error('walletAddress is required')
    err.statusCode = 400
    throw err
  }
  if (!String(collectionAddress || '').trim()) {
    const err = new Error('collectionAddress is required')
    err.statusCode = 400
    throw err
  }
  if (!String(title || '').trim()) {
    const err = new Error('title is required')
    err.statusCode = 400
    throw err
  }
  const priceNum = Number(priceTon)
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    const err = new Error('priceTon must be a number greater than 0')
    err.statusCode = 400
    throw err
  }

  return {
    clientMintId: String(clientMintId).trim(),
    walletAddress: String(walletAddress).trim(),
    collectionAddress: String(collectionAddress).trim(),
    title: String(title).trim(),
    description: String(description || '').trim(),
    image: String(image || '').trim(),
    metadataUrl: String(metadataUrl || '').trim(),
    category: String(category || 'Collectibles').trim(),
    marketTab: String(marketTab || 'Explore').trim(),
    priceTon: priceNum,
    txRef: String(txRef || '').trim() || undefined,
    tokenId: tokenId !== undefined && tokenId !== null ? String(tokenId) : undefined,
    telegramId: telegramId ? Number(telegramId) : undefined,
    firstName: String(firstName || '').trim() || undefined,
    lastName: String(lastName || '').trim() || undefined,
    username: String(username || '').trim() || undefined,
    photoUrl: String(photoUrl || '').trim() || undefined,
    languageCode: String(languageCode || '').trim() || undefined,
    walletType: walletType === 'EVM' ? 'EVM' : 'TON',
    status: 'pending',
    verifyError: undefined,
  }
}

async function verifyTonMintOnChain(pending) {
  const walletAddress = String(pending.walletAddress || '').trim()
  const collectionAddress = String(pending.collectionAddress || '').trim()
  if (!walletAddress || !collectionAddress) return { ok: false, reason: 'missing wallet/collection' }

  const expectedNano = Math.floor(MINT_FEE_TON * 1e9)
  const tolerance = Math.max(Math.floor(0.02 * 1e9), Math.floor(expectedNano * 0.35))
  const collectionNorm = normalizeLooseAddress(collectionAddress)
  const walletNorm = normalizeLooseAddress(walletAddress)
  const createdAtMs = new Date(pending.createdAt).getTime()
  const windowStartMs = Math.max(0, createdAtMs - 15 * 60 * 1000)

  const scanEvents = (events, requireSenderEqWallet) => {
    for (const event of events) {
      const tsMs = Number(event?.timestamp || 0) * 1000
      if (!tsMs || tsMs < windowStartMs) continue
      const actions = Array.isArray(event?.actions) ? event.actions : []
      for (const action of actions) {
        if (action?.type !== 'TonTransfer' || !action?.TonTransfer) continue
        const recipient = normalizeLooseAddress(tonTransferRecipientAddress(action))
        const sender = normalizeLooseAddress(tonTransferSenderAddress(action))
        const amount = tonTransferAmountNano(action.TonTransfer)
        if (recipient !== collectionNorm) continue
        if (requireSenderEqWallet) {
          if (!walletNorm || !sender || sender !== walletNorm) continue
        } else if (sender && walletNorm && sender !== walletNorm) {
          continue
        }
        if (Math.abs(amount - expectedNano) <= tolerance) {
          return { ok: true, txRef: String(event.event_id || pending.txRef || `event-${Date.now()}`) }
        }
      }
    }
    return null
  }

  const walletEvents = await fetchAccountEventsForMint(walletAddress)
  if (walletEvents) {
    const hit = scanEvents(walletEvents, false)
    if (hit) return hit
  }

  const collectionEvents = await fetchAccountEventsForMint(collectionAddress)
  if (collectionEvents) {
    const hit = scanEvents(collectionEvents, true)
    if (hit) return hit
  }

  if (walletEvents == null && collectionEvents == null) {
    return { ok: false, reason: 'tonapi events unavailable' }
  }
  return { ok: false, reason: 'mint transfer not found yet' }
}

async function syncPendingMintToDb(pending) {
  const actor = await resolveOrCreateActorUser({
    telegramId: pending.telegramId,
    firstName: pending.firstName,
    lastName: pending.lastName,
    username: pending.username,
    photoUrl: pending.photoUrl,
    languageCode: pending.languageCode,
    walletAddress: pending.walletAddress,
    walletType: pending.walletType || 'TON',
  })
  const fallbackHandle = actor.telegramId ? `@user${actor.telegramId}` : `@user${String(actor._id).slice(-6)}`
  const listingUsername = actor.username || fallbackHandle
  const actorLabel = listingUsername || actor.name

  const existing = await AdminAsset.findOne({ tokenId: pending.tokenId || undefined, ownerUserId: actor._id, title: pending.title })
  if (existing) {
    pending.status = 'saved'
    pending.assetId = existing._id
    pending.lastCheckedAt = new Date()
    await pending.save()
    return existing
  }

  const colSaved = String(pending.collectionAddress || '').trim()
  const assetDoc = await AdminAsset.create({
    nft: pending.image || '/crystal-cube.jpg',
    title: pending.title,
    username: listingUsername,
    category: pending.category?.trim() || 'Collectibles',
    marketTab: pending.marketTab === 'StarGifts' ? 'StarGifts' : 'Explore',
    price: `${Number(pending.priceTon).toFixed(3)} TON`,
    status: 'Active',
    ownerUserId: actor._id,
    tokenId: pending.tokenId || undefined,
    metadataUrl: pending.metadataUrl || undefined,
    collectionAddress: colSaved || undefined,
  })

  try {
    const tid = pending.tokenId != null ? String(pending.tokenId).trim() : ''
    if (colSaved && tid) {
      const nftAddr = await resolveNftItemAddressTonApi(colSaved, tid)
      if (nftAddr) {
        assetDoc.nftItemAddress = nftAddr
        await assetDoc.save()
      }
    }
  } catch (err) {
    console.warn('[nft-item-resolve] skipped', err?.message || err)
  }

  await AdminTransaction.create({
    icon: '/nft.svg',
    name: `Mint • ${pending.title}`,
    type: 'Mint',
    fromUser: actorLabel,
    toUser: actorLabel,
    amount: `${Number(pending.priceTon).toFixed(3)} TON`,
    feeLabel: pending.txRef ? `Tx ${String(pending.txRef).slice(0, 18)}...` : 'Minted and listed',
  })

  await AdminAlert.create({
    icon: '/nft.svg',
    title: 'New NFT minted',
    subtitle: `${actorLabel} minted ${pending.title}${pending.description ? ` — ${pending.description.slice(0, 40)}` : ''}`,
    timeBadge: 'Now',
  })

  pending.status = 'saved'
  pending.assetId = assetDoc._id
  pending.lastCheckedAt = new Date()
  await pending.save()
  return assetDoc
}

async function reconcilePendingMint(pending) {
  if (pending.status === 'saved') {
    let assetDoc = null
    if (pending.assetId) {
      assetDoc = await AdminAsset.findById(pending.assetId)
    }
    return {
      ok: true,
      state: 'saved',
      assetId: pending.assetId,
      asset: assetDoc ? toAdminAsset(assetDoc) : undefined,
    }
  }

  try {
    if (MINT_REQUIRE_CHAIN_VERIFY) {
      const verify = await verifyTonMintOnChain(pending)
      pending.lastCheckedAt = new Date()
      if (!verify.ok) {
        pending.verifyError = verify.reason
        await pending.save()
        return { ok: false, state: 'pending', reason: verify.reason }
      }
      pending.status = 'confirmed'
      pending.txRef = verify.txRef || pending.txRef
      pending.verifyError = undefined
      await pending.save()
    } else {
      if (!String(pending.txRef || '').trim()) {
        return { ok: false, state: 'pending', reason: 'waiting for wallet confirmation' }
      }
      pending.lastCheckedAt = new Date()
      pending.verifyError = undefined
    }

    const asset = await syncPendingMintToDb(pending)
    return { ok: true, state: 'saved', asset: toAdminAsset(asset) }
  } catch (err) {
    pending.lastCheckedAt = new Date()
    pending.verifyError = err?.message || 'reconcile failed'
    await pending.save()
    return { ok: false, state: 'pending', reason: pending.verifyError }
  }
}

async function resolveOrCreateActorUser(payload = {}) {
  const {
    telegramId,
    firstName,
    lastName,
    username,
    photoUrl,
    walletAddress,
    walletType,
  } = payload

  const tgId = Number(telegramId)
  const hasTg = Number.isFinite(tgId) && tgId > 0
  const normalizedUsername = sanitizeUsername(username)
  const normalizedWallet = String(walletAddress || '').trim()

  if (!hasTg && !normalizedUsername && !normalizedWallet) {
    const err = new Error('user identity is required (telegramId, username or walletAddress)')
    err.statusCode = 400
    throw err
  }

  let user = await findUserByIdentityPriority({
    username: normalizedUsername,
    telegramId: hasTg ? tgId : null,
    walletAddress: normalizedWallet,
  })

  const displayName =
    `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim() ||
    normalizedUsername ||
    (hasTg ? `Telegram ${tgId}` : 'Wallet User')

  if (!user) {
    user = await AdminUser.create({
      telegramId: hasTg ? tgId : undefined,
      name: displayName,
      username: normalizedUsername || undefined,
      img: photoUrl || '/white-man.jpg',
      walletAddress: normalizedWallet || undefined,
      walletCount: normalizedWallet ? 1 : 0,
      balanceLabel: '$0',
      stars: 0,
      status: 'Active',
    })
    return user
  }

  assertUserCanUsePlatform(user)
  if (hasTg) user.telegramId = tgId
  user.name = displayName
  user.username = normalizedUsername || user.username
  user.img = photoUrl || user.img || '/white-man.jpg'
  if (normalizedWallet) {
    user.walletAddress = normalizedWallet
    user.walletCount = Math.max(1, Number(user.walletCount || 0))
    if (!user.balanceLabel) user.balanceLabel = '$0'
  }
  await user.save()
  return user
}

app.get('/api/admin/health', async (_req, res) => {
  const users = await AdminUser.countDocuments()
  res.json({ ok: true, users })
})

/** Mini App admin gate: staff added in Control → Admins (MongoDB). */
app.post('/api/admin/access-check', async (req, res) => {
  const result = await resolveAdminAccess(req.body?.telegramId, req.body?.username)
  res.json(result)
})

app.get('/api/admin/dashboard', async (_req, res) => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const [totalUsers, activeListings, pendingListings, txRows, settings, usersLast24h, usersPrev24h] = await Promise.all([
    AdminUser.countDocuments(),
    AdminAsset.countDocuments({ status: 'Active' }),
    AdminAsset.countDocuments({ status: 'Pending' }),
    AdminTransaction.find({}, { amount: 1 }),
    AdminSettings.findOne(),
    AdminUser.countDocuments({ createdAt: { $gte: new Date(now - day) } }),
    AdminUser.countDocuments({
      createdAt: { $gte: new Date(now - day * 2), $lt: new Date(now - day) },
    }),
  ])

  const totalTon = txRows.reduce((sum, row) => {
    const n = parseFloat(String(row.amount || '0').replace(/[^\d.]/g, ''))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
  const fee = settings?.platformFeePercent ?? 2
  const feeTon = totalTon * (fee / 100)
  const deltaBase = usersPrev24h || 1
  const deltaPct = ((usersLast24h - usersPrev24h) / deltaBase) * 100

  res.json({
    totalUsers,
    usersDelta24h: `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}% (24h)`,
    totalVolumeUsd: `${totalTon.toFixed(2)} TON`,
    volumeSubtitle: `${txRows.length} tx`,
    revenueUsd: `${feeTon.toFixed(3)} TON`,
    revenueSubtitle: `Fee ${fee}%`,
    activeListings,
    pendingListings,
  })
})

app.get('/api/admin/users', async (req, res) => {
  const { search = '', status = '', sort = '-createdAt' } = req.query
  const { limit, skip } = parsePageParams(req)
  const query = {}

  if (status && status !== "All User's") {
    query.status = status
  }

  if (search) {
    const rx = new RegExp(String(search), 'i')
    query.$or = [
      { name: rx },
      { email: rx },
      { username: rx },
      { walletAddress: rx },
    ]
  }

  const total = await AdminUser.countDocuments(query)
  const rows = await AdminUser.find(query).sort(parseSortParam(sort)).skip(skip).limit(limit)
  res.set('x-total-count', String(total))
  console.log(`[${req._rid}] admin-users total=${total} returned=${rows.length}`)
  res.json(rows.map(toAdminUser))
})

app.post('/api/admin/users', async (req, res) => {
  const { name, email, username, walletAddress } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'name is required' })

  const doc = await AdminUser.create({
    name: name.trim(),
    email: email?.trim() || undefined,
    username: username?.trim() ? sanitizeUsername(username) : undefined,
    walletAddress: walletAddress?.trim() || undefined,
    walletCount: walletAddress?.trim() ? 1 : 0,
  })

  res.status(201).json(toAdminUser(doc))
})

app.patch('/api/admin/users/:id/status', async (req, res) => {
  const { status } = req.body
  const doc = await AdminUser.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true },
  )
  if (!doc) return res.status(404).json({ message: 'User not found' })
  res.json(toAdminUser(doc))
})

app.get('/api/admin/assets', async (req, res) => {
  const { search = '', status = '', sort = '-createdAt' } = req.query
  const { limit, skip } = parsePageParams(req)
  const query = {}

  if (status && status !== "All Asset's") {
    query.status = status
  }
  if (search) {
    const rx = new RegExp(String(search), 'i')
    query.$or = [{ title: rx }, { username: rx }]
  }

  const total = await AdminAsset.countDocuments(query)
  const rows = await AdminAsset.find(query).sort(parseSortParam(sort)).skip(skip).limit(limit)
  res.set('x-total-count', String(total))
  res.json(rows.map(toAdminAsset))
})

app.post('/api/admin/assets', async (req, res) => {
  const { title, username, price, image, category, marketTab } = req.body
  ensureValidAssetInput({ title, username, category, marketTab })
  const doc = await AdminAsset.create({
    title: title.trim(),
    username: sanitizeUsername(username),
    price: price?.trim() || '0 TON',
    nft: image?.trim() || '/crystal-cube.jpg',
    category: category?.trim() || 'Collectibles',
    marketTab: marketTab === 'StarGifts' ? 'StarGifts' : 'Explore',
    status: 'Pending',
  })
  res.status(201).json(toAdminAsset(doc))
})

app.patch('/api/admin/assets/:id/status', async (req, res) => {
  const { status } = req.body
  const doc = await AdminAsset.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true },
  )
  if (!doc) return res.status(404).json({ message: 'Asset not found' })
  res.json(toAdminAsset(doc))
})

app.get('/api/admin/transactions', async (req, res) => {
  const { search = '', type = '', sort = '-createdAt' } = req.query
  const { limit, skip } = parsePageParams(req)
  const query = {}
  if (type && type !== 'All') query.type = type
  if (search) {
    const rx = new RegExp(String(search), 'i')
    query.$or = [{ name: rx }, { fromUser: rx }, { toUser: rx }]
  }

  const total = await AdminTransaction.countDocuments(query)
  const rows = await AdminTransaction.find(query).sort(parseSortParam(sort)).skip(skip).limit(limit)
  res.set('x-total-count', String(total))
  res.json(rows.map(toAdminTx))
})

app.get('/api/admin/staff', async (_req, res) => {
  const rows = await AdminStaff.find({}).sort({ createdAt: -1 })
  res.json(rows.map(toAdminStaff))
})

app.post('/api/admin/staff', async (req, res) => {
  const { name, email, username, roles, telegramId: telegramIdRaw } = req.body
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ message: 'name and email are required' })
  }
  const tgFromBody = Number(telegramIdRaw)
  const hasTgFromBody = Number.isFinite(tgFromBody) && tgFromBody > 0
  let normalizedUsername = username?.trim() ? sanitizeUsername(username) : ''
  if (!normalizedUsername && hasTgFromBody) normalizedUsername = `@user${tgFromBody}`
  if (!normalizedUsername) {
    return res.status(400).json({ message: 'username or telegramId is required' })
  }

  let linkedTelegramId = hasTgFromBody ? tgFromBody : undefined
  const linkedUser = await AdminUser.findOne({
    $or: [
      { username: normalizedUsername },
      ...(linkedTelegramId ? [{ telegramId: linkedTelegramId }] : []),
    ],
  }).lean()
  if (linkedUser?.telegramId && Number.isFinite(Number(linkedUser.telegramId))) {
    linkedTelegramId = Number(linkedUser.telegramId)
  }
  if (!normalizedUsername && linkedUser?.username) {
    normalizedUsername = sanitizeUsername(linkedUser.username)
  }

  const doc = await AdminStaff.create({
    name: name.trim(),
    email: email.trim(),
    username: normalizedUsername,
    telegramId: linkedTelegramId,
    roles: Array.isArray(roles) && roles.length ? roles : ['support'],
  })
  res.status(201).json(toAdminStaff(doc))
})

app.delete('/api/admin/staff/:id', async (req, res) => {
  const doc = await AdminStaff.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Admin record not found' })

  const protectedIds = new Set(getProtectedOwnerTelegramIds())
  const docTg = Number(doc.telegramId)
  if (protectedIds.has(docTg)) {
    const ownersLeft = await AdminStaff.countDocuments({ roles: 'owner' })
    if (ownersLeft <= 1) {
      return res.status(403).json({
        message: 'Cannot remove the last main owner. Add another owner first.',
      })
    }
  }

  await AdminStaff.findByIdAndDelete(req.params.id)
  return res.json({ ok: true })
})

app.get('/api/admin/settings', async (_req, res) => {
  let settings = await AdminSettings.findOne()
  if (!settings) settings = await AdminSettings.create({})
  res.json({
    platformFeePercent: settings.platformFeePercent,
    feeReceiverWalletAddress: settings.feeReceiverWalletAddress || '',
    platformStarsAccrued: Number(settings.platformStarsAccrued) || 0,
    maxUploadMb: settings.maxUploadMb,
    tonEnabled: settings.tonEnabled,
    maintenanceMode: settings.maintenanceMode,
  })
})

app.patch('/api/admin/settings', async (req, res) => {
  let settings = await AdminSettings.findOne()
  if (!settings) settings = await AdminSettings.create({})

  const allowed = ['platformFeePercent', 'feeReceiverWalletAddress', 'maxUploadMb', 'tonEnabled', 'maintenanceMode']
  const patch = {}
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key]
  }

  Object.assign(settings, patch)
  await settings.save()
  res.json({
    platformFeePercent: settings.platformFeePercent,
    feeReceiverWalletAddress: settings.feeReceiverWalletAddress || '',
    platformStarsAccrued: Number(settings.platformStarsAccrued) || 0,
    maxUploadMb: settings.maxUploadMb,
    tonEnabled: settings.tonEnabled,
    maintenanceMode: settings.maintenanceMode,
  })
})

/** Block banned/suspended users on all user APIs (except public platform-settings). */
app.use('/api/user', async (req, res, next) => {
  if (req.method === 'GET' && req.path === '/platform-settings') return next()
  if (req.method === 'POST' && req.path === '/session') return next()
  try {
    const id = identityFromReq(req)
    const user = await findPanelUser(id.username, id.telegramId, id.walletAddress)
    if (user) assertUserCanUsePlatform(user)
    req._panelUser = user
    return next()
  } catch (err) {
    const statusCode = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 403
    return res.status(statusCode).json({
      code: err.code || userBlockPayload(err.userStatus).code,
      message: err.message || 'Access denied',
      status: err.userStatus,
    })
  }
})

app.get('/api/user/platform-settings', async (_req, res) => {
  let settings = await AdminSettings.findOne()
  if (!settings) settings = await AdminSettings.create({})
  res.json({
    platformFeePercent: Number(settings.platformFeePercent) || 0,
    feeReceiverWalletAddress: String(settings.feeReceiverWalletAddress || '').trim(),
  })
})

// ── Telegram Stars payments ──────────────────────────────────────────────
async function tgApi(method, body) {
  if (!TELEGRAM_BOT_TOKEN) {
    const err = new Error('TELEGRAM_BOT_TOKEN is not configured on the server')
    err.statusCode = 500
    throw err
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok) {
    const msg = data?.description || `Telegram API ${method} failed`
    const err = new Error(msg)
    err.statusCode = 502
    throw err
  }
  return data.result
}

/**
 * Validates Telegram Mini App `initData` (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * @returns {{ telegramUserId: number, user: Record<string, unknown> }}
 */
function validateTelegramWebAppInitData(initData, botToken, maxAgeSec = 86400) {
  const raw = String(initData || '').trim()
  const tok = String(botToken || '').trim()
  if (!raw || !tok) {
    const err = new Error('Missing initData or bot token')
    err.statusCode = 400
    throw err
  }

  const incoming = new URLSearchParams(raw)
  const hash = incoming.get('hash')
  if (!hash) {
    const err = new Error('Missing hash in initData')
    err.statusCode = 401
    throw err
  }

  const tryBuildCheckString = (excludeSignature) => {
    const p = new URLSearchParams(raw)
    p.delete('hash')
    if (excludeSignature) p.delete('signature')
    return [...p.keys()]
      .sort()
      .map((k) => `${k}=${p.get(k)}`)
      .join('\n')
  }

  const verifyDataCheckString = (dataCheckString) => {
    const secretKey = createHmac('sha256', 'WebAppData').update(tok).digest()
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
    try {
      const a = Buffer.from(computed, 'hex')
      const b = Buffer.from(hash, 'hex')
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  // Newer Telegram sends `signature` (Ed25519). Legacy `hash` is HMAC over fields that must not include `signature`.
  let dataCheckString = tryBuildCheckString(true)
  let valid = verifyDataCheckString(dataCheckString)
  if (!valid && incoming.has('signature')) {
    dataCheckString = tryBuildCheckString(false)
    valid = verifyDataCheckString(dataCheckString)
  }

  if (!valid) {
    const botIdHint = tok.includes(':') ? tok.split(':')[0] : 'unknown'
    const err = new Error(
      `Invalid initData signature. Fix: (1) Set TELEGRAM_BOT_TOKEN on THIS API server to the SAME bot that opens the Mini App (bot id in token: ${botIdHint}). ` +
        `(2) Point VITE_USER_API_URL to your API host, or rely on built-in defaults. ` +
        `(3) If bot id above is NOT your Mini App bot: remove stray TELEGRAM_BOT_TOKEN on this host, or set EMBEDDED_TELEGRAM_BOT_TOKEN in server/giftedforgeDeploy.js (embedded wins when set). ` +
        `(4) Redeploy frontend after changing VITE_* env vars.`,
    )
    err.statusCode = 401
    throw err
  }

  const params = new URLSearchParams(raw)
  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || authDate <= 0) {
    const err = new Error('Invalid auth_date in initData')
    err.statusCode = 401
    throw err
  }
  if (Date.now() / 1000 - authDate > maxAgeSec) {
    const err = new Error('initData expired — reopen the Mini App from Telegram')
    err.statusCode = 401
    throw err
  }
  const userJson = params.get('user')
  if (!userJson) {
    const err = new Error('Missing user in initData')
    err.statusCode = 401
    throw err
  }
  let user
  try {
    user = JSON.parse(userJson)
  } catch {
    const err = new Error('Invalid user in initData')
    err.statusCode = 401
    throw err
  }
  const telegramUserId = Number(user.id)
  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
    const err = new Error('Invalid user id in initData')
    err.statusCode = 401
    throw err
  }
  return { telegramUserId, user }
}

function mapSenderUser(u) {
  if (!u || typeof u !== 'object') return undefined
  return {
    id: u.id,
    first_name: u.first_name,
    username: u.username,
  }
}

/**
 * Stable id for marketplace listings. Telegram only sends `owned_gift_id` for some
 * business-account gifts; regular profile gifts often omit it — use a composite key.
 */
function ownedGiftListingId(raw) {
  if (!raw || typeof raw !== 'object') return ''
  const explicit = String(raw.owned_gift_id ?? raw.ownedGiftId ?? '').trim()
  if (explicit) return explicit
  if (inferOwnedGiftKind(raw) !== 'regular') return ''
  const gid = String(raw.gift?.id ?? '').trim()
  const sendDate = Number(raw.send_date)
  if (!gid || !Number.isFinite(sendDate) || sendDate <= 0) return ''
  const senderId =
    raw.sender_user?.id != null && Number.isFinite(Number(raw.sender_user.id))
      ? String(Math.floor(Number(raw.sender_user.id)))
      : '0'
  const textKey = String(raw.text || '')
    .trim()
    .slice(0, 48)
    .replace(/:/g, '_')
  return `gf:${gid}:${sendDate}:${senderId}:${textKey}`
}

function inferOwnedGiftKind(raw) {
  const t = String(raw?.type || '').toLowerCase()
  if (t === 'regular' || t === 'unique') return t
  const g = raw?.gift || {}
  if (g.gift_id != null || g.base_name != null) return 'unique'
  if (g.id != null) return 'regular'
  return 'unknown'
}

function normalizeOwnedGiftForClient(raw) {
  if (!raw || typeof raw !== 'object') return { kind: 'unknown' }
  const t = inferOwnedGiftKind(raw)
  if (t === 'regular') {
    const g = raw.gift || {}
    const st = g.sticker || {}
    return {
      kind: 'regular',
      ownedGiftId: ownedGiftListingId(raw) || undefined,
      giftId: g.id,
      sendDate: raw.send_date,
      senderUser: mapSenderUser(raw.sender_user),
      text: raw.text || undefined,
      emoji: st.emoji || '🎁',
      starCount: g.star_count,
      canBeUpgraded: !!raw.can_be_upgraded,
      wasRefunded: !!raw.was_refunded,
    }
  }
  if (t === 'unique') {
    const ug = raw.gift || {}
    const model = ug.model || {}
    const st = model.sticker || {}
    return {
      kind: 'unique',
      ownedGiftId: raw.owned_gift_id || undefined,
      giftId: ug.gift_id,
      baseName: ug.base_name,
      name: ug.name,
      number: ug.number,
      sendDate: raw.send_date,
      senderUser: mapSenderUser(raw.sender_user),
      emoji: st.emoji || '✨',
      canBeTransferred: !!raw.can_be_transferred,
      transferStarCount: raw.transfer_star_count,
    }
  }
  const g = raw.gift || {}
  const st = g.sticker || {}
  return {
    kind: 'unknown',
    type: raw.type,
    sendDate: raw.send_date,
    emoji: st.emoji || '🎁',
  }
}

function rgbIntToCssHex(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return null
  const v = Number(n) >>> 0
  return `#${(v & 0xffffff).toString(16).padStart(6, '0')}`
}

function normalizeAvailableGiftForClient(g) {
  if (!g || typeof g !== 'object') return null
  const st = g.sticker || {}
  const thumb = st.thumbnail || {}
  const mainStatic = !st.is_animated && !st.is_video
  const previewFileId = thumb.file_id || (mainStatic ? st.file_id : null) || undefined
  const bg = g.background || {}
  const c1 = bg.center_color
  const c2 = bg.edge_color
  const ct = bg.text_color
  const hasBg = c1 != null || c2 != null || ct != null
  const background = hasBg
    ? {
        center: rgbIntToCssHex(c1) || '#8b7fd8',
        edge: rgbIntToCssHex(c2) || '#4b3f9e',
        text: rgbIntToCssHex(ct) || '#ffffff',
      }
    : null
  return {
    id: String(g.id),
    star_count: Number(g.star_count) || 0,
    emoji: st.emoji || '🎁',
    remaining_count: g.remaining_count,
    personal_remaining_count: g.personal_remaining_count,
    upgrade_star_count: g.upgrade_star_count,
    preview_file_id: previewFileId,
    background,
  }
}

app.post('/api/user/stars/topup', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const { amountStars, telegramId, username, walletAddress } = req.body || {}
  const stars = Math.floor(Number(amountStars))
  if (!Number.isFinite(stars) || stars < 1) {
    return res.status(400).json({ message: 'amountStars must be an integer >= 1' })
  }

  const userRow = await findPanelUser(username, telegramId, walletAddress)
  if (!userRow?.telegramId) {
    return res.status(400).json({ message: 'Telegram user is required to top up Stars. Open app inside Telegram.' })
  }

  // Telegram Stars use currency XTR. total_amount is in Stars (integer).
  // Payload encodes intended buyer + amount so pre_checkout_query can verify before Telegram charges.
  const payload = `stars-topup:${userRow.telegramId}:${stars}:${Date.now()}`
  const title = 'GiftedForge Stars Top-up'
  const description = `Top up ${stars} Stars in your GiftedForge account.`

  // Telegram Stars (XTR): official docs require provider_token as empty string — omitting it can break checkout on some clients.
  const link = await tgApi('createInvoiceLink', {
    title,
    description,
    payload,
    currency: 'XTR',
    provider_token: '',
    prices: [{ label: `${stars} Stars`, amount: stars }],
  })

  res.json({ ok: true, link, payload })
})

// ── Telegram Gifts (Mini App + Bot API: getUserGifts, getAvailableGifts, sendGift) ──
app.post('/api/user/telegram-gifts/list', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  if (!initData) return res.status(400).json({ message: 'initData is required' })
  let telegramUserId
  try {
    ;({ telegramUserId } = validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN))
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.body?.limit || '50'), 10) || 50))
  const offsetRaw = req.body?.offset
  const offset = offsetRaw === undefined || offsetRaw === null ? '' : String(offsetRaw)
  const payload = { user_id: telegramUserId, limit }
  if (String(offset).length) payload.offset = String(offset)
  try {
    const result = await tgApi('getUserGifts', payload)
    res.json({
      total_count: result.total_count ?? 0,
      next_offset: result.next_offset || '',
      gifts: (result.gifts || []).map(normalizeOwnedGiftForClient),
    })
  } catch (e) {
    return res.status(e.statusCode || 502).json({ message: e.message || 'getUserGifts failed' })
  }
})

app.post('/api/user/telegram-gifts/available', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  if (!initData) return res.status(400).json({ message: 'initData is required' })
  try {
    validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN)
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }
  try {
    const result = await tgApi('getAvailableGifts', {})
    res.json({
      gifts: (result.gifts || []).map(normalizeAvailableGiftForClient).filter(Boolean),
    })
  } catch (e) {
    return res.status(e.statusCode || 502).json({ message: e.message || 'getAvailableGifts failed' })
  }
})

/** Proxies a gift sticker thumbnail/static file for the Mini App (never exposes the bot token in URLs). */
app.post('/api/user/telegram-gifts/sticker-preview', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  const fileId = String(req.body?.fileId || '').trim()
  if (!initData) return res.status(400).json({ message: 'initData is required' })
  if (!fileId) return res.status(400).json({ message: 'fileId is required' })
  try {
    validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN)
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }
  let filePath
  try {
    const meta = await tgApi('getFile', { file_id: fileId })
    filePath = meta && typeof meta.file_path === 'string' ? meta.file_path.trim() : ''
  } catch (e) {
    return res.status(e.statusCode || 502).json({ message: e.message || 'getFile failed' })
  }
  if (!filePath || filePath.includes('..')) {
    return res.status(400).json({ message: 'Invalid file path from Telegram' })
  }
  const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`
  let imgRes
  try {
    imgRes = await fetch(url)
  } catch (e) {
    return res.status(502).json({ message: e?.message || 'Failed to fetch sticker file' })
  }
  if (!imgRes.ok) {
    return res.status(502).json({ message: `Telegram file fetch failed (${imgRes.status})` })
  }
  const len = Number(imgRes.headers.get('content-length'))
  if (Number.isFinite(len) && len > 2_500_000) {
    return res.status(413).json({ message: 'Sticker file too large' })
  }
  const buf = Buffer.from(await imgRes.arrayBuffer())
  if (buf.length > 2_500_000) {
    return res.status(413).json({ message: 'Sticker file too large' })
  }
  const ct = imgRes.headers.get('content-type') || 'application/octet-stream'
  res.setHeader('Content-Type', ct)
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.send(buf)
})

app.post('/api/user/telegram-gifts/send', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  const giftId = String(req.body?.giftId || '').trim()
  const recipientUserId = Number(req.body?.recipientUserId)
  const text = String(req.body?.text || '').trim().slice(0, 128)

  if (!initData) return res.status(400).json({ message: 'initData is required' })
  if (!giftId) return res.status(400).json({ message: 'giftId is required' })
  if (!Number.isFinite(recipientUserId) || recipientUserId <= 0) {
    return res.status(400).json({ message: 'recipientUserId must be a positive Telegram user id' })
  }

  let telegramUserId
  try {
    ;({ telegramUserId } = validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN))
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }

  if (recipientUserId === telegramUserId) {
    return res.status(400).json({ message: 'Pick another recipient (not yourself).' })
  }

  let available
  try {
    available = await tgApi('getAvailableGifts', {})
  } catch (e) {
    return res.status(e.statusCode || 502).json({ message: e.message || 'getAvailableGifts failed' })
  }
  const giftMeta = (available.gifts || []).find((x) => String(x?.id) === giftId)
  if (!giftMeta) {
    return res.status(400).json({ message: 'Unknown or unavailable gift id for this bot.' })
  }
  const priceStars = Math.max(0, Number(giftMeta.star_count) || 0)

  const actor = await AdminUser.findOne({ telegramId: telegramUserId })
  if (!actor) {
    return res.status(400).json({
      message: 'Open GiftedForge in Telegram once so your account exists, then try again.',
    })
  }

  const balance = Number(actor.stars) || 0
  if (priceStars > 0 && balance < priceStars) {
    return res.status(400).json({
      message: `You need ${priceStars} Stars in your GiftedForge balance to send this gift (you have ${balance}). Top up from Wallet.`,
    })
  }

  if (priceStars > 0) {
    actor.stars = balance - priceStars
    await actor.save()
  }

  try {
    await tgApi('sendGift', {
      user_id: recipientUserId,
      gift_id: giftId,
      ...(text ? { text } : {}),
    })
  } catch (err) {
    if (priceStars > 0) {
      actor.stars = (Number(actor.stars) || 0) + priceStars
      await actor.save()
    }
    return res.status(502).json({ message: err?.message || 'sendGift failed' })
  }

  const actorLabel = actor.username || actor.name
  await AdminTransaction.create({
    icon: '/heart.svg',
    name: 'Telegram gift',
    type: 'Gift',
    fromUser: actorLabel,
    toUser: `tg:${recipientUserId}`,
    amount: priceStars > 0 ? `${priceStars} Stars` : 'Gift',
    feeLabel: `gift_id ${giftId}`,
  })

  res.json({ ok: true, starsRemaining: Number(actor.stars) || 0 })
})

async function findOwnedGiftRawByOwnedId(telegramUserId, ownedGiftId) {
  const target = String(ownedGiftId || '').trim()
  if (!target || !Number.isFinite(telegramUserId) || telegramUserId <= 0) return null
  let offset = ''
  for (let page = 0; page < 12; page++) {
    const payload = { user_id: telegramUserId, limit: 100 }
    if (String(offset).length) payload.offset = String(offset)
    const result = await tgApi('getUserGifts', payload)
    const gifts = result.gifts || []
    const hit = gifts.find(
      (g) => ownedGiftListingId(g) === target || String(g?.owned_gift_id || '').trim() === target,
    )
    if (hit) return hit
    const next = result.next_offset
    if (!next || next === offset || !gifts.length) break
    offset = next
  }
  return null
}

/** Marketplace fulfillment: Telegram `sendGift` → gift on buyer profile. Retries once without caption if Telegram rejects optional text. */
async function sendGiftMarketplaceDeliver(buyerTelegramId, giftId) {
  try {
    await tgApi('sendGift', {
      user_id: buyerTelegramId,
      gift_id: giftId,
      text: '🎁 GiftedForge marketplace',
    })
  } catch (_e1) {
    await tgApi('sendGift', {
      user_id: buyerTelegramId,
      gift_id: giftId,
    })
  }
}

/** Browse active gift listings (no auth). */
app.get('/api/user/gift-listings', async (req, res) => {
  const search = String(req.query?.search || '').trim()
  const { limit, skip } = parsePageParams(req)
  const q = { status: 'Active' }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    q.$or = [{ label: rx }, { sellerUsername: rx }, { giftId: rx }]
  }
  const total = await GiftListing.countDocuments(q)
  const rows = await GiftListing.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit)
  res.set('x-total-count', String(total))
  const enriched = await enrichGiftListingsWithSellerWallets(rows)
  res.json(enriched)
})

/** My gift listings (requires initData). */
app.post('/api/user/gift-listings/mine', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  if (!initData) return res.status(400).json({ message: 'initData is required' })
  let telegramUserId
  try {
    ;({ telegramUserId } = validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN))
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }
  const rows = await GiftListing.find({ sellerTelegramId: telegramUserId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
  const enriched = await enrichGiftListingsWithSellerWallets(rows)
  res.json({ listings: enriched })
})

/** List a regular Telegram gift for sale (initData + ownedGiftId + pricing `stars` or `ton`). */
app.post('/api/user/gift-listings', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  const ownedGiftId = String(req.body?.ownedGiftId || '').trim()
  const pricingRaw = String(req.body?.pricing || '').trim().toLowerCase()
  const pricing = pricingRaw === 'ton' || pricingRaw === 'stars' ? pricingRaw : ''

  if (!initData) return res.status(400).json({ message: 'initData is required' })
  if (!ownedGiftId) return res.status(400).json({ message: 'ownedGiftId is required' })
  if (!pricing) return res.status(400).json({ message: 'pricing must be "ton" or "stars"' })

  const priceStars = Math.floor(Number(req.body?.priceStars))
  const priceTon = Number.parseFloat(String(req.body?.priceTon ?? '').replace(/[^\d.]/g, ''))

  if (pricing === 'stars') {
    if (!Number.isFinite(priceStars) || priceStars < 1) {
      return res.status(400).json({ message: 'priceStars must be an integer >= 1' })
    }
  } else {
    const MIN_TON = 0.001
    if (!Number.isFinite(priceTon) || priceTon < MIN_TON) {
      return res.status(400).json({ message: `priceTon must be a number >= ${MIN_TON} TON` })
    }
  }

  let telegramUserId
  let userUnsafe
  try {
    const v = validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN)
    telegramUserId = v.telegramUserId
    userUnsafe = v.user || {}
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }

  let rawGift
  try {
    rawGift = await findOwnedGiftRawByOwnedId(telegramUserId, ownedGiftId)
  } catch (e) {
    return res.status(e.statusCode || 502).json({ message: e.message || 'getUserGifts failed' })
  }
  if (!rawGift) {
    return res.status(404).json({ message: 'Gift not found in your Telegram inventory (check owned id).' })
  }
  if (inferOwnedGiftKind(rawGift) !== 'regular') {
    return res.status(400).json({
      message: 'Only regular Telegram gifts can be listed. Unique / upgraded gifts need Telegram transfer APIs.',
    })
  }
  const gid = String(rawGift.gift?.id || '').trim()
  if (!gid) return res.status(400).json({ message: 'Could not read gift catalog id from this item.' })

  const activeCount = await GiftListing.countDocuments({ sellerTelegramId: telegramUserId, status: 'Active' })
  if (activeCount >= 30) {
    return res.status(400).json({ message: 'You already have 30 active gift listings. Cancel one first.' })
  }

  const dupOpen = await GiftListing.findOne({
    sellerTelegramId: telegramUserId,
    ownedGiftId,
    status: { $in: ['Active', 'Processing'] },
  })
    .select('_id')
    .lean()
  if (dupOpen) {
    return res.status(409).json({
      message:
        'This inventory gift already has an active listing or a payment in progress. Cancel that listing before creating another.',
    })
  }

  let available
  try {
    available = await tgApi('getAvailableGifts', {})
  } catch (e) {
    return res.status(e.statusCode || 502).json({ message: e.message || 'getAvailableGifts failed' })
  }
  const meta = (available.gifts || []).find((x) => String(x?.id) === gid)
  const telegramStarCost = Math.max(0, Number(meta?.star_count) || 0)

  const settings = (await AdminSettings.findOne()) || (await AdminSettings.create({}))
  const platformFeePercent = Number(settings.platformFeePercent) || 0

  if (pricing === 'stars') {
    const platformFeeStars = Math.round((priceStars * platformFeePercent) / 100)
    const sellerNet = priceStars - platformFeeStars - telegramStarCost
    if (sellerNet < 1) {
      return res.status(400).json({
        message: `Price too low after ${telegramStarCost} ★ Telegram send cost and ${platformFeeStars} ★ platform fee (${platformFeePercent}%). Increase priceStars.`,
      })
    }
  } else {
    const platformFeeTon = Number(((priceTon * platformFeePercent) / 100).toFixed(9))
    const sellerPayoutTon = Number(Math.max(0, priceTon - platformFeeTon).toFixed(9))
    if (sellerPayoutTon <= 0) {
      return res.status(400).json({ message: 'Price too low after platform fee — increase priceTon.' })
    }

    const sellerRow = await AdminUser.findOne({ telegramId: telegramUserId }).lean()
    if (!sellerRow) {
      return res.status(400).json({
        message: 'Open GiftedForge in Telegram once and connect Wallet (TON or EVM) for payouts.',
      })
    }
    const w = String(sellerRow.walletAddress || '').trim()
    if (!w || normalizeLooseAddress(w).length < 24) {
      return res.status(400).json({
        message: 'Connect a wallet under Wallet before listing gifts for TON-priced sales (TON or EVM payout address).',
      })
    }

    try {
      await resolveOrCreateActorUser({
        telegramId: telegramUserId,
        firstName: userUnsafe.first_name,
        lastName: userUnsafe.last_name,
        username: sellerRow.username,
        photoUrl: userUnsafe.photo_url,
        walletAddress: w,
      })
    } catch (e) {
      return res.status(400).json({ message: e.message || 'Could not sync seller profile.' })
    }
  }

  const st = rawGift.gift?.sticker || {}
  const label = String(rawGift.text || `Gift ${gid}`).trim().slice(0, 120)
  const sellerUsername = String(userUnsafe?.username || '')
    ? `@${String(userUnsafe.username).replace(/^@/, '')}`
    : ''

  const doc = await GiftListing.create({
    sellerTelegramId: telegramUserId,
    sellerUsername,
    giftId: gid,
    ownedGiftId,
    giftKind: 'regular',
    emoji: st.emoji || '🎁',
    label,
    telegramStarCost,
    pricing,
    priceStars: pricing === 'stars' ? priceStars : 0,
    priceTon: pricing === 'ton' ? Number(priceTon.toFixed(9)) : 0,
    status: 'Active',
  })
  const enriched = await enrichGiftListingsWithSellerWallets([doc])
  res.status(201).json({ ok: true, listing: enriched[0] })
})

app.post('/api/user/gift-listings/:id/cancel', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const initData = String(req.body?.initData || '').trim()
  if (!initData) return res.status(400).json({ message: 'initData is required' })
  let telegramUserId
  try {
    ;({ telegramUserId } = validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN))
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }
  const doc = await GiftListing.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Listing not found' })
  if (doc.sellerTelegramId !== telegramUserId) {
    return res.status(403).json({ message: 'You can only cancel your own listings.' })
  }
  if (doc.status !== 'Active') {
    return res.status(409).json({ message: 'This listing is no longer active.' })
  }
  doc.status = 'Cancelled'
  await doc.save()
  const enriched = await enrichGiftListingsWithSellerWallets([doc])
  res.json({ ok: true, listing: enriched[0] })
})

app.post('/api/user/gift-listings/:id/buy', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ message: 'Telegram bot is not configured (TELEGRAM_BOT_TOKEN).' })
  }
  const paymentMethod = String(req.body?.paymentMethod || 'stars').trim().toLowerCase()
  const txRef = String(req.body?.txRef || '').trim()
  const initData = String(req.body?.initData || '').trim()
  if (!initData) return res.status(400).json({ message: 'initData is required' })
  let buyerTelegramId
  let buyerUnsafe
  try {
    const v = validateTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN)
    buyerTelegramId = v.telegramUserId
    buyerUnsafe = v.user || {}
  } catch (e) {
    return res.status(e.statusCode || 401).json({ message: e.message })
  }

  const listingDoc = await GiftListing.findById(req.params.id)
  if (!listingDoc || listingDoc.status !== 'Active') {
    return res.status(404).json({ message: 'Listing not found or already sold.' })
  }
  if (listingDoc.sellerTelegramId === buyerTelegramId) {
    return res.status(400).json({ message: 'You cannot buy your own gift listing.' })
  }

  try {
    // Never trust req.body.telegramId alone — Mini App signer is initData-only for identity.
    await resolveOrCreateActorUser({
      ...req.body,
      telegramId: buyerTelegramId,
      firstName: buyerUnsafe.first_name,
      lastName: buyerUnsafe.last_name,
      username: buyerUnsafe.username ? sanitizeUsername(buyerUnsafe.username) : undefined,
      photoUrl: buyerUnsafe.photo_url,
      languageCode: buyerUnsafe.language_code,
    })
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message || 'Buyer profile could not be resolved' })
  }

  const priceTonListed = Number(listingDoc.priceTon) || 0
  const priceStarsListed = Number(listingDoc.priceStars) || 0
  const pricing =
    listingDoc.pricing === 'ton' || listingDoc.pricing === 'stars'
      ? listingDoc.pricing
      : priceTonListed > 0
        ? 'ton'
        : 'stars'

  const unlock = async () => {
    await GiftListing.updateOne({ _id: listingDoc._id }, { $set: { status: 'Active' } })
  }

  const locked = await GiftListing.findOneAndUpdate(
    { _id: listingDoc._id, status: 'Active' },
    { $set: { status: 'Processing' } },
    { new: true },
  )
  if (!locked) {
    return res.status(409).json({ message: 'This listing was just purchased or removed.' })
  }

  let available
  try {
    available = await tgApi('getAvailableGifts', {})
  } catch (e) {
    await unlock()
    return res.status(e.statusCode || 502).json({ message: e.message || 'getAvailableGifts failed' })
  }
  const meta = (available.gifts || []).find((x) => String(x?.id) === listingDoc.giftId)
  if (!meta) {
    await unlock()
    return res.status(409).json({ message: 'This gift type is no longer available from Telegram for delivery.' })
  }
  const telegramStarCost = Math.max(0, Number(meta.star_count) || 0)

  const settings = (await AdminSettings.findOne()) || (await AdminSettings.create({}))
  const platformFeePercent = Number(settings.platformFeePercent) || 0

  const buyer = await AdminUser.findOne({ telegramId: buyerTelegramId })
  if (!buyer) {
    await unlock()
    return res.status(400).json({ message: 'Open GiftedForge in Telegram once so your account exists.' })
  }
  const seller = await AdminUser.findOne({ telegramId: listingDoc.sellerTelegramId })
  if (!seller) {
    await unlock()
    return res.status(409).json({ message: 'Seller account missing — seller must open the app once.' })
  }

  const finalizeSold = async (amountLabel, feeLabel) => {
    const buyerName = buyer.username || buyer.name
    const sellerName = seller.username || seller.name
    const buyerUsername = buyerUnsafe?.username ? `@${String(buyerUnsafe.username).replace(/^@/, '')}` : ''

    locked.status = 'Sold'
    locked.buyerTelegramId = buyerTelegramId
    locked.buyerUsername = buyerUsername
    locked.soldAt = new Date()
    await locked.save()

    await AdminTransaction.create({
      icon: pricing === 'ton' ? '/bag-2.svg' : '/star.svg',
      name: `Gift marketplace • ${listingDoc.label || 'Gift'}`,
      type: 'Swap',
      fromUser: buyerName,
      toUser: sellerName,
      amount: amountLabel,
      feeLabel,
    })
    await AdminAlert.create({
      icon: '/verify.svg',
      title: 'Gift sold (marketplace)',
      subtitle: `${listingDoc.label || 'Gift'} — buyer ${buyerName}`,
      timeBadge: 'Now',
    })
  }

  const deliverGiftToBuyer = async () => {
    const buyerStarsBefore = Number(buyer.stars) || 0
    if (telegramStarCost > 0 && buyerStarsBefore < telegramStarCost) {
      await unlock()
      const err = new Error(
        `Telegram delivery needs ${telegramStarCost} Stars in your GiftedForge balance (covers Telegram's send quota). You have ${buyerStarsBefore}.`,
      )
      err.statusCode = 400
      throw err
    }
    let debited = 0
    if (telegramStarCost > 0) {
      debited = telegramStarCost
      buyer.stars = buyerStarsBefore - telegramStarCost
      await buyer.save()
    }
    try {
      await sendGiftMarketplaceDeliver(buyerTelegramId, listingDoc.giftId)
    } catch (tgErr) {
      if (debited > 0) {
        buyer.stars = buyerStarsBefore
        await buyer.save()
      }
      await unlock()
      const err = new Error(tgErr?.message || 'Telegram could not deliver the gift to your profile.')
      err.statusCode = 502
      throw err
    }
  }

  try {
    if (pricing === 'ton') {
      if (paymentMethod !== 'crypto') {
        await unlock()
        return res.status(400).json({ message: 'This listing is priced in TON — pay with crypto (wallet).' })
      }
      if (!txRef) {
        await unlock()
        return res.status(400).json({ message: 'txRef is required after completing your TON transfer' })
      }

      const priceTon = Number(priceTonListed)
      const platformFeeTon = Number(((priceTon * platformFeePercent) / 100).toFixed(9))
      const sellerPayoutTon = Number(Math.max(0, priceTon - platformFeeTon).toFixed(9))
      const feeReceiver = String(settings.feeReceiverWalletAddress || '').trim()

      if (platformFeeTon > 0 && !feeReceiver) {
        await unlock()
        return res.status(409).json({ message: 'Platform fee receiver wallet is not configured by admin' })
      }
      if (sellerPayoutTon <= 0) {
        await unlock()
        return res.status(409).json({ message: 'Listing price no longer covers platform fee.' })
      }

      const sellerWallet = String(seller.walletAddress || '').trim()
      if (!sellerWallet || normalizeLooseAddress(sellerWallet).length < 24) {
        await unlock()
        return res.status(409).json({ message: 'Seller has no valid payout wallet on file — they must connect Wallet.' })
      }

      await deliverGiftToBuyer()

      await finalizeSold(
        `${priceTon.toFixed(4)} TON`,
        `TON · tx ${txRef.slice(0, 18)}… | Platform ${platformFeeTon.toFixed(4)} TON (${platformFeePercent.toFixed(2)}%) | Seller ${sellerPayoutTon.toFixed(4)} TON | Telegram delivery ${telegramStarCost} ★ from buyer balance`,
      )

      return res.json({
        ok: true,
        message:
          'Purchase complete. The gift was delivered to your Telegram profile. TON was sent from your wallet to the seller and platform as shown in your wallet app.',
        starsRemaining: Number(buyer.stars) || 0,
      })
    }

    if (paymentMethod !== 'stars') {
      await unlock()
      return res.status(400).json({ message: 'This listing is priced in Stars — pay with in-app Stars.' })
    }

    const priceStars = Number(priceStarsListed)
    const platformFeeStars = Math.round((priceStars * platformFeePercent) / 100)
    const sellerPayoutStars = priceStars - platformFeeStars - telegramStarCost
    if (sellerPayoutStars < 1) {
      await unlock()
      return res.status(409).json({ message: 'Listing price no longer covers Telegram fees. Ask seller to update.' })
    }

    const buyerStarsBefore = Number(buyer.stars) || 0
    if (buyerStarsBefore < priceStars) {
      await unlock()
      return res.status(400).json({
        message: `Insufficient Stars (need ${priceStars}, have ${buyerStarsBefore}). Top up in Wallet.`,
      })
    }

    buyer.stars = buyerStarsBefore - priceStars
    await buyer.save()

    try {
      await sendGiftMarketplaceDeliver(buyerTelegramId, listingDoc.giftId)
    } catch (err) {
      buyer.stars = buyerStarsBefore
      await buyer.save()
      await unlock()
      return res.status(502).json({ message: err?.message || 'Telegram could not deliver the gift.' })
    }

    seller.stars = (Number(seller.stars) || 0) + sellerPayoutStars
    if (platformFeeStars > 0) {
      settings.platformStarsAccrued = (Number(settings.platformStarsAccrued) || 0) + platformFeeStars
      await settings.save()
    }
    await seller.save()

    await finalizeSold(
      `${priceStars} Stars`,
      `Stars · Platform ${platformFeeStars} ★ (${platformFeePercent.toFixed(2)}%) · Seller ${sellerPayoutStars} ★ · Telegram cost ${telegramStarCost} ★`,
    )

    return res.json({
      ok: true,
      message: 'Purchase complete. The gift was sent to your Telegram account from the bot.',
      starsRemaining: Number(buyer.stars) || 0,
    })
  } catch (e) {
    if (!e.statusCode || e.statusCode >= 500) {
      console.error('[gift-buy]', e)
    }
    const code = Number(e.statusCode) || 500
    return res.status(code).json({ message: e.message || 'Gift purchase failed' })
  }
})

/** @returns {{ telegramId: number, stars: number | null, legacy: boolean } | null} */
function parseStarsTopupInvoicePayload(payload) {
  const s = String(payload || '').trim()
  const m3 = /^stars-topup:(\d+):(\d+):(\d+)$/.exec(s)
  if (m3) {
    return { telegramId: Number(m3[1]), stars: Number(m3[2]), legacy: false }
  }
  const m2 = /^stars-topup:(\d+):(\d+)$/.exec(s)
  if (m2) {
    return { telegramId: Number(m2[1]), stars: null, legacy: true }
  }
  return null
}

/**
 * Telegram Stars (digital goods): Bot API requires answerPreCheckoutQuery within ~10s
 * after pre_checkout_query or checkout fails on mobile and desktop.
 * @see https://core.telegram.org/bots/payments-stars
 */
async function answerStarsPreCheckoutIfPresent(update) {
  const pcq = update?.pre_checkout_query
  if (!pcq || typeof pcq !== 'object') return

  const queryId = String(pcq.id || '').trim()
  if (!queryId || !TELEGRAM_BOT_TOKEN) return

  const fromId = Number(pcq.from?.id)
  const currency = String(pcq.currency || '').trim().toUpperCase()
  const totalAmount = Number(pcq.total_amount)
  const payload = String(pcq.invoice_payload || '').trim()

  let ok = true
  let errorMessage = ''

  if (currency !== 'XTR') {
    ok = false
    errorMessage = 'Only Telegram Stars (XTR) are supported.'
  } else if (!Number.isFinite(totalAmount) || totalAmount < 1 || totalAmount > 1_000_000) {
    ok = false
    errorMessage = 'Invalid Stars amount.'
  } else {
    const parsed = parseStarsTopupInvoicePayload(payload)
    if (!parsed) {
      ok = false
      errorMessage = 'Unknown invoice.'
    } else if (!Number.isFinite(fromId) || fromId <= 0 || fromId !== parsed.telegramId) {
      ok = false
      errorMessage = 'This Stars top-up is for a different Telegram account.'
    } else if (!parsed.legacy) {
      if (!Number.isFinite(parsed.stars) || parsed.stars < 1 || parsed.stars !== totalAmount) {
        ok = false
        errorMessage = 'Invoice amount does not match this top-up.'
      }
    }
  }

  const answerBody = { pre_checkout_query_id: queryId, ok }
  if (!ok && errorMessage) answerBody.error_message = errorMessage.slice(0, 250)

  try {
    await tgApi('answerPreCheckoutQuery', answerBody)
  } catch (e) {
    console.error('[telegram-webhook] answerPreCheckoutQuery failed', e?.message || e)
  }
}

app.post('/api/telegram/webhook', async (req, res) => {
  // Optional hardening: verify Telegram secret header when configured.
  if (TELEGRAM_WEBHOOK_SECRET) {
    const header = String(req.headers['x-telegram-bot-api-secret-token'] || '')
    if (header !== TELEGRAM_WEBHOOK_SECRET) return res.status(401).json({ ok: false })
  }

  const update = req.body || {}

  if (update.pre_checkout_query) {
    await answerStarsPreCheckoutIfPresent(update)
    return res.json({ ok: true })
  }

  const msg = update?.message || update?.edited_message
  const sp = msg?.successful_payment
  if (!msg || !sp) return res.json({ ok: true })

  const telegramId = Number(msg?.from?.id)
  const totalAmount = Number(sp.total_amount)
  const currency = String(sp.currency || '').trim().toUpperCase()
  const telegramPaymentChargeId = String(sp.telegram_payment_charge_id || '').trim()
  const providerPaymentChargeId = String(sp.provider_payment_charge_id || '').trim()
  const payload = String(sp.invoice_payload || '').trim()

  // We only credit Stars payments (XTR) into in-app balance.
  if (!telegramPaymentChargeId || !Number.isFinite(telegramId) || telegramId <= 0) return res.json({ ok: true })
  if (currency !== 'XTR') return res.json({ ok: true })
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return res.json({ ok: true })

  const exists = await StarsPayment.findOne({ telegramPaymentChargeId })
  if (exists) return res.json({ ok: true })

  const parsedPayload = parseStarsTopupInvoicePayload(payload)
  if (!parsedPayload || parsedPayload.telegramId !== telegramId) return res.json({ ok: true })
  if (!parsedPayload.legacy && parsedPayload.stars !== totalAmount) return res.json({ ok: true })

  // Ensure user exists
  let user = await AdminUser.findOne({ telegramId })
  if (!user) {
    user = await AdminUser.create({
      telegramId,
      name: `Telegram ${telegramId}`,
      img: '/white-man.jpg',
      balanceLabel: '$0',
      stars: 0,
      status: 'Active',
    })
    await ensureUserReferralCode(user)
  }

  // Credit in-app Stars
  user.stars = (Number(user.stars) || 0) + totalAmount
  await Promise.all([
    user.save(),
    StarsPayment.create({
      telegramId,
      providerPaymentChargeId,
      telegramPaymentChargeId,
      currency,
      totalAmount,
      payload,
      rawUpdate: update,
    }),
    AdminTransaction.create({
      icon: '/star.svg',
      name: 'Stars top-up',
      type: 'Deposit',
      fromUser: user.username || user.name,
      toUser: 'GiftedForge',
      amount: `${totalAmount} Stars`,
      feeLabel: `Telegram Stars payment ${telegramPaymentChargeId.slice(0, 18)}...`,
    }),
  ])

  return res.json({ ok: true })
})

app.get('/api/admin/alerts', async (_req, res) => {
  const rows = await AdminAlert.find({}).sort({ createdAt: -1 }).limit(50)
  res.json(rows.map(toAdminAlert))
})

// ── User panel API (shared backend with admin) ──────────────────────────────
app.post('/api/user/session', async (req, res) => {
  const { telegramId, firstName, lastName, username, photoUrl, languageCode, walletAddress, walletType, referralCode } = req.body || {}
  const tgId = Number(telegramId)
  const hasTg = Number.isFinite(tgId) && tgId > 0
  const normalizedWallet = String(walletAddress || '').trim()
  const normalizedReferralCode = normalizeReferralCode(referralCode)

  if (!hasTg && !normalizedWallet) {
    return res.status(400).json({ code: 'REQUEST_ERROR', message: 'telegramId or walletAddress is required' })
  }

  const normalizedUsername = sanitizeUsername(username)
  const displayName =
    `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim() ||
    normalizedUsername ||
    (hasTg ? `Telegram ${tgId}` : 'Wallet User')

  const existing = await findUserByIdentityPriority({
    username: normalizedUsername,
    telegramId: hasTg ? tgId : null,
    walletAddress: normalizedWallet,
  })

  if (existing) {
    if (isUserAccessBlocked(existing.status)) {
      return res.status(403).json(userBlockPayload(existing.status))
    }
    if (hasTg) existing.telegramId = tgId
    existing.name = displayName
    existing.username = normalizedUsername || existing.username
    existing.img = photoUrl || existing.img || '/white-man.jpg'
    if (normalizedWallet) {
      existing.walletAddress = normalizedWallet
      existing.walletCount = Math.max(1, Number(existing.walletCount || 0))
      if (!existing.balanceLabel) existing.balanceLabel = '$0'
    }
    if (languageCode && !existing.email) {
      // Keep a lightweight hint for operators without creating fake email identities.
      existing.email = existing.email || undefined
    }
    await ensureUserReferralCode(existing)
    if (!existing.referredByCode && normalizedReferralCode) {
      const ownCode = normalizeReferralCode(existing.referralCode)
      if (normalizedReferralCode && normalizedReferralCode !== ownCode) {
        const referrer = await AdminUser.findOne({ referralCode: normalizedReferralCode })
        if (referrer && String(referrer._id) !== String(existing._id)) {
          existing.referredByCode = normalizedReferralCode
          referrer.referralCount = (Number(referrer.referralCount) || 0) + 1
          referrer.referralPendingUsd = Number((Number(referrer.referralPendingUsd || 0) + REFERRAL_BONUS_USD).toFixed(2))
          await referrer.save()
        }
      }
    }
    await existing.save()
    if (hasTg) await linkStaffTelegramIdFromSession(tgId, normalizedUsername || existing.username)
    console.log(
      `[${req._rid}] user-session upsert existing id=${existing._id} tg=${hasTg ? tgId : 'none'} wallet=${normalizedWallet || 'none'}`,
    )
    return res.json({ ok: true, user: toAdminUser(existing) })
  }

  const created = await AdminUser.create({
    telegramId: hasTg ? tgId : undefined,
    name: displayName,
    username: normalizedUsername || undefined,
    img: photoUrl || '/white-man.jpg',
    walletAddress: normalizedWallet || undefined,
    walletCount: normalizedWallet ? 1 : 0,
    balanceLabel: '$0',
    stars: 0,
    status: 'Active',
    referredByCode: normalizedReferralCode || undefined,
  })

  await ensureUserReferralCode(created)
  if (normalizedReferralCode) {
    const ownCode = normalizeReferralCode(created.referralCode)
    if (normalizedReferralCode !== ownCode) {
      const referrer = await AdminUser.findOne({ referralCode: normalizedReferralCode })
      if (referrer && String(referrer._id) !== String(created._id)) {
        created.referredByCode = normalizedReferralCode
        referrer.referralCount = (Number(referrer.referralCount) || 0) + 1
        referrer.referralPendingUsd = Number((Number(referrer.referralPendingUsd || 0) + REFERRAL_BONUS_USD).toFixed(2))
        await Promise.all([created.save(), referrer.save()])
      }
    }
  }

  if (hasTg) await linkStaffTelegramIdFromSession(tgId, normalizedUsername)
  console.log(
    `[${req._rid}] user-session created id=${created._id} tg=${hasTg ? tgId : 'none'} wallet=${normalizedWallet || 'none'}`,
  )
  return res.status(201).json({ ok: true, user: toAdminUser(created) })
})

app.post('/api/user/mint', async (req, res) => {
  const payload = createPendingMintPayload(req.body || {})
  const pending = await PendingMint.findOneAndUpdate(
    { clientMintId: payload.clientMintId },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  const result = await reconcilePendingMint(pending)
  if (!result.ok) {
    return res.status(202).json({
      ok: false,
      message: 'Mint transaction not confirmed on-chain yet. Sync is pending.',
      state: result.state,
      reason: result.reason,
      clientMintId: pending.clientMintId,
    })
  }
  return res.status(201).json({
    ok: true,
    message: 'NFT minted and listed successfully.',
    state: 'saved',
    clientMintId: pending.clientMintId,
    asset: result.asset,
  })
})

app.post('/api/user/mint/pending', async (req, res) => {
  const payload = createPendingMintPayload(req.body || {})
  const pending = await PendingMint.findOneAndUpdate(
    { clientMintId: payload.clientMintId },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  console.log(`[${req._rid}] mint-pending created clientMintId=${pending.clientMintId}`)
  return res.status(201).json({ ok: true, clientMintId: pending.clientMintId, status: pending.status })
})

app.post('/api/user/mint/resume', async (req, res) => {
  const clientMintId = String(req.body?.clientMintId || '').trim()
  if (!clientMintId) return res.status(400).json({ message: 'clientMintId is required' })

  const pending = await PendingMint.findOne({ clientMintId })
  if (!pending) return res.status(404).json({ message: 'Pending mint not found' })

  if (req.body?.txRef && !pending.txRef) {
    pending.txRef = String(req.body.txRef).trim()
    await pending.save()
  }

  const result = await reconcilePendingMint(pending)
  if (!result.ok) {
    return res.status(202).json({
      ok: false,
      clientMintId,
      status: pending.status,
      state: result.state,
      reason: result.reason,
    })
  }

  return res.json({
    ok: true,
    clientMintId,
    status: 'saved',
    state: 'saved',
    asset: result.asset,
  })
})

app.get('/api/user/market', async (req, res) => {
  const { search = '', category = "All Item's", tab = 'Explore', username = '', sort = '-createdAt' } = req.query
  const { limit, skip } = parsePageParams(req)
  const query = { status: 'Active' }
  const andClauses = []

  if (tab === 'StarGifts') {
    query.marketTab = 'StarGifts'
  } else if (tab === "My Listing's") {
    query.username = sanitizeUsername(username)
  } else {
    andClauses.push({
      $or: [{ marketTab: 'Explore' }, { marketTab: { $exists: false } }, { marketTab: null }],
    })
  }

  if (category && category !== "All Item's") {
    query.category = category
  }

  if (search) {
    const rx = new RegExp(String(search), 'i')
    andClauses.push({ $or: [{ title: rx }, { username: rx }] })
  }

  if (andClauses.length) {
    query.$and = andClauses
  }

  const total = await AdminAsset.countDocuments(query)
  const assets = await AdminAsset.find(query).sort(parseSortParam(sort)).skip(skip).limit(limit)
  res.set('x-total-count', String(total))
  res.json(assets.map(toAdminAsset))
})

app.get('/api/nfts', async (req, res) => {
  const { search = '', category = "All Item's", sort = '-createdAt' } = req.query
  const { limit, skip } = parsePageParams(req)
  const query = { status: 'Active' }
  const andClauses = []

  if (category && category !== "All Item's") {
    query.category = category
  }
  if (search) {
    const rx = new RegExp(String(search), 'i')
    andClauses.push({ $or: [{ title: rx }, { username: rx }] })
  }
  if (andClauses.length) query.$and = andClauses

  const total = await AdminAsset.countDocuments(query)
  const assets = await AdminAsset.find(query).sort(parseSortParam(sort)).skip(skip).limit(limit)
  res.set('x-total-count', String(total))
  res.json(assets.map(toAdminAsset))
})

app.get('/api/user/assets/:id', async (req, res) => {
  const doc = await AdminAsset.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: 'Asset not found' })
  const { username = '', telegramId = '', walletAddress = '' } = req.query
  const viewer = await findPanelUser(username, telegramId, walletAddress)
  const viewerOwned =
    !!viewer && !!doc.ownerUserId && String(doc.ownerUserId) === String(viewer._id)
  const currentOwner = doc.ownerUserId ? await AdminUser.findById(doc.ownerUserId) : null
  const listingSeller = doc.username
    ? await AdminUser.findOne({ username: sanitizeUsername(doc.username) })
    : null
  return res.json({
    viewerOwned,
    asset: {
      ...toAdminAsset(doc),
      sellerWalletAddress: listingSeller?.walletAddress || undefined,
      ownerWalletAddress: currentOwner?.walletAddress || undefined,
      sellerImg: listingSeller?.img || '/avatari.png',
    },
  })
})

app.post('/api/user/assets/:id/offer', async (req, res) => {
  const { offerTon, paymentMethod = 'crypto' } = req.body || {}
  const offer = Number(offerTon)
  if (!Number.isFinite(offer) || offer <= 0) {
    return res.status(400).json({ message: 'offerTon must be a number greater than 0' })
  }

  const asset = await AdminAsset.findById(req.params.id)
  if (!asset) return res.status(404).json({ message: 'Asset not found' })
  if (asset.status !== 'Active') {
    return res.status(409).json({ message: 'This asset is not accepting offers right now' })
  }

  const actor = await resolveOrCreateActorUser(req.body)
  const buyerName = actor.username || actor.name
  const sellerName = asset.username || '@seller'

  const starsEquiv = Math.round(offer * STARS_PER_TON_NUM)
  await AdminTransaction.create({
    icon: '/dollar-square.svg',
    name: `Offer • ${asset.title}`,
    type: 'Swap',
    assetId: asset._id,
    fromUser: buyerName,
    toUser: sellerName,
    amount:
      paymentMethod === 'stars'
        ? `${starsEquiv} Stars (≈ ${offer.toFixed(3)} TON)`
        : `${offer.toFixed(3)} TON`,
    feeLabel:
      paymentMethod === 'stars'
        ? 'Offer intent · settle in Stars if accepted'
        : 'Offer via on-chain / wallet settlement',
  })

  await AdminAlert.create({
    icon: '/danger.svg',
    title: 'New offer submitted',
    subtitle: `${buyerName} offered ${offer.toFixed(3)} TON for ${asset.title}`,
    timeBadge: 'Now',
  })

  console.log(`[${req._rid}] offer-created asset=${asset._id} by=${buyerName} amount=${offer.toFixed(3)} TON`)
  return res.status(201).json({ ok: true, message: 'Offer submitted successfully.' })
})

app.post('/api/user/assets/:id/buy', async (req, res) => {
  const { paymentMethod = 'crypto', txRef } = req.body || {}
  const asset = await AdminAsset.findById(req.params.id)
  if (!asset) return res.status(404).json({ message: 'Asset not found' })
  if (asset.status !== 'Active') {
    return res.status(409).json({ message: 'This asset has already been sold or removed' })
  }

  const actor = await resolveOrCreateActorUser(req.body)
  const buyerName = actor.username || actor.name
  const sellerName = asset.username || '@seller'

  if (buyerName === sellerName) {
    return res.status(400).json({ message: 'You cannot buy your own listing' })
  }

  const priceTon = parseTonAmount(asset.price)
  const settings = (await AdminSettings.findOne()) || (await AdminSettings.create({}))
  const platformFeePercent = Number(settings.platformFeePercent) || 0

  if (paymentMethod === 'stars') {
    const priceStars = Math.round(priceTon * STARS_PER_TON_NUM)
    if (priceStars < 1) {
      return res.status(400).json({ message: 'Invalid listing price for Stars checkout' })
    }
    const platformFeeStars = Math.round((priceStars * platformFeePercent) / 100)
    const sellerPayoutStars = Math.max(0, priceStars - platformFeeStars)

    const buyerStars = Number(actor.stars) || 0
    if (buyerStars < priceStars) {
      return res.status(400).json({
        message: `Insufficient Stars balance (need ${priceStars}, have ${buyerStars}). Top up in Wallet.`,
      })
    }

    const owner = asset.ownerUserId ? await AdminUser.findById(asset.ownerUserId) : null
    const sellerUser =
      owner ||
      (asset.username
        ? await AdminUser.findOne({ username: sanitizeUsername(asset.username) })
        : null)
    if (!sellerUser) {
      return res.status(409).json({
        message: 'Seller account is missing for Stars payout. Seller must open the app once to register.',
      })
    }
    if (String(sellerUser._id) === String(actor._id)) {
      return res.status(400).json({ message: 'You cannot buy your own listing' })
    }

    actor.stars = buyerStars - priceStars
    await actor.save()

    sellerUser.stars = (Number(sellerUser.stars) || 0) + sellerPayoutStars
    await sellerUser.save()

    if (platformFeeStars > 0) {
      settings.platformStarsAccrued = (Number(settings.platformStarsAccrued) || 0) + platformFeeStars
      await settings.save()
    }

    asset.status = 'Owned'
    asset.ownerUserId = actor._id
    await asset.save()

    const ref = String(txRef || '').trim() || `stars-${Date.now()}`
    await AdminTransaction.create({
      icon: '/bag-2.svg',
      name: `Purchase • ${asset.title}`,
      type: 'Swap',
      fromUser: buyerName,
      toUser: sellerName,
      amount: `${priceStars} Stars`,
      feeLabel: `In-app Stars · ref ${ref.slice(0, 22)}… | Platform ${platformFeeStars} ★ (${platformFeePercent.toFixed(2)}%) | Seller ${sellerPayoutStars} ★`,
    })

    await AdminAlert.create({
      icon: '/verify.svg',
      title: 'Asset purchased (Stars)',
      subtitle: `${asset.title} purchased by ${buyerName}`,
      timeBadge: 'Now',
    })

    console.log(
      `[${req._rid}] asset-purchased-stars asset=${asset._id} by=${buyerName} stars=${priceStars} feeStars=${platformFeeStars} sellerStars=${sellerPayoutStars}`,
    )
    return res.json({
      ok: true,
      message:
        'Purchase completed with Stars. Open Profile → Your Collection to see it. The seller must send the NFT to your TON wallet on-chain — connect Wallet first and share your address with them.',
    })
  }

  if (paymentMethod !== 'crypto') {
    return res.status(400).json({ message: 'Unsupported payment method' })
  }
  if (!String(txRef || '').trim()) {
    return res.status(400).json({ message: 'txRef is required for on-chain purchase confirmation' })
  }

  const feeReceiver = String(settings.feeReceiverWalletAddress || '').trim()
  const platformFeeTon = Number(((priceTon * platformFeePercent) / 100).toFixed(6))
  const sellerPayoutTon = Number(Math.max(0, priceTon - platformFeeTon).toFixed(6))
  if (platformFeeTon > 0 && !feeReceiver) {
    return res.status(409).json({ message: 'Platform fee receiver wallet is not configured by admin' })
  }

  asset.status = 'Owned'
  asset.ownerUserId = actor._id
  await asset.save()

  await AdminTransaction.create({
    icon: '/bag-2.svg',
    name: `Purchase • ${asset.title}`,
    type: 'Swap',
    fromUser: buyerName,
    toUser: sellerName,
    amount: `${priceTon.toFixed(3)} TON`,
    feeLabel: `On-chain tx ${String(txRef).slice(0, 18)}... | Platform fee ${platformFeeTon.toFixed(3)} TON (${platformFeePercent.toFixed(2)}%) | Seller payout ${sellerPayoutTon.toFixed(3)} TON`,
  })

  await AdminAlert.create({
    icon: '/verify.svg',
    title: 'Asset purchased',
    subtitle: `${asset.title} purchased by ${buyerName}`,
    timeBadge: 'Now',
  })

  console.log(
    `[${req._rid}] asset-purchased asset=${asset._id} by=${buyerName} price=${priceTon.toFixed(3)} fee=${platformFeeTon.toFixed(3)} seller=${sellerPayoutTon.toFixed(3)} tx=${String(txRef).slice(0, 24)}`,
  )
  return res.json({
    ok: true,
    message:
      'Payment recorded. Open Profile → Your Collection to see your item. Connect your TON wallet — the seller must transfer the NFT to your wallet on-chain before it appears in Tonkeeper.',
  })
})

app.post('/api/user/assets/:id/transfer', async (req, res) => {
  const { recipientTonAddress, txRef } = req.body || {}
  const recipient = String(recipientTonAddress || '').trim()
  if (!recipient) return res.status(400).json({ message: 'recipientTonAddress is required' })
  if (!String(txRef || '').trim()) {
    return res.status(400).json({ message: 'txRef is required after signing the transfer in your wallet' })
  }

  const asset = await AdminAsset.findById(req.params.id)
  if (!asset) return res.status(404).json({ message: 'Asset not found' })

  const actor = await resolveOrCreateActorUser(req.body)
  if (!asset.ownerUserId || String(asset.ownerUserId) !== String(actor._id)) {
    return res.status(403).json({ message: 'You do not own this NFT in the app catalog' })
  }

  const senderNorm = normalizeLooseAddress(actor.walletAddress || '')
  const recipientNorm = normalizeLooseAddress(recipient)
  if (!recipientNorm || recipientNorm.length < 24) {
    return res.status(400).json({ message: 'Invalid recipient TON address' })
  }
  if (senderNorm && senderNorm === recipientNorm) {
    return res.status(400).json({ message: 'Recipient must be a different wallet than yours' })
  }

  let recipientDoc = await findUserByWalletLoose(recipient)
  if (!recipientDoc) {
    recipientDoc = await AdminUser.create({
      name: `Collector ${recipient.slice(0, 8)}…`,
      walletAddress: recipient,
      walletCount: 1,
      balanceLabel: '$0',
      stars: 0,
      status: 'Active',
    })
    await ensureUserReferralCode(recipientDoc)
  }

  const senderLabel = actor.username || actor.name
  const recipientLabel =
    recipientDoc.username ||
    recipientDoc.name ||
    (recipientDoc.telegramId ? `@user${recipientDoc.telegramId}` : recipient.slice(0, 10))

  const recipientHandle =
    sanitizeUsername(recipientDoc.username) ||
    (recipientDoc.telegramId ? `@user${recipientDoc.telegramId}` : `@collector_${String(recipientDoc._id).slice(-6)}`)

  asset.ownerUserId = recipientDoc._id
  asset.username = recipientHandle
  await asset.save()

  await AdminTransaction.create({
    icon: '/nft.svg',
    name: `Send NFT • ${asset.title}`,
    type: 'Gift',
    fromUser: senderLabel,
    toUser: recipientLabel,
    amount: 'NFT transfer',
    feeLabel: `On-chain tx ${String(txRef).slice(0, 22)}…`,
  })

  console.log(`[${req._rid}] nft-transferred asset=${asset._id} toWallet=${recipient.slice(0, 12)}…`)
  return res.json({ ok: true, message: 'NFT transferred. Listing now shows the recipient as owner.' })
})

app.get('/api/user/home', async (req, res) => {
  const { username = '', telegramId = '', walletAddress = '' } = req.query
  const userRow = await findPanelUser(username, telegramId, walletAddress)
  const handles = listingHandlesForUser(userRow, username)

  const mineCollection = buildUserCollectionQuery(userRow, handles)
  const mineActive =
    handles.length > 0
      ? { username: { $in: handles }, status: 'Active' }
      : userRow?._id
        ? { ownerUserId: userRow._id, status: 'Active' }
        : null

  const [nftsOwned, activeListings, myCollectionDocs, recentTx] = await Promise.all([
    mineCollection ? AdminAsset.countDocuments(mineCollection) : 0,
    mineActive ? AdminAsset.countDocuments(mineActive) : 0,
    mineCollection
      ? AdminAsset.find(mineCollection).sort({ createdAt: -1 }).limit(200)
      : [],
    AdminTransaction.find({}).sort({ createdAt: -1 }).limit(10),
  ])

  const stats = {
    nftsOwned,
    activeListings,
    stars: userRow?.stars ?? 0,
  }

  res.json({
    stats,
    collection: myCollectionDocs.map((doc) => enrichAssetForViewer(doc, userRow, handles)),
    recentActivity: recentTx.map(toAdminTx),
  })
})

app.get('/api/user/profile', async (req, res) => {
  const { username = '', telegramId = '', walletAddress = '' } = req.query
  const userRow = await findPanelUser(username, telegramId, walletAddress)
  if (userRow) await ensureUserReferralCode(userRow)
  const handles = listingHandlesForUser(userRow, username)

  const mineCollection = buildUserCollectionQuery(userRow, handles)
  const [owned, listings] = await Promise.all([
    mineCollection ? AdminAsset.countDocuments(mineCollection) : 0,
    handles.length
      ? AdminAsset.countDocuments({ username: { $in: handles }, status: 'Active' })
      : userRow?._id
        ? AdminAsset.countDocuments({ ownerUserId: userRow._id, status: 'Active' })
        : 0,
  ])

  res.json({
    nftsOwned: owned,
    activeListings: listings,
    stars: userRow?.stars ?? 0,
    referralCode: userRow?.referralCode || '',
    referral: {
      totalEarnedUsd: Number(userRow?.referralEarnedUsd) || 0,
      referrals: Number(userRow?.referralCount) || 0,
      pendingUsd: Number(userRow?.referralPendingUsd) || 0,
    },
  })
})

app.get('/api/user/offers', async (req, res) => {
  const { username = '', telegramId = '', walletAddress = '', perspective = 'all' } = req.query
  const userRow = await findPanelUser(username, telegramId, walletAddress)
  const handles = listingHandlesForUser(userRow, username)
  const identities = new Set(handles)
  if (userRow?.name) identities.add(String(userRow.name))
  if (userRow?.username) identities.add(String(userRow.username))
  const idList = [...identities].filter(Boolean)

  if (!idList.length) return res.json([])

  const query = {
    name: /^Offer •/i,
  }
  if (perspective === 'sent') {
    query.fromUser = { $in: idList }
  } else if (perspective === 'received') {
    query.toUser = { $in: idList }
  } else {
    query.$or = [{ fromUser: { $in: idList } }, { toUser: { $in: idList } }]
  }

  const rows = await AdminTransaction.find(query).sort({ createdAt: -1 }).limit(200)
  res.json(
    rows.map((row) => {
      const title = String(row.name || '').replace(/^Offer\s*•\s*/i, '') || 'NFT'
      const mineSent = idList.includes(String(row.fromUser))
      return {
        id: String(row._id),
        title,
        assetId: row.assetId ? String(row.assetId) : undefined,
        amount: row.amount,
        timeLabel: minutesAgoLabel(row.createdAt),
        fromUser: row.fromUser,
        toUser: row.toUser,
        direction: mineSent ? 'sent' : 'received',
        status: 'Pending',
      }
    }),
  )
})

app.post('/api/user/swap', async (req, res) => {
  const { direction, amount, telegramId, username, walletAddress } = req.body || {}
  const userRow = await findPanelUser(username, telegramId, walletAddress)
  if (!userRow) {
    return res.status(400).json({
      message: 'User not found. Open the app from Telegram or connect a wallet and sync your session.',
    })
  }

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ message: 'Invalid amount' })
  }

  if (direction === 'ton_to_stars') {
    return res.status(501).json({
      message: 'TON → Stars needs an on-chain deposit proof. Use Stars → TON for now.',
    })
  }

  if (direction !== 'stars_to_ton') {
    return res.status(400).json({ message: 'Invalid swap direction' })
  }

  const starsToSpend = Math.floor(amt)
  const current = Number(userRow.stars) || 0
  if (current < starsToSpend) {
    return res.status(400).json({ message: 'Insufficient Stars balance' })
  }

  userRow.stars = current - starsToSpend
  await userRow.save()

  const tonOut = starsToSpend / STARS_PER_TON_NUM
  await AdminTransaction.create({
    icon: '/import.svg',
    name: 'Swap • Stars → TON (quoted)',
    type: 'Swap',
    fromUser: userRow.name || userRow.username || 'User',
    toUser: userRow.name || userRow.username || 'User',
    amount: `${starsToSpend} Stars`,
    feeLabel: `Quote ≈ ${tonOut.toFixed(5)} TON @ ${STARS_PER_TON_NUM} ★ / TON`,
  })

  return res.json({
    ok: true,
    stars: userRow.stars,
    tonOut,
    message: `Swapped ${starsToSpend} Stars. New balance: ${userRow.stars}.`,
  })
})

app.use((err, _req, res, _next) => {
  console.error(`[${_req._rid || 'no-rid'}]`, err)
  const statusCode = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500
  res.status(statusCode).json({
    code: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    message: err?.message || 'Internal server error',
    status: err.userStatus,
  })
})

let mongoConnectPromise
let bootstrapOwnersDone = false
let pendingMintJobRunning = false
async function ensureMongo() {
  if (mongoose.connection.readyState === 1) {
    if (!bootstrapOwnersDone) {
      bootstrapOwnersDone = true
      try {
        await ensureBootstrapOwnerStaff()
      } catch (err) {
        console.error('[bootstrap-owner]', err?.message || err)
      }
    }
    return
  }
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      family: 4,
    })
  }
  await mongoConnectPromise
  if (!bootstrapOwnersDone) {
    bootstrapOwnersDone = true
    try {
      await ensureBootstrapOwnerStaff()
    } catch (err) {
      console.error('[bootstrap-owner]', err?.message || err)
    }
  }
}

async function runPendingMintSyncJob() {
  if (pendingMintJobRunning) return
  pendingMintJobRunning = true
  try {
    const pendings = await PendingMint.find({ status: { $in: ['pending', 'confirmed'] } })
      .sort({ createdAt: 1 })
      .limit(25)
    for (const pending of pendings) {
      await reconcilePendingMint(pending)
    }
  } catch (err) {
    console.error('[mint-sync-job]', err?.message || err)
  } finally {
    pendingMintJobRunning = false
  }
}

// Vercel serverless entrypoint
export default async function handler(req, res) {
  await ensureMongo()
  void runPendingMintSyncJob()
  return app(req, res)
}

// Local Node server entrypoint
const isDirectRun =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === process.argv[1] ||
    fileURLToPath(import.meta.url).endsWith(process.argv[1]))

if (isDirectRun) {
  console.log('Starting Admin API...')
  console.log('MONGODB_URI length:', MONGODB_URI?.length || 0)

  ensureMongo()
    .then(() => {
      console.log('MongoDB connected successfully')
      setInterval(() => {
        void runPendingMintSyncJob()
      }, 30000)
      app.listen(PORT, () => {
        console.log(`Admin API listening on :${PORT}`)
      })
    })
    .catch((err) => {
      console.error('Failed to start API', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
      })
      process.exit(1)
    })
}

