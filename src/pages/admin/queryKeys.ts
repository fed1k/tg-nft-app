export const adminQk = {
  root: ['admin'] as const,
  dashboard: () => [...adminQk.root, 'dashboard'] as const,
  users: (search: string, chip: string | null) => [...adminQk.root, 'users', search, chip] as const,
  assets: (search: string, chip: string | null) => [...adminQk.root, 'assets', search, chip] as const,
  activity: (search: string, chip: string) => [...adminQk.root, 'activity', search, chip] as const,
  staff: () => [...adminQk.root, 'staff'] as const,
  settings: () => [...adminQk.root, 'settings'] as const,
  alerts: () => [...adminQk.root, 'alerts'] as const,
  referralLeaderboard: (weekId?: string) => [...adminQk.root, 'referralLeaderboard', weekId] as const,
  nominations: (weekId?: string) => [...adminQk.root, 'nominations', weekId] as const,
}
