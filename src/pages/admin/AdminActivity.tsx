import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AdminActivityCard from '../../components/admin/AdminActivityCard'
import type { ActivityType } from '../../services/admin/types'
import { adminClient } from '../../services/admin'
import { adminQk } from './queryKeys'

const TYPE_CHIPS = ['All', 'Mint', 'Swap', 'Gift', 'Deposit', 'Withdraw'] as const

export default function AdminActivity() {
  const [search, setSearch] = useState('')
  const [chip, setChip] = useState<(typeof TYPE_CHIPS)[number]>('All')

  const { data: txs = [] } = useQuery({
    queryKey: adminQk.activity(search, chip),
    queryFn: () =>
      adminClient.listTransactions(search, chip === 'All' ? null : (chip as ActivityType)),
  })

  return (
    <div className="overflow-hidden pb-30">
      <div className="rounded-full items-center gap-2 border border-[#666F8B33] pl-3 flex">
        <img className="w-9 h-5" src="/seach-icon.svg" alt="" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 py-3 outline-none placeholder:text-sm placeholder:text-[#666F8B99] placeholder:font-medium"
          type="search"
          placeholder="Search transactions..."
        />
      </div>

      <div className="pl-3 ml-3 flex gap-2 pt-8 pb-1 overflow-x-auto">
        {TYPE_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={`font-medium shrink-0 text-xs py-1.5 px-3 rounded-full border-0 cursor-pointer whitespace-nowrap ${
              chip === c ? 'bg-[#0E0636] text-white' : 'bg-[#F5F7FB] text-[#666F8B]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-12 mx-3">
        <p className="text-sm pb-6 font-medium text-[#0E0636]">
          Showing {txs.length} of {txs.length} transactions
        </p>

        <div className="space-y-3">
          {txs.map((t) => (
            <AdminActivityCard
              key={t.id}
              icon={t.icon}
              name={t.name}
              from={t.fromUser}
              to={t.toUser}
              time={t.timeLabel}
              amount={t.amount}
              status={t.feeLabel}
            />
          ))}
          {txs.length === 0 && (
            <p className="text-sm text-[#666F8B] text-center py-8">No activity matches this filter.</p>
          )}
        </div>
      </div>
    </div>
  )
}
