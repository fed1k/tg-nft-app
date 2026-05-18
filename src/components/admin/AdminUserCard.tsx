import type { UserStatus } from '../../services/admin/types'

const colorFor = (status: UserStatus) => {
  switch (status) {
    case 'Active':
      return 'text-[#6B6AFD]'
    case 'Flagged':
      return 'text-[#FF8E00]'
    case 'Suspended':
      return 'text-[#DA0909]'
    case 'Banned':
      return 'text-[#666F8B]'
    default:
      return 'text-[#666F8B]'
  }
}

interface AdminUserCardProps {
  img?: string
  name: string
  wallet: number
  balance: string
  stars: number
  joinDate: string
  status: UserStatus
  onOpenMenu?: () => void
}

export default function AdminUserCard({
  img = '/white-man.jpg',
  name,
  wallet,
  balance,
  stars,
  joinDate,
  status,
  onOpenMenu,
}: AdminUserCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenMenu}
      className="w-full text-left bg-[#F5F7FB] p-1.5 rounded-xl flex justify-between items-center border-0 cursor-pointer hover:opacity-95"
    >
      <div className="flex gap-2 items-center">
        <div className="w-12 h-12 rounded-lg border border-white flex items-center justify-center overflow-hidden">
          <img className="w-full h-full rounded-lg object-cover" src={img} alt="" />
        </div>
        <div>
          <p className="font-medium text-xs pb-1.5 text-[#0E0636]">{name}</p>
          <div className="text-[10px] gap-0.5 flex items-center font-light text-[#0E0636]">
            <img className="w-2.5 h-2.5" src="/wallet-gray-outline.svg" alt="" />
            <p>{wallet}</p>
            <div className="w-1 mx-0.5 h-1 bg-[#666F8BCC] rounded-full" />
            <p>{balance}</p>
            <div className="w-1 mx-0.5 h-1 bg-[#666F8BCC] rounded-full" />
            <p>{stars}</p>
            <img className="-translate-y-px" src="/star-gray-outline.svg" alt="" />
          </div>
        </div>
      </div>

      <div className="pr-[5px]">
        <p className="text-[8px] text-[#0E0636] font-light">Joined {joinDate}</p>
        <p className={`text-end text-[10px] pt-2 font-medium ${colorFor(status)}`}>{status}</p>
      </div>
    </button>
  )
}
