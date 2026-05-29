import React, { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import Modal from '../../components/Modal'
import { adminClient } from '../../services/admin'
import { adminQk } from './queryKeys'
import { clearAdminSession } from '../../utils/adminAuth'

type SettingsPanel =
  | 'fees'
  | 'chains'
  | 'upload'
  | 'security'
  | 'admins'
  | 'reports'
  | 'db'
  | 'locale'
  | 'referrals'
  | null

const isLikelyTelegramUsername = (value: string) => /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value.trim())
const normalizeUsername = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.startsWith('@') ? raw : `@${raw}`
}

export default function AdminControl() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const refresh = () => void qc.invalidateQueries({ queryKey: adminQk.root })

  const { data: staff = [] } = useQuery({
    queryKey: adminQk.staff(),
    queryFn: () => adminClient.listStaff(),
  })

  const { data: settings } = useQuery({
    queryKey: adminQk.settings(),
    queryFn: () => adminClient.getSettings(),
  })
  const { data: alerts = [] } = useQuery({
    queryKey: adminQk.alerts(),
    queryFn: () => adminClient.getAlerts(),
  })

  const { data: leaderboardData } = useQuery({
    queryKey: adminQk.referralLeaderboard(),
    queryFn: () => adminClient.getReferralLeaderboard(),
    enabled: panel === 'referrals',
  })

  const { data: currentNominations = [] } = useQuery({
    queryKey: adminQk.nominations(),
    queryFn: () => adminClient.getNominations(),
    enabled: panel === 'referrals',
  })

  const nominateMut = useMutation({
    mutationFn: adminClient.nominateWinner,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQk.nominations() })
    },
  })

  const validStaff = staff.filter((s) => isLikelyTelegramUsername(normalizeUsername(s.username)))
  const invalidStaff = staff.filter((s) => !isLikelyTelegramUsername(normalizeUsername(s.username)))

  const allAdmins = validStaff.map((s) => ({
    id: s.id,
    name: s.name,
    username: normalizeUsername(s.username),
    telegramId: s.telegramId,
    isOwner: s.isOwner || s.roles?.includes('owner'),
    online: !!s.online,
  }))
  const adminsCount = allAdmins.length
  const online = allAdmins.filter((s) => s.online).length
  const patchMut = useMutation({
    mutationFn: adminClient.patchSettings,
    onSuccess: refresh,
  })

  const [adminModal, setAdminModal] = useState(false)
  const [step, setStep] = useState(1)
  const [panel, setPanel] = useState<SettingsPanel>(null)
  const [feeInput, setFeeInput] = useState(String(settings?.platformFeePercent ?? 2))
  const [feeReceiverInput, setFeeReceiverInput] = useState(String(settings?.feeReceiverWalletAddress ?? ''))
  const [collectionAddrInput, setCollectionAddrInput] = useState(String(settings?.collectionAddress ?? ''))
  const [uploadInput, setUploadInput] = useState(String(settings?.maxUploadMb ?? 500))

  const addMut = useMutation({
    mutationFn: adminClient.addStaffMember,
    onSuccess: () => {
      refresh()
      setAdminModal(false)
      setStep(1)
    },
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => adminClient.removeStaffMember(id),
    onSuccess: refresh,
  })

  const [newAdmin, setNewAdmin] = useState({
    name: '',
    email: '',
    username: '',
    telegramId: '',
    roleModeration: true,
    roleFinance: false,
    roleOwner: false,
  })
  const [adminFormError, setAdminFormError] = useState('')

  const openFees = () => {
    setFeeInput(String(settings?.platformFeePercent ?? 2))
    setFeeReceiverInput(String(settings?.feeReceiverWalletAddress ?? ''))
    setCollectionAddrInput(String(settings?.collectionAddress ?? ''))
    setPanel('fees')
  }

  const openUpload = () => {
    setUploadInput(String(settings?.maxUploadMb ?? 500))
    setPanel('upload')
  }

  return (
    <div className="pb-30 overflow-x-hidden">
      <div className="bg-[#6B6AFD] rounded-3xl py-5 px-3">
        <div className="flex text-center">
          <div className="flex-1 py-[7px]">
            <p className="text-xl font-semibold text-white">{String(adminsCount).padStart(2, '0')}</p>
            <p className="text-xs text-[#DAD8FF] pt-2">Admins</p>
          </div>
          <div className="flex-1 border-x py-[7px] border-[#DAD8FF33]">
            <p className="text-xl font-semibold text-white">{String(online).padStart(2, '0')}</p>
            <p className="text-xs text-[#DAD8FF] pt-2">Online</p>
          </div>
          <div className="flex-1 py-[7px]">
            <p className="text-xl font-semibold text-white">{String(alerts.length).padStart(2, '0')}</p>
            <p className="text-xs text-[#DAD8FF] pt-2">Reports</p>
          </div>
        </div>

        <div className="flex gap-[9px] pt-4">
          <button
            type="button"
            onClick={() => {
              setStep(1)
              setAdminFormError('')
              setNewAdmin({
                name: '',
                email: '',
                username: '',
                telegramId: '',
                roleModeration: true,
                roleFinance: false,
                roleOwner: false,
              })
              setAdminModal(true)
            }}
            className="flex-1 outline-none cursor-pointer bg-black text-white rounded-full h-10.5 text-sm flex items-center gap-2 justify-center font-medium"
          >
            <img src="/user-add.svg" alt="" /> Add Admin
          </button>
        </div>
      </div>

      <Section title="System Settings">
        <Row
          icon="/gallery.svg"
          title="Commision’s & Fee’s"
          subtitle={`Platform fee ${settings?.platformFeePercent ?? '—'}% · Stars accrued ${(settings?.platformStarsAccrued ?? 0).toLocaleString()} ★`}
          onClick={openFees}
        />
        <Row
          icon="/heart.svg"
          title="Admin Management"
          subtitle={`${adminsCount} admins · ${online} online`}
          onClick={() => setPanel('admins')}
        />
        <Row
          icon="/taggray.svg"
          title="Supported Chain’s"
          subtitle={settings?.tonEnabled ? 'TON enabled' : 'TON disabled'}
          onClick={() => setPanel('chains')}
        />
      </Section>

      <Section title="Configuration">
        <Row
          icon="/heart.svg"
          title="Upload"
          subtitle={`Max: ${settings?.maxUploadMb ?? '—'} MB, GLB, GLTF`}
          onClick={openUpload}
        />
        <Row
          icon="/taggray.svg"
          title="Security"
          subtitle="Sessions and admin access controls"
          onClick={() => setPanel('security')}
        />
      </Section>

      <Section title="Moderation">
        <Row
          icon="/profile-2user.svg"
          title="Referral Competition"
          subtitle="Nominate top 3 weekly inviters"
          onClick={() => setPanel('referrals')}
        />
        <Row
          icon="/taggray.svg"
          title="Report’s"
          subtitle="User reports and disputed items · queue in backend"
          onClick={() => setPanel('reports')}
        />
      </Section>

      <Section title="Advanced">
        <Row
          icon="/heart.svg"
          title="Database"
          subtitle="MongoDB-backed records and operational data"
          onClick={() => setPanel('db')}
        />
        <Row
          icon="/taggray.svg"
          title="Localization"
          subtitle="English UI · extend with i18n"
          onClick={() => setPanel('locale')}
        />
      </Section>

      <div className="px-3 pt-10">
        <button
          type="button"
          onClick={() => {
            clearAdminSession()
            navigate('/app/profile', { replace: true })
          }}
          className="w-full rounded-xl border border-[#DA0909] text-[#DA0909] py-3 text-sm font-semibold bg-transparent cursor-pointer"
        >
          End admin session
        </button>
      </div>

      <Modal isOpen={panel === 'referrals'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-2">Referral Competition</p>
        <p className="text-xs text-[#666F8B] pb-4 leading-relaxed">
          Weekly leaderboard based on "legit" referrals (invited users who minted at least 1 NFT). Nominate the top 3
          winners for the current week: <span className="font-bold">{leaderboardData?.weekId}</span>.
        </p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <Section title="Top Inviters (This Week)">
            <ul className="space-y-2 mt-2">
              {(leaderboardData?.leaderboard || []).map((item, idx) => {
                const existingNomination = currentNominations.find((n) => n.user?.id === item.userId)
                return (
                  <li
                    key={item.userId}
                    className="flex items-center justify-between gap-3 p-2 border border-[#666F8B22] rounded-xl bg-[#F9FAFB]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={item.img} className="w-8 h-8 rounded-full bg-gray-200" alt="" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate text-[#0E0636]">{item.name}</p>
                        <p className="text-[10px] text-[#666F8B] truncate">{item.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#6B6AFD]">{item.count}</p>
                        <p className="text-[9px] text-[#666F8B]">referrals</p>
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3].map((rank) => {
                          const isNominated = existingNomination?.rank === rank
                          return (
                            <button
                              key={rank}
                              type="button"
                              onClick={() => nominateMut.mutate({ userId: item.userId, rank })}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                                isNominated
                                  ? 'bg-[#6B6AFD] text-white border-[#6B6AFD]'
                                  : 'border-[#666F8B33] text-[#666F8B] hover:bg-[#6B6AFD1A]'
                              }`}
                            >
                              {rank}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </li>
                )
              })}
              {leaderboardData?.leaderboard.length === 0 && (
                <p className="text-xs text-[#666F8B] text-center py-4">No legit referrals recorded this week yet.</p>
              )}
            </ul>
          </Section>

          <Section title="Current Weekly Winners">
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[1, 2, 3].map((rank) => {
                const nomination = currentNominations.find((n) => n.rank === rank)
                return (
                  <div
                    key={rank}
                    className="flex flex-col items-center p-2 border border-[#666F8B22] rounded-xl bg-white relative"
                  >
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">
                      #{rank}
                    </div>
                    <img
                      src={nomination?.user?.img || '/white-man.jpg'}
                      className={`w-10 h-10 rounded-full bg-gray-100 mb-1 ${!nomination ? 'opacity-30 grayscale' : ''}`}
                      alt=""
                    />
                    <p className="text-[10px] font-semibold text-[#0E0636] truncate w-full text-center">
                      {nomination?.user?.name || 'Vacant'}
                    </p>
                  </div>
                )
              })}
            </div>
          </Section>
        </div>

        <button
          type="button"
          className="w-full mt-6 rounded-lg bg-[#6B6AFD] text-white py-2.5 text-sm font-semibold"
          onClick={() => setPanel(null)}
        >
          Done
        </button>
      </Modal>

      <Modal isOpen={panel === 'fees'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-2">Platform fee %</p>
        <p className="text-xs text-[#666F8B] pb-3 leading-relaxed">
          Applies to on-chain TON checkout and to in-app Stars checkout. Stars fees accrue to the platform balance below
          (not sent on-chain).
        </p>
        <p className="text-xs font-medium text-[#0E0636] pb-3">
          Stars fees accrued: {(settings?.platformStarsAccrued ?? 0).toLocaleString()} ★
        </p>
        <input
          type="number"
          step="0.1"
          min="0"
          max="50"
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none"
          value={feeInput}
          onChange={(e) => setFeeInput(e.target.value)}
        />
        <label className="block text-xs text-[#666F8B] mt-3 mb-1">Fee receiver wallet address</label>
        <input
          type="text"
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none"
          value={feeReceiverInput}
          onChange={(e) => setFeeReceiverInput(e.target.value)}
          placeholder="EQ... (TON) or 0x... (EVM)"
        />
        <label className="block text-xs text-[#666F8B] mt-3 mb-1">Global NFT Collection address</label>
        <input
          type="text"
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none"
          value={collectionAddrInput}
          onChange={(e) => setCollectionAddrInput(e.target.value)}
          placeholder="EQ... or UQ..."
        />
        <button
          type="button"
          className="w-full mt-4 rounded-lg bg-[#6B6AFD] text-white py-2.5 text-sm font-semibold"
          onClick={() => {
            const n = parseFloat(feeInput)
            if (!Number.isFinite(n)) return
            patchMut.mutate({
              platformFeePercent: n,
              feeReceiverWalletAddress: feeReceiverInput.trim(),
              collectionAddress: collectionAddrInput.trim(),
            })
            setPanel(null)
          }}
        >
          Save
        </button>
      </Modal>

      <Modal isOpen={panel === 'chains'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-4">Supported chains</p>
        <label className="flex items-center gap-2 text-sm text-[#0E0636]">
          <input
            type="checkbox"
            checked={settings?.tonEnabled ?? true}
            onChange={(e) => patchMut.mutate({ tonEnabled: e.target.checked })}
          />
          TON mainnet integrations
        </label>
        <p className="text-xs text-[#666F8B] mt-4">EVM chains follow the wallet connector config in the main app.</p>
      </Modal>

      <Modal isOpen={panel === 'upload'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-2">Max upload (MB)</p>
        <input
          type="number"
          min="1"
          max="2048"
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none"
          value={uploadInput}
          onChange={(e) => setUploadInput(e.target.value)}
        />
        <button
          type="button"
          className="w-full mt-4 rounded-lg bg-[#6B6AFD] text-white py-2.5 text-sm font-semibold"
          onClick={() => {
            const n = parseInt(uploadInput, 10)
            if (!Number.isFinite(n)) return
            patchMut.mutate({ maxUploadMb: n })
            setPanel(null)
          }}
        >
          Save
        </button>
      </Modal>

      <Modal isOpen={panel === 'security'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-2">Security & sessions</p>
        <label className="flex items-center gap-2 text-sm text-[#0E0636] pb-6">
          <input
            type="checkbox"
            checked={settings?.maintenanceMode ?? false}
            onChange={(e) => patchMut.mutate({ maintenanceMode: e.target.checked })}
          />
          Maintenance mode banner
        </label>
        <p className="text-xs text-[#666F8B] leading-relaxed">
          Production: validate Telegram{' '}
          <code className="text-[10px]">init_data</code> on your backend and issue short-lived cookies. Never rely on
          client-only checks for privileged actions.
        </p>
      </Modal>

      <Modal isOpen={panel === 'admins'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-4">Administrators</p>
        <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
          {allAdmins.map((s) => (
            <li key={s.id} className="text-sm text-[#0E0636] flex justify-between items-center gap-2 border-b border-[#666F8B22] pb-2">
              <span className="min-w-0">
                {s.name}{' '}
                {s.isOwner && (
                  <span className="text-[10px] font-semibold text-[#6B6AFD] bg-[#6B6AFD1A] px-1 rounded">Owner</span>
                )}{' '}
                <span className="text-[#666F8B] block truncate">{s.username}</span>
                {s.telegramId ? (
                  <span className="text-[10px] text-[#666F8B]">ID {s.telegramId}</span>
                ) : null}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs ${s.online ? 'text-green-600' : 'text-[#666F8B]'}`}>
                  {s.online ? 'Online' : 'Offline'}
                </span>
                <button
                  type="button"
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate(s.id)}
                  className="text-[11px] text-[#DA0909] border border-[#DA0909] rounded px-2 py-0.5 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
          {allAdmins.length === 0 && (
            <li className="text-xs text-[#666F8B]">No valid admin records found.</li>
          )}
        </ul>
        {invalidStaff.length > 0 && (
          <div className="mt-3 border border-[#DA090933] bg-[#DA09090D] rounded-lg p-2">
            <p className="text-[11px] text-[#DA0909] mb-2">
              Ignored {invalidStaff.length} invalid admin record(s): username must be a valid Telegram handle.
            </p>
            <div className="space-y-1">
              {invalidStaff.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#666F8B] truncate">
                    {s.name} ({s.username || 'no username'})
                  </p>
                  <button
                    type="button"
                    disabled={removeMut.isPending}
                    onClick={() => removeMut.mutate(s.id)}
                    className="text-[11px] text-[#DA0909] border border-[#DA0909] rounded px-2 py-0.5 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={panel === 'reports' || panel === 'db' || panel === 'locale'} onClose={() => setPanel(null)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-2">
          {panel === 'reports' && 'Reports queue'}
          {panel === 'db' && 'Database'}
          {panel === 'locale' && 'Localization'}
        </p>
        <p className="text-sm text-[#666F8B] leading-relaxed">
          Connected to live API-backed records. Extend report schemas/endpoints as needed.
        </p>
      </Modal>

      <Modal position="center" isOpen={adminModal} onClose={() => setAdminModal(false)}>
        <div className="flex flex-col items-center">
          <div className="w-17 h-17 flex justify-center items-center rounded-full bg-[#6B6AFD]">
            <img className="w-9.5 h-9.5" src="/user-add.svg" alt="" />
          </div>

          <p className="pt-6 pb-2 font-semibold text-[#0E0636] text-xl">Add New Admin</p>
          <p className="text-[#6B6AFD] font-medium">
            Step {step} <span className="text-[#666F8B] font-normal">of 3</span>
          </p>

          {step === 1 && (
            <form
              className="w-[278px]"
              onSubmit={(e) => {
                e.preventDefault()
                const candidate = normalizeUsername(newAdmin.username)
                const tgId = parseInt(String(newAdmin.telegramId || '').trim(), 10)
                const hasTg = Number.isFinite(tgId) && tgId > 0
                if (!newAdmin.name || !newAdmin.email) return
                if (!candidate && !hasTg) {
                  setAdminFormError('Enter @username or Telegram numeric ID')
                  return
                }
                if (candidate && !isLikelyTelegramUsername(candidate)) {
                  setAdminFormError('Enter a valid Telegram username, e.g. @alexboss35')
                  return
                }
                setAdminFormError('')
                setNewAdmin((prev) => ({
                  ...prev,
                  username: candidate || (hasTg ? `@user${tgId}` : ''),
                  telegramId: hasTg ? String(tgId) : prev.telegramId,
                }))
                setStep(2)
              }}
            >
              <label className="block pb-1.5 font-medium text-sm text-[#344054]">Name</label>
              <input
                required
                className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg placeholder:text-sm placeholder:text-[#808CA5] outline-none"
                value={newAdmin.name}
                onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                placeholder="Enter full name"
              />
              <label className="block mt-4 pb-1.5 font-medium text-sm text-[#344054]">Email</label>
              <input
                required
                type="email"
                className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg placeholder:text-sm placeholder:text-[#808CA5] outline-none"
                value={newAdmin.email}
                onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                placeholder="Enter email address"
              />
              <label className="block mt-4 pb-1.5 font-medium text-sm text-[#344054]">Telegram @username</label>
              <input
                className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg placeholder:text-sm placeholder:text-[#808CA5] outline-none"
                value={newAdmin.username}
                onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })}
                placeholder="@alexboss35"
              />
              <label className="block mt-4 pb-1.5 font-medium text-sm text-[#344054]">
                Telegram ID <span className="text-[#808CA5] font-normal">(optional)</span>
              </label>
              <input
                inputMode="numeric"
                className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg placeholder:text-sm placeholder:text-[#808CA5] outline-none"
                value={newAdmin.telegramId}
                onChange={(e) => setNewAdmin({ ...newAdmin, telegramId: e.target.value })}
                placeholder="7435118437"
              />
              {!!adminFormError && <p className="text-xs text-[#DA0909] mt-2">{adminFormError}</p>}
              <button type="submit" className="w-full mt-6 rounded-lg text-sm font-semibold py-2.5 bg-[#6B6AFD] text-white">
                Continue
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="w-[278px]">
              <p className="text-sm text-[#666F8B] pb-4">Assign access scopes (stored with this admin record).</p>
              <label className="flex items-center gap-2 text-sm text-[#0E0636] pb-2">
                <input
                  type="checkbox"
                  checked={newAdmin.roleModeration}
                  onChange={(e) => setNewAdmin({ ...newAdmin, roleModeration: e.target.checked })}
                />
                Moderation & users
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0E0636] pb-2">
                <input
                  type="checkbox"
                  checked={newAdmin.roleFinance}
                  onChange={(e) => setNewAdmin({ ...newAdmin, roleFinance: e.target.checked })}
                />
                Finance & fees
              </label>
              <label className="flex items-center gap-2 text-sm text-[#0E0636] pb-6">
                <input
                  type="checkbox"
                  checked={newAdmin.roleOwner}
                  onChange={(e) => setNewAdmin({ ...newAdmin, roleOwner: e.target.checked })}
                />
                Full owner (can add/remove admins)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[#666F8B33] py-2 text-sm"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-[#6B6AFD] text-white py-2 text-sm font-semibold"
                  onClick={() => setStep(3)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="w-[278px] text-center">
              <p className="text-sm text-[#0E0636] pb-2">
                {newAdmin.name} · {newAdmin.email}
              </p>
              <p className="text-xs text-[#666F8B] pb-6">
                Roles:{' '}
                {[
                  newAdmin.roleOwner && 'Owner',
                  newAdmin.roleModeration && 'Moderation',
                  newAdmin.roleFinance && 'Finance',
                ]
                  .filter(Boolean)
                  .join(', ') || 'Support'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[#666F8B33] py-2 text-sm"
                  onClick={() => setStep(2)}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={addMut.isPending}
                  className="flex-1 rounded-lg bg-black text-white py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() => {
                    const roles = [
                      newAdmin.roleOwner ? 'owner' : '',
                      newAdmin.roleModeration ? 'moderation' : '',
                      newAdmin.roleFinance ? 'finance' : '',
                    ].filter(Boolean)
                    const tgParsed = parseInt(String(newAdmin.telegramId || '').trim(), 10)
                    addMut.mutate({
                      name: newAdmin.name,
                      email: newAdmin.email,
                      username: newAdmin.username,
                      telegramId: Number.isFinite(tgParsed) && tgParsed > 0 ? tgParsed : undefined,
                      roles: roles.length ? roles : ['support'],
                    })
                  }}
                >
                  Invite admin
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex justify-center gap-1 my-6">
              <div className="w-2 h-2 rounded-full bg-[#6B6AFD] border border-[#666F8B33]" />
              <div className="w-2 h-2 rounded-full bg-[#F5F7FB] border border-[#666F8B33]" />
              <div className="w-2 h-2 rounded-full bg-[#F5F7FB] border border-[#666F8B33]" />
            </div>
          )}
          {step === 2 && (
            <div className="flex justify-center gap-1 my-6">
              <div className="w-2 h-2 rounded-full bg-[#F5F7FB] border border-[#666F8B33]" />
              <div className="w-2 h-2 rounded-full bg-[#6B6AFD] border border-[#666F8B33]" />
              <div className="w-2 h-2 rounded-full bg-[#F5F7FB] border border-[#666F8B33]" />
            </div>
          )}
          {step === 3 && (
            <div className="flex justify-center gap-1 my-6">
              <div className="w-2 h-2 rounded-full bg-[#F5F7FB] border border-[#666F8B33]" />
              <div className="w-2 h-2 rounded-full bg-[#F5F7FB] border border-[#666F8B33]" />
              <div className="w-2 h-2 rounded-full bg-[#6B6AFD] border border-[#666F8B33]" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 pt-15">
      <p className="font-semibold text-xl text-[#0E0636]">{title}</p>
      <div className="mt-6 space-y-3">{children}</div>
    </div>
  )
}

function Row({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full gap-2.5 flex items-center border border-[#666F8B33] rounded-2xl py-3 px-[13px] bg-transparent cursor-pointer text-left"
    >
      <div className="w-9.5 h-9.5 border border-[#666F8B33] flex items-center justify-center rounded-lg">
        <img className="w-5 h-5 rounded-lg" src={icon} alt="" />
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-[#666F8B]">{title}</p>
        <p className="text-[10px] text-[#666F8B] pt-0.5">{subtitle}</p>
      </div>
      <img className="w-4 h-4" src="/arrow-right.svg" alt="" />
    </button>
  )
}
