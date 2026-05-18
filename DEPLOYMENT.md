# Ubuntu Deployment Guide for GiftedForge

This guide provides step-by-step instructions for deploying the GiftedForge application (Frontend and Backend) on an Ubuntu server (e.g., 22.04 or 24.04 LTS).

## 1. Prerequisites

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js (v20+ recommended)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install MongoDB
If you are not using a managed service like MongoDB Atlas, install it locally:
```bash
sudo apt install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### Install PM2 and Nginx
```bash
sudo npm install -g pm2
sudo apt install -y nginx
```

---

## 2. Clone and Prepare the Project

```bash
git clone <your-repository-url> /var/www/tg-nft-app
cd /var/www/tg-nft-app
```

---

## 3. Backend Deployment (Express)

1. **Install dependencies**:
   ```bash
   cd server
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file in the `server/` directory:
   ```bash
   nano .env
   ```
   Add the following (adjust as needed):
   ```env
   MONGODB_URI=mongodb://localhost:27017/giftedforge
   TELEGRAM_BOT_TOKEN=your_bot_token
   ADMIN_API_PORT=4000
   ADMIN_CLIENT_ORIGIN=https://yourdomain.com
   ```

3. **Start Backend with PM2**:
   ```bash
   pm2 start index.js --name "giftedforge-api"
   pm2 save
   pm2 startup
   ```

---

## 4. Frontend Deployment (Vite/React)

1. **Install dependencies**:
   ```bash
   cd ../ # Back to project root
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file in the root directory:
   ```bash
   nano .env
   ```
   Add the following (adjust to your production URLs):
   ```env
   VITE_ADMIN_API_URL=https://yourdomain.com/api
   VITE_TON_NETWORK=mainnet
   VITE_APP_URL=https://yourdomain.com
   ```

3. **Build the Project**:
   ```bash
   npm run build
   ```
   This will generate a `dist/` folder.

---

## 5. Configure Nginx

Create a new Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/giftedforge
```

Add the following configuration (replace `yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend - Serve static files from the dist directory
    location / {
        root /var/www/tg-nft-app/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API - Reverse proxy to the Express server
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/giftedforge /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 6. Secure with SSL (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Follow the prompts to enable HTTPS.

## 7. Maintenance Commands

- **Check Backend Logs**: `pm2 logs giftedforge-api`
- **Restart Backend**: `pm2 restart giftedforge-api`
- **Rebuild Frontend**: `cd /var/www/tg-nft-app && npm run build`
