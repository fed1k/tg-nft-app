import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import Modal from '../../components/Modal'
import AdminUserCard from '../../components/admin/AdminUserCard'
import type { UserStatus } from '../../services/admin/types'
import { adminClient } from '../../services/admin'
import { adminQk } from './queryKeys'

const STATUS_CHIPS = [`All User's`, 'Active', 'Flagged', 'Suspended', 'Banned'] as const

export default function AdminUsers() {
  const qc = useQueryClient()
  const location = useLocation()
  const stateChip =
    typeof (location.state as { chip?: string } | undefined)?.chip === 'string'
      ? (location.state as { chip: string }).chip
      : null

  const [search, setSearch] = useState('')
  const [chip, setChip] = useState<string>(STATUS_CHIPS[0])
  const [addOpen, setAddOpen] = useState(false)
  const [menuUserId, setMenuUserId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ name: '', email: '', username: '', wallet: '' })

  useEffect(() => {
    if (stateChip && STATUS_CHIPS.includes(stateChip as (typeof STATUS_CHIPS)[number])) {
      setChip(stateChip as (typeof STATUS_CHIPS)[number])
    }
  }, [stateChip])

  useEffect(() => {
    if (addOpen) setAddForm({ name: '', email: '', username: '', wallet: '' })
  }, [addOpen])

  const refreshUsers = () => {
    void qc.invalidateQueries({ queryKey: adminQk.root })
  }

  const { data: users = [] } = useQuery({
    queryKey: adminQk.users(search, chip),
    queryFn: () => adminClient.listUsers(search, chip),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      adminClient.updateUserStatus(id, status),
    onSuccess: refreshUsers,
  })

  const createMut = useMutation({
    mutationFn: adminClient.createUser,
    onSuccess: () => {
      refreshUsers()
      setAddOpen(false)
    },
  })

  const selected = users.find((u) => u.id === menuUserId)

  return (
    <div className="overflow-hidden pb-30">
      <div className="rounded-full items-center gap-2 border border-[#666F8B33] pl-3 flex">
        <img className="w-9 h-5" src="/seach-icon.svg" alt="" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 py-3 outline-none placeholder:text-sm placeholder:text-[#666F8B99] placeholder:font-medium"
          type="search"
          placeholder="Search user’s by name, id or wallet.."
        />
      </div>

      <div className="pl-3 ml-3 flex gap-2 pt-8 pb-1 overflow-x-auto">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={`font-medium shrink-0 text-xs rounded-full py-1.5 px-3 border-0 cursor-pointer ${
              chip === c ? 'bg-[#0E0636] text-white' : 'bg-[#F5F7FB] text-[#666F8B]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-12 mx-3">
        <p className="text-sm pb-6 font-medium text-[#0E0636]">
          Showing {users.length} of {users.length} users
        </p>
        <div className="space-y-3">
          {users.map((u) => (
            <AdminUserCard
              key={u.id}
              name={u.name}
              wallet={u.walletCount}
              balance={u.balanceLabel}
              stars={u.stars}
              joinDate={u.joinDate}
              status={u.status}
              img={u.img}
              onOpenMenu={() => setMenuUserId(u.id)}
            />
          ))}
          {users.length === 0 && (
            <p className="text-sm text-[#666F8B] text-center py-8">No users match this filter.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="border border-[#6B6AFD] flex gap-2 justify-center items-center text-sm text-[#6B6AFD] ml-3 w-[345px] max-w-[calc(100%-24px)] mt-8 rounded-lg h-12 cursor-pointer bg-transparent"
      >
        <img src="/add.svg" alt="" /> Add New User
      </button>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)}>
        <div>
          <p className="font-semibold text-[#0E0636] text-lg pb-4">Create user record</p>
          <label className="block text-xs text-[#666F8B] mb-1">Name</label>
          <input
            className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3"
            value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            placeholder="Full name"
          />
          <label className="block text-xs text-[#666F8B] mb-1">Email</label>
          <input
            className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3"
            value={addForm.email}
            onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            placeholder="Email"
          />
          <label className="block text-xs text-[#666F8B] mb-1">Username</label>
          <input
            className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3"
            value={addForm.username}
            onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
            placeholder="@handle"
          />
          <label className="block text-xs text-[#666F8B] mb-1">Wallet address (optional)</label>
          <input
            className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-4"
            value={addForm.wallet}
            onChange={(e) => setAddForm({ ...addForm, wallet: e.target.value })}
            placeholder="TON / EVM address"
          />
          <button
            type="button"
            disabled={!addForm.name.trim() || createMut.isPending}
            onClick={() =>
              createMut.mutate({
                name: addForm.name,
                email: addForm.email || undefined,
                username: addForm.username || undefined,
                walletAddress: addForm.wallet || undefined,
              })
            }
            className="w-full rounded-lg bg-[#6B6AFD] text-white py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setMenuUserId(null)}>
        {selected && (
          <div>
            <p className="font-semibold text-[#0E0636] text-lg pb-1">{selected.name}</p>
            <p className="text-xs text-[#666F8B] pb-4">{selected.id}</p>
            <p className="text-sm text-[#0E0636] mb-2">Account status</p>
            <div className="flex flex-wrap gap-2">
              {(['Active', 'Flagged', 'Suspended', 'Banned'] as UserStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={updateMut.isPending}
                  onClick={() => {
                    updateMut.mutate({ id: selected.id, status: s }, { onSuccess: () => setMenuUserId(null) })
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    selected.status === s
                      ? 'bg-[#0E0636] text-white border-[#0E0636]'
                      : 'border-[#666F8B33] text-[#666F8B]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
