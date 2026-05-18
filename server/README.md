# GiftedForge Admin API

Standalone backend service for the admin panel.
Also serves user panel endpoints under `/api/user`.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Update `.env`:
- `MONGODB_URI`
- `ADMIN_CLIENT_ORIGIN`
- `ADMIN_API_PORT`

## Run

```bash
npm run dev
```

Production:

```bash
npm start
```

Backfill legacy assets (adds missing `category` / `marketTab`):

```bash
npm run migrate:assets
```

## API Base

`https://tg-nft-ui-wrml.vercel.app/api/admin`

## Endpoints

- `GET /health`
- `GET /dashboard`
- `GET /users`
- `POST /users`
- `PATCH /users/:id/status`
- `GET /assets`
- `POST /assets`
- `PATCH /assets/:id/status`
- `GET /transactions`
- `GET /staff`
- `POST /staff`
- `GET /settings`
- `PATCH /settings`
- `GET /alerts`

## User endpoints

- `GET /api/user/home`
- `GET /api/user/market`
- `GET /api/user/profile`
