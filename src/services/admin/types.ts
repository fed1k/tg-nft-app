/** Admin domain types — shared by UI and API client. */

export type UserStatus = 'Active' | 'Flagged' | 'Suspended' | 'Banned'

export type AssetStatus = 'Active' | 'Pending' | 'Owned' | 'Removed' | 'Flagged'

export type ActivityType = 'All' | 'Mint' | 'Swap' | 'Gift' | 'Deposit' | 'Withdraw'

export interface AdminUser {
  id: string
  img: string
  name: string
  walletCount: number
  balanceLabel: string
  stars: number
  joinDate: string
  status: UserStatus
  email?: string
  username?: string
  walletAddress?: string
  referralCode?: string
  referredByCode?: string
  referralCount: number
  referralEarnedUsd: number
  referralPendingUsd: number
  hasMinted: boolean
}

export interface ReferralLeaderboardItem {
  userId: string
  name: string
  username: string
  img: string
  count: number
}

export interface Nomination {
  rank: number
  user: AdminUser | null
}

export interface AdminAsset {
  id: string
  nft: string
  title: string
  username: string
  sellerWalletAddress?: string
  ownerWalletAddress?: string
  sellerImg?: string
  tokenId?: string
  metadataUrl?: string
  /** TEP-62 NFT item contract (bounceable) — needed for on-chain transfers */
  nftItemAddress?: string
  collectionAddress?: string
  category?: string
  marketTab?: 'Explore' | 'StarGifts'
  price: string
  status: AssetStatus
  ownerUserId?: string
  /** True when the signed-in user owns this item in the app catalog */
  viewerOwned?: boolean
  /** Short label for collection UI, e.g. "Owned" */
  ownershipLabel?: string
}

export interface AdminTransaction {
  id: string
  icon: string
  name: string
  type: Exclude<ActivityType, 'All'>
  fromUser: string
  toUser: string
  timeLabel: string
  amount: string
  feeLabel: string
}

export interface AdminStaff {
  id: string
  name: string
  email: string
  username: string
  telegramId?: number
  roles: string[]
  isOwner?: boolean
  online?: boolean
  createdAt: string
}

export interface PlatformSettings {
  platformFeePercent: number
  feeReceiverWalletAddress: string
  collectionAddress: string
  /** Stars marketplace fees accrued in-app (admin ledger). */
  platformStarsAccrued?: number
  maxUploadMb: number
  tonEnabled: boolean
  maintenanceMode: boolean
  waitlistMode: boolean
}

export interface AdminAlertItem {
  id: string
  icon: string
  title: string
  subtitle: string
  timeBadge: string
}

export interface DashboardSnapshot {
  totalUsers: number
  usersDelta24h: string
  totalVolumeUsd: string
  volumeSubtitle: string
  revenueUsd: string
  revenueSubtitle: string
  activeListings: number
  pendingListings: number
}
