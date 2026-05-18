import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { adminClient } from '../../services/admin'
import { adminQk } from './queryKeys'
import { useTelegram } from '../../contexts/TelegramContext'

export default function AdminView() {
  const navigate = useNavigate()
  const { user } = useTelegram()
  const displayName = user?.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : 'Admin'

  const { data: dash } = useQuery({
    queryKey: adminQk.dashboard(),
    queryFn: () => adminClient.getDashboard(),
  })
  const { data: alerts = [] } = useQuery({
    queryKey: adminQk.alerts(),
    queryFn: () => adminClient.getAlerts(),
  })

  const d = dash ?? {
    totalUsers: 0,
    usersDelta24h: '—',
    totalVolumeUsd: '$0',
    volumeSubtitle: '—',
    revenueUsd: '$0',
    revenueSubtitle: '—',
    activeListings: 0,
    pendingListings: 0,
  }

  return (
    <div className="pb-30">
      <p className="text-xs ml-3 lg:text-sm pb-2 border-b-2 inline text-[#0E0636] border-[#0E06361A]">
        Welcome back, {displayName} 👋
      </p>

      <div className="grid grid-cols-2 gap-4 pt-[27px]">
        <div className="py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]">
          <p className="text-sm">Total User’s</p>
          <p className="font-semibold text-2xl pt-2">{d.totalUsers.toLocaleString()}</p>
          <div className="flex pt-2 items-center justify-between">
            <p className="font-light text-[10px] text-[#0E0636]">{d.usersDelta24h}</p>
            <img className="w-4 h-4" alt="" src="/profile-2user-blue.svg" />
          </div>
        </div>
        <div className="py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]">
          <p className="text-sm">Total Volume</p>
          <p className="font-semibold text-2xl pt-2">{d.totalVolumeUsd}</p>
          <div className="flex pt-2 items-center justify-between">
            <p className="font-light text-[10px] text-[#0E0636]">{d.volumeSubtitle}</p>
            <img className="w-4 h-4" alt="" src="/chart.svg" />
          </div>
        </div>
        <div className="py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]">
          <p className="text-sm">Revenue</p>
          <p className="font-semibold text-2xl pt-2">{d.revenueUsd}</p>
          <div className="flex pt-2 items-center justify-between">
            <p className="font-light text-[10px] text-[#0E0636]">{d.revenueSubtitle}</p>
            <img className="w-4 h-4" alt="" src="/status-up.svg" />
          </div>
        </div>
        <div className="py-5 shrink-0 w-[174px] px-4 rounded-[20px] bg-[#F5F7FB]">
          <p className="text-sm">Active Listing’s</p>
          <p className="font-semibold text-2xl pt-2">{d.activeListings.toLocaleString()}</p>
          <div className="flex pt-2 items-center justify-between">
            <p className="font-light text-[10px] text-[#0E0636]">{d.pendingListings} Pending</p>
            <img className="w-4 h-4" alt="" src="/gallery-blue.svg" />
          </div>
        </div>
      </div>

      <div className="pt-12 px-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-xl text-[#0E0636]">Volume Trend</p>
          <p className="text-sm text-[#666F8B]">24h</p>
        </div>
        <p className="text-xs text-[#666F8B] mt-2">Aggregated from live activity data in your admin database.</p>
      </div>

      <div className="pt-12 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-xl text-[#0E0636]">Alerts</p>
            <p className="p-1 bg-[#F5F7FB] rounded-sm text-sm font-semibold text-[#6B6AFD]">{alerts.length}</p>
          </div>
          <button
            type="button"
            className="font-medium text-sm text-[#6B6AFD] bg-transparent border-0 cursor-pointer"
            onClick={() => navigate('/admin/activity')}
          >
            View All
          </button>
        </div>

        {alerts.map((a) => (
          <div key={a.id} className="bg-[#6B6AFD0D] mt-6 p-2 rounded-xl flex justify-between items-center gap-2">
            <div className="flex gap-2 items-center min-w-0">
              <div className="w-12 h-12 rounded-lg bg-[#6B6AFD0D] border border-white flex items-center justify-center shrink-0">
                <img className="w-6 h-6" src={a.icon} alt="" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-xs text-[#0E0636]">{a.title}</p>
                <p className="text-[10px] pt-1 font-light text-[#0E0636]">{a.subtitle}</p>
              </div>
            </div>
            <div className="pr-[5px] shrink-0">
              <p className="text-[10px] text-white bg-[#6B6AFD] px-1.5 py-0.5 rounded-sm">{a.timeBadge}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="font-semibold pl-3 text-xl pt-12 pb-6 text-[#0E0636]">Quick Action&apos;s</p>

      <div className="flex gap-3.5 px-3">
        <button
          type="button"
          onClick={() => navigate('/admin/control')}
          className="bg-[#6B6AFD0D] w-[106px] rounded-[20px] flex flex-col items-center py-[29px] border-0 cursor-pointer"
        >
          <img src="/add-circle.svg" alt="" />
          <p className="text-xs pt-[9px] text-center font-medium text-[#6B6AFD]">Adjust Commision</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/assets')}
          className="bg-[#6B6AFD0D] w-[106px] rounded-[20px] flex flex-col items-center py-[29px] border-0 cursor-pointer"
        >
          <img src="/nft.svg" alt="" />
          <p className="text-xs pt-[9px] text-center font-medium text-[#6B6AFD]">
            Review <br /> Assets
          </p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/users', { state: { chip: 'Flagged' } })}
          className="bg-[#6B6AFD0D] w-[106px] rounded-[20px] flex flex-col items-center py-[29px] border-0 cursor-pointer"
        >
          <img src="/search-normal.svg" alt="" />
          <p className="text-xs pt-[9px] font-medium text-center text-[#6B6AFD]">
            View <br /> Flagged
          </p>
        </button>
      </div>
    </div>
  )
}
