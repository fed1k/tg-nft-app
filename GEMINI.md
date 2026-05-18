# GiftedForge Project Overview

GiftedForge is a comprehensive NFT ecosystem integrated with Telegram, supporting both TON and EVM blockchains. It features a React-based frontend and a standalone Node.js backend.

## Architecture

### Frontend (Vite + React)
- **Framework**: React 19 with TypeScript.
- **Styling**: Tailwind CSS 4.
- **Routing**: React Router 7.
- **State Management**: TanStack Query (React Query) for API calls, React Context for Telegram integration.
- **Blockchain**: 
  - **TON**: `@tonconnect/ui-react` and `@ton/core`.
  - **EVM**: Wagmi and RainbowKit.
- **Telegram Integration**: Telegram Mini App SDK for user authentication, Stars payments, and Gift management.

### Backend (Express + Mongoose)
- **Framework**: Express.js (v5).
- **Database**: MongoDB via Mongoose.
- **Key Models**: `AdminUser`, `AdminAsset`, `AdminTransaction`, `AdminStaff`, `GiftListing`, `PendingMint`.
- **Integrations**: Telegram Bot API for Stars payments and Gift fulfillment.

## Directory Structure

- `src/`: Frontend source code.
  - `components/`: UI components (including an `admin/` subfolder).
  - `pages/`: Application pages (including an `admin/` subfolder).
  - `services/`: API client and business logic.
  - `hooks/`: Custom React hooks (e.g., `useFavorites`).
  - `utils/`: Utility functions for blockchain (TON/NFT) and storage.
- `server/`: Backend source code.
  - `index.js`: Main Express application.
  - `scripts/`: Migration and seeding scripts.
- `public/`: Static assets and the `tonconnect-manifest.json`.

## Building and Running

### Prerequisites
- Node.js (Latest LTS recommended).
- MongoDB instance.

### Frontend
```bash
npm install
cp .env.example .env
npm run dev
```
Key Environment Variables:
- `VITE_ADMIN_API_URL`: Backend API URL.
- `VITE_TON_NETWORK`: `mainnet` or `testnet`.

### Backend
```bash
cd server
npm install
cp .env.example .env
npm run dev
```
Key Environment Variables:
- `MONGODB_URI`: Connection string for MongoDB.
- `TELEGRAM_BOT_TOKEN`: Bot token for Telegram integrations.
- `ADMIN_API_PORT`: Port for the backend (default: 4000).

## Development Conventions

### Coding Style
- **Components**: Functional components with hooks.
- **Styling**: Utility-first CSS using Tailwind CSS 4.
- **API Calls**: Centralized in `src/services/` using Axios/fetch and managed by React Query.
- **Blockchain Interactions**: Isolated in `src/utils/` (e.g., `tonNft.ts`, `tonCollection.ts`).

### Admin Panel
- Access is restricted to users in the `AdminStaff` collection.
- Frontend routes are protected by the `RequireAdmin` component.

### Telegram Mini App
- `TelegramProvider` provides access to the `WebApp` object.
- Data validation for `initData` is performed on the backend to ensure security.

### Testing
- [TODO: Implement and document testing strategy]

## Key Workflows

1. **NFT Minting**: Handled via `src/utils/tonNft.ts` for payload building and tracked via `PendingMint` on the backend.
2. **Marketplace**: Supports both on-chain (TON) and in-app (Stars) transactions for assets and Telegram gifts.
3. **Referrals**: System implemented in the `AdminUser` model with codes like `REF<telegramId>`.
