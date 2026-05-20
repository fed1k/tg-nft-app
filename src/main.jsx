import { createRoot } from 'react-dom/client'
import './index.css'
import '@rainbow-me/rainbowkit/styles.css'

import { createBrowserRouter, Navigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'

// Telegram Mini App
import { TelegramProvider } from './contexts/TelegramContext'

// TON Connect
import { TonConnectUIProvider } from '@tonconnect/ui-react'

// EVM Wallets
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit'
import { mainnet, polygon, bsc, base } from 'wagmi/chains'

// GiftedForge deploy defaults (URLs) — see src/config/giftedforgeDeploy.ts
import { GIFTEDFORGE_DEPLOY } from './config/giftedforgeDeploy'

// Pages
import Splash from './pages/Splash.tsx'
import Home from './pages/Home.tsx'
import AppLayout from './App.jsx'
import Wallet from './pages/Wallet.tsx'
import Mint from './pages/Mint.tsx'
import Market from './pages/Market.tsx'
import Profile from './pages/Profile.tsx'
import Swap from './pages/Swap.tsx'
import Detail from './pages/Detail.tsx'
import MyCollection from './pages/MyCollection.tsx'
import Offers from './pages/Offers.tsx'
import Favorites from './pages/Favorites.tsx'
import Gifts from './pages/Gifts.tsx'
import RequireAppAccess from './components/RequireAppAccess.tsx'

import AdminAccess from './pages/admin/AdminAccess.tsx'
import AdminLayout from './components/admin/AdminLayout.tsx'
import RequireAdmin from './pages/admin/RequireAdmin.tsx'
import AdminView from './pages/admin/AdminView.tsx'
import AdminUsers from './pages/admin/AdminUsers.tsx'
import AdminAssets from './pages/admin/AdminAssets.tsx'
import AdminActivity from './pages/admin/AdminActivity.tsx'
import AdminControl from './pages/admin/AdminControl.tsx'

// --- Wagmi / RainbowKit config ---
const wagmiConfig = getDefaultConfig({
  appName: 'GiftedForge NFT',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'b54d8a0e5a4c1aecd18e69f5a8e96be1',
  chains: [mainnet, polygon, bsc, base],
  ssr: false,
})

const queryClient = new QueryClient()

// TON Connect manifest: env → localhost dev → GiftedForge production frontend
const tonManifestUrl = import.meta.env.VITE_APP_URL?.trim()
  ? `${import.meta.env.VITE_APP_URL}/tonconnect-manifest.json`
  : typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `${window.location.origin}/tonconnect-manifest.json`
    : `${GIFTEDFORGE_DEPLOY.frontendOrigin}/tonconnect-manifest.json`

// After wallet approval in Telegram, redirect back to Mini App automatically.
const tgAppUrl =
  import.meta.env.VITE_TELEGRAM_APP_URL?.trim() || GIFTEDFORGE_DEPLOY.telegramMiniAppUrl || null

const tonActionsConfig = {
  // 'back' = go to previous screen after wallet approval (works inside Telegram)
  returnStrategy: 'back',
  // twaReturnUrl: specific Telegram deeplink — wallet opens Mini App directly after sign
  ...(tgAppUrl ? { twaReturnUrl: tgAppUrl } : {}),
  // Show notification modals for all tx states
  notifications: ['before', 'success', 'error'],
}

// --- Router ---
const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/splash" replace /> },
  { path: '/splash', element: <Splash /> },
  {
    path: '/offers',
    element: (
      <RequireAppAccess>
        <Offers />
      </RequireAppAccess>
    ),
  },
  {
    path: '/swap',
    element: (
      <RequireAppAccess>
        <Swap />
      </RequireAppAccess>
    ),
  },
  {
    path: '/asset/:id',
    element: (
      <RequireAppAccess>
        <Detail />
      </RequireAppAccess>
    ),
  },
  { path: '/admin-access', element: <AdminAccess /> },
  {
    path: '/admin',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/view" replace /> },
      { path: 'view', element: <AdminView /> },
      { path: 'users', element: <AdminUsers /> },
      { path: 'assets', element: <AdminAssets /> },
      { path: 'activity', element: <AdminActivity /> },
      { path: 'control', element: <AdminControl /> },
    ],
  },
  {
    path: '/app',
    element: (
      <RequireAppAccess>
        <AppLayout />
      </RequireAppAccess>
    ),
    children: [
      { index: true, element: <Navigate to="/app/home" replace /> },
      { path: 'home', element: <Home /> },
      { path: 'wallet', element: <Wallet /> },
      { path: 'mint', element: <Mint /> },
      { path: 'market', element: <Market /> },
      { path: 'my-collection', element: <MyCollection /> },
      { path: 'favorites', element: <Favorites /> },
      { path: 'gifts', element: <Gifts /> },
      { path: 'profile', element: <Profile /> },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <TonConnectUIProvider manifestUrl={tonManifestUrl} actionsConfiguration={tonActionsConfig}>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#6B6AFD',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
          })}
        >
          <TelegramProvider>
            <RouterProvider router={router} />
          </TelegramProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </TonConnectUIProvider>
)
