import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import NftCard from '../../components/NftCard'
import Modal from '../../components/Modal'
import type { AssetStatus } from '../../services/admin/types'
import { adminClient } from '../../services/admin'
import { adminQk } from './queryKeys'

const CHIPS = [`All Asset's`, 'Active', 'Pending', 'Removed', 'Flagged'] as const

export default function AdminAssets() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [chip, setChip] = useState<(typeof CHIPS)[number]>('All Asset\'s')
  const [addOpen, setAddOpen] = useState(false)
  const [manageId, setManageId] = useState<string | null>(null)

  const refresh = () => void qc.invalidateQueries({ queryKey: adminQk.root })

  const { data: assets = [] } = useQuery({
    queryKey: adminQk.assets(search, chip),
    queryFn: () => adminClient.listAssets(search, chip),
    retry: 1,
  })

  const [addForm, setAddForm] = useState({
    title: '',
    username: '',
    price: '',
    image: '',
    category: 'Collectibles',
    marketTab: 'Explore' as 'Explore' | 'StarGifts',
  })

  useEffect(() => {
    if (addOpen) {
      setAddForm({
        title: '',
        username: '',
        price: '',
        image: '',
        category: 'Collectibles',
        marketTab: 'Explore',
      })
    }
  }, [addOpen])

  const createMut = useMutation({
    mutationFn: adminClient.createAsset,
    onSuccess: () => {
      refresh()
      setAddOpen(false)
      window.alert('Asset created successfully.')
    },
    onError: (err: any) => {
      window.alert(err?.message || 'Failed to create asset')
    },
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AssetStatus }) =>
      adminClient.updateAssetStatus(id, status),
    onSuccess: refresh,
  })

  const selected = assets.find((a) => a.id === manageId)

  return (
    <div className="pb-30 overflow-hidden">
      <div className="rounded-full items-center gap-2 border border-[#666F8B33] pl-3 flex">
        <img className="w-9 h-5" src="/seach-icon.svg" alt="" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 py-3 outline-none placeholder:text-sm placeholder:text-[#666F8B99] placeholder:font-medium"
          type="search"
          placeholder="Search assets..."
        />
      </div>

      <div className="pl-3 ml-3 flex gap-2 pt-8 pb-1 overflow-x-auto">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={`font-medium shrink-0 text-xs py-1.5 px-3 rounded-full border-0 cursor-pointer ${
              chip === c ? 'bg-[#0E0636] text-white' : 'bg-[#F5F7FB] text-[#666F8B]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-12 mx-3">
        <p className="text-sm pb-6 font-medium text-[#0E0636]">
          Showing {assets.length} of {assets.length} assets
        </p>

        <div className="grid gap-x-3.5 gap-y-6 grid-cols-2">
          {assets.map((a) => (
            <NftCard
              key={a.id}
              id={a.id}
              nft={a.nft}
              title={a.title}
              username={a.username}
              price={a.price}
              adminMode
              assetStatus={a.status}
              onAdminManage={() => setManageId(a.id)}
            />
          ))}
        </div>
        {assets.length === 0 && (
          <p className="text-sm text-[#666F8B] text-center py-8">No assets match this filter.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="border border-[#6B6AFD] flex gap-2 justify-center items-center text-sm text-[#6B6AFD] ml-3 w-[345px] max-w-[calc(100%-24px)] mt-8 rounded-lg h-12 cursor-pointer bg-transparent"
      >
        <img src="/add.svg" alt="" /> Add New Assets
      </button>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)}>
        <p className="font-semibold text-[#0E0636] text-lg pb-4">Register asset</p>
        <label className="block text-xs text-[#666F8B] mb-1">Title</label>
        <input
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3"
          value={addForm.title}
          onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
        />
        <label className="block text-xs text-[#666F8B] mb-1">Owner @username</label>
        <input
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3"
          value={addForm.username}
          onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
        />
        <label className="block text-xs text-[#666F8B] mb-1">Floor / list price</label>
        <input
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3"
          value={addForm.price}
          onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
          placeholder="0.08 TON"
        />
        <label className="block text-xs text-[#666F8B] mb-1">Image URL (optional)</label>
        <input
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-4"
          value={addForm.image}
          onChange={(e) => setAddForm({ ...addForm, image: e.target.value })}
          placeholder="/crystal-cube.jpg"
        />
        <label className="block text-xs text-[#666F8B] mb-1">Category</label>
        <select
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-3 bg-white"
          value={addForm.category}
          onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
        >
          <option value="3D Art">3D Art</option>
          <option value="Collectibles">Collectibles</option>
          <option value="Gaming">Gaming</option>
        </select>
        <label className="block text-xs text-[#666F8B] mb-1">Market section</label>
        <select
          className="border w-full border-[#666F8B33] py-2 px-3 rounded-lg outline-none text-sm mb-4 bg-white"
          value={addForm.marketTab}
          onChange={(e) =>
            setAddForm({ ...addForm, marketTab: e.target.value as 'Explore' | 'StarGifts' })
          }
        >
          <option value="Explore">Explore</option>
          <option value="StarGifts">StarGifts</option>
        </select>
        <button
          type="button"
          disabled={!addForm.title.trim() || !addForm.username.trim() || createMut.isPending}
          onClick={() =>
            createMut.mutate({
              title: addForm.title,
              username: addForm.username,
              price: addForm.price || '0 TON',
              image: addForm.image || undefined,
              category: addForm.category,
              marketTab: addForm.marketTab,
            })
          }
          className="w-full rounded-lg bg-[#6B6AFD] text-white py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {createMut.isPending ? 'Saving...' : 'Save'}
        </button>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setManageId(null)}>
        {selected && (
          <div>
            <p className="font-semibold text-[#0E0636]">{selected.title}</p>
            <p className="text-xs text-[#666F8B] pb-4">{selected.id}</p>
            <p className="text-sm mb-2">Listing status</p>
            <div className="flex flex-wrap gap-2">
              {(['Active', 'Pending', 'Removed', 'Flagged'] as AssetStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={statusMut.isPending}
                  onClick={() => {
                    statusMut.mutate(
                      { id: selected.id, status: s },
                      { onSuccess: () => setManageId(null) },
                    )
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
