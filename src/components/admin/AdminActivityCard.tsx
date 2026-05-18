import { displayHandle } from '../../utils/displayHandle'

interface AdminActivityCardProps {
  icon?: string
  name?: string
  from?: string
  to?: string
  time?: string
  amount?: string
  status?: string
}

export default function AdminActivityCard({
  icon = '/box.svg',
  name = 'Sale',
  from = 'seller',
  to = 'buyer',
  time = '2 min',
  amount = '0.08 TON',
  status = 'Gas: 0.001 ton ($2.60)',
}: AdminActivityCardProps) {
  return (
    <div className="bg-[#F5F7FB] p-1.5 rounded-xl flex justify-between items-center">
      <div className="flex gap-2 items-center">
        <div className="w-9.5 h-9.5 rounded-lg bg-[#F5F7FB] flex items-center justify-center">
          <img className="w-4.5 h-4.5" src={icon} alt="" />
        </div>
        <div>
          <p className="font-medium text-xs text-[#0E0636]">{name}</p>
          <div className="text-[10px] flex items-center font-light text-[#0E0636] gap-0.5 flex-wrap">
            <p>{displayHandle(from)}</p>
            <img src="/arrow-right-full.svg" alt="" className="w-3 h-3" />
            <p>{displayHandle(to)}</p>
            <p>- {time} ago</p>
          </div>
        </div>
      </div>

      <div className="pr-[5px] text-right min-w-0">
        <p className="text-[10px] text-[#FF0004] font-medium truncate">{amount}</p>
        <p className="text-end text-[8px] text-[#FF0004]">{status}</p>
      </div>
    </div>
  )
}
