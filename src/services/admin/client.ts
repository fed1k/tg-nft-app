import type {
  ActivityType,
  AdminAlertItem,
  AdminAsset,
  AdminStaff,
  AdminTransaction,
  AdminUser,
  DashboardSnapshot,
  PlatformSettings,
} from './types'
import { GIFTEDFORGE_DEPLOY } from '../../config/giftedforgeDeploy'

const API_BASE =
  (import.meta.env.VITE_ADMIN_API_URL || '').trim() ||
  `${GIFTEDFORGE_DEPLOY.backendOrigin}/api/admin`
const REQUEST_TIMEOUT_MS = 12000

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err?.name === 'AbortError') {
      throw new Error('Admin API timeout. Check backend URL/CORS/server health.')
    }
    throw new Error(err?.message || 'Failed to connect to Admin API')
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    try {
      const parsed = JSON.parse(text)
      throw new Error(parsed?.message || `Admin API error ${res.status}`)
    } catch {
      throw new Error(text || `Admin API error ${res.status}`)
    }
  }
  return (await res.json()) as T
}

export const adminClient = {
  checkAccess: async (payload: { telegramId?: number; username?: string }) =>
    api<{ authorized: boolean; via: string | null }>('/access-check', {
      method: 'POST',
      body: JSON.stringify({
        telegramId: payload.telegramId,
        username: payload.username,
      }),
    }),

  getDashboard: async () => api<DashboardSnapshot>('/dashboard'),

  listUsers: async (search: string, statusChip: string | null) =>
    api<AdminUser[]>(`/users?search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusChip || '')}`),

  updateUserStatus: async (id: string, status: AdminUser['status']) =>
    api<AdminUser>(`/users/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  createUser: async (input: {
    name: string
    email?: string
    username?: string
    walletAddress?: string
  }) =>
    api<AdminUser>('/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listAssets: async (search: string, statusChip: string | null) =>
    api<AdminAsset[]>(
      `/assets?search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusChip || '')}`,
    ),

  createAsset: async (input: {
    title: string
    username: string
    price: string
    image?: string
    category?: string
    marketTab?: 'Explore' | 'StarGifts'
  }) =>
    api<AdminAsset>('/assets', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateAssetStatus: async (id: string, status: AdminAsset['status']) =>
    api<AdminAsset>(`/assets/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  listTransactions: async (search: string, typeFilter: ActivityType | null) =>
    api<AdminTransaction[]>(
      `/transactions?search=${encodeURIComponent(search)}&type=${encodeURIComponent(typeFilter || '')}`,
    ),

  listStaff: async () => api<AdminStaff[]>('/staff'),

  addStaffMember: async (input: {
    name: string
    email: string
    username: string
    telegramId?: number
    roles: string[]
  }) =>
    api<AdminStaff>('/staff', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  removeStaffMember: async (id: string) =>
    api<{ ok: boolean }>(`/staff/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getSettings: async () => api<PlatformSettings>('/settings'),

  patchSettings: async (partial: Partial<PlatformSettings>) =>
    api<PlatformSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(partial),
    }),

  getAlerts: async () => api<AdminAlertItem[]>('/alerts'),
}

export type AdminClient = typeof adminClient
