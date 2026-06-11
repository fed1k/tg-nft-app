# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)
```bash
npm run dev       # Start Vite dev server (binds to all interfaces via --host)
npm run build     # Production build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

### Backend (server/)
```bash
cd server
npm run dev           # Start with hot reload (node --watch)
npm start             # Start Express server
npm run seed:owner    # Bootstrap initial admin user
npm run migrate:assets  # Run asset migration script
```

No test suite is configured.

## Architecture

**GiftedForge** is a Telegram Mini App NFT marketplace with TON blockchain support. It is split into a React frontend and an Express/MongoDB backend.

### Frontend (`src/`)

Entry point is [src/main.jsx](src/main.jsx), which sets up React Router and wraps the app in:
- `TonConnectUIProvider` → `WagmiProvider` + `RainbowKitProvider` → `QueryClientProvider` → `TelegramProvider` → `LanguageProvider`
- `TelegramProvider` ([src/contexts/TelegramContext.tsx](src/contexts/TelegramContext.tsx)) — wraps `window.Telegram.WebApp`, provides `user`, `initData`, `accessState`, and `webApp`. Calls `POST /api/user/session` on startup with retry logic (up to 4 attempts, 150ms apart) to wait for `initData` to populate. Exposes `reportAccessBlock(err)` for any component to escalate a `USER_BANNED`/`USER_SUSPENDED` error.
- `LanguageProvider` ([src/contexts/LanguageContext.tsx](src/contexts/LanguageContext.tsx)) — i18n context for `en`/`ru`. Translations live in [src/i18n/translations.ts](src/i18n/translations.ts). Call `const { t } = useLanguage()` to get the translate function. Language preference is persisted to `localStorage` under key `gf_lang`.

Routes split into `/app/*` (user-facing, guarded by `RequireAppAccess`) and `/admin/*` (guarded by `RequireAdmin`). The `/offers`, `/swap`, `/languages`, and `/asset/:id` paths are top-level outside `/app`.

API calls use plain `fetch` via [src/services/user/client.ts](src/services/user/client.ts) and [src/services/admin/client.ts](src/services/admin/client.ts). Both clients send `initData` in the `X-Telegram-Init-Data` header. The admin client **also** appends `initData` as a query param (`?initData=...`). Default request timeout is 12s; mint resume is 25s.

Blockchain payloads are built off-chain in [src/utils/tonNft.ts](src/utils/tonNft.ts) and [src/utils/tonCollection.ts](src/utils/tonCollection.ts) using `@ton/core`, then sent via the connected wallet. `tonCollection.ts` contains hardcoded compiled BOC bytecode for the official TEP-62 NFT collection and item contracts.

NFT images and metadata are uploaded to Pinata IPFS before minting via [src/utils/pinata.ts](src/utils/pinata.ts). Requires `VITE_PINATA_JWT`.

Favorites are stored in `localStorage` per Telegram user ID via [src/utils/favoriteStorage.ts](src/utils/favoriteStorage.ts) and the `useFavorites` hook. Cross-component sync uses a `CustomEvent` (`FAVORITES_CHANGED_EVENT`).

### Admin auth flow

Admin access is sessionStorage-based ([src/utils/adminAuth.ts](src/utils/adminAuth.ts)). The `/admin-access` page tries three auth paths in order: dev bypass (`VITE_ADMIN_DEV_BYPASS=true`), Telegram staff check via `POST /api/admin/access-check`, or desktop passphrase (`VITE_ADMIN_DESKTOP_SECRET`). On success, `grantAdminSession(via)` writes to `sessionStorage` keys `gf_admin_session_v1` and `gf_admin_via`. `RequireAdmin` reads these to gate `/admin/*` routes.

### Backend (`server/index.js`)

A single ~3700-line Express file containing all routes, Mongoose model definitions, and middleware. MongoDB is the only data store.

**Auth model:** Every request validates the Telegram `initData` HMAC-SHA256 signature using `TELEGRAM_BOT_TOKEN`. Admin routes additionally check the caller's Telegram ID against the `AdminStaff` collection. `EMBEDDED_TELEGRAM_BOT_TOKEN` in [server/giftedforgeDeploy.js](server/giftedforgeDeploy.js) takes precedence over the env token when non-empty (useful in testing; leave empty in production).

**Key models:** `AdminUser`, `AdminAsset` (NFT listings), `AdminTransaction`, `AdminStaff`, `AdminSettings`, `GiftListing`, `PendingMint`, `StarsPayment`, `AdminNomination`, `AdminReferral`.

Asset status lifecycle: `Pending` → `Active` (listed on market) → `Owned` (sold/transferred) → `Removed` / `Flagged`.

User status values: `Active`, `Flagged`, `Suspended`, `Banned`. Suspended/Banned users are rejected at session sync and receive `USER_SUSPENDED` / `USER_BANNED` error codes.

Transaction types: `Mint`, `Swap`, `Gift`, `Deposit`, `Withdraw`.

**Mint flow:** Frontend uploads image + metadata to Pinata, then calls `POST /api/user/mint/pending` (creates a `PendingMint`), performs the on-chain transaction, then calls `POST /api/user/mint/resume`. If `MINT_REQUIRE_CHAIN_VERIFY=true`, the server queries TonAPI to confirm a transaction to the collection address before creating the `AdminAsset`. A 202 response from resume means still confirming on-chain (does not throw).

**Gift marketplace:** `GiftListing` records are created by sellers (only `giftKind: 'regular'` is supported). Buyers pay with Telegram Stars (deducted from in-app balance) or TON (on-chain to seller wallet). On successful purchase, the backend calls the Telegram Bot API to transfer the gift to the buyer.

**Referral system:** User codes are `REF<telegramId>`. Completion is recorded on the user's first mint. Weekly leaderboards tracked with ISO week IDs.

## Environment Variables

### Frontend (`.env` at root)
```
VITE_ADMIN_API_URL=https://yourdomain.com/api/admin
VITE_USER_API_URL=https://yourdomain.com/api/user
VITE_TON_NETWORK=mainnet
VITE_APP_URL=https://yourdomain.com
VITE_TELEGRAM_APP_URL=https://t.me/yourbot
VITE_WALLETCONNECT_PROJECT_ID=<WalletConnect Project ID>
VITE_PINATA_JWT=<Pinata JWT for IPFS uploads — required for minting>
VITE_MINT_FEE_TON=0.07          # Must match server MINT_FEE_TON
VITE_ADMIN_DEV_BYPASS=true       # Dev only: skip Telegram auth for admin panel
VITE_ADMIN_DESKTOP_SECRET=<passphrase>  # Allows admin login outside Telegram
```

### Backend (`server/.env`)
```
MONGODB_URI=mongodb://localhost:27017/giftedforge
TELEGRAM_BOT_TOKEN=<bot_id>:<token>
ADMIN_API_PORT=4000
ADMIN_CLIENT_ORIGIN=https://yourdomain.com
TON_NETWORK=mainnet
MINT_FEE_TON=0.07
MINT_REQUIRE_CHAIN_VERIFY=false
REFERRAL_BONUS_USD=5
OWNER_TELEGRAM_IDS=<comma-separated Telegram IDs>
TELEGRAM_WEBHOOK_SECRET=<optional — for validating Telegram webhook updates>
```

No `.env.example` files exist — use the templates above.

## Key Config Files

- [vite.config.js](vite.config.js) — React plugin, Tailwind v4, node polyfills (Buffer/process for TON SDK in browser)
- [public/tonconnect-manifest.json](public/tonconnect-manifest.json) — TON Connect app manifest referenced in `main.jsx`
- [src/config/giftedforgeDeploy.ts](src/config/giftedforgeDeploy.ts) and [server/giftedforgeDeploy.js](server/giftedforgeDeploy.js) — Hardcoded production URLs used as fallbacks when env vars are unset
- [vercel.json](vercel.json) and [server/vercel.json](server/vercel.json) — Vercel deployment config for frontend and backend respectively
