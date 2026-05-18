# GiftedForge Frontend

Frontend app (Vite + React) with integrated user + admin UI.

## Frontend setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_ADMIN_API_URL` in `.env` to your deployed backend URL.

## Backend service

The admin backend is now standalone in `server/`.

Use:

```bash
cd server
npm install
cp .env.example .env
npm run dev
```
