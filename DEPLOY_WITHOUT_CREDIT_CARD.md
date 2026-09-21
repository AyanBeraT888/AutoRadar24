# 🚀 100% Free Cloud Deployment Guide (ZERO Credit Card Required)

If you were blocked by **Oracle Cloud's billing account verification** (which frequently rejects Indian/debit cards during the $1 authorization check), here are the **top two 100% free alternatives that require NO credit card, NO bank details, and NO billing account**.

---

## ⚡ Option 1: Instant Public HTTPS in 30 Seconds via Cloudflare Tunnel (Recommended First)

You don't need any cloud server to have a live, worldwide HTTPS link right now! You can expose your local backend securely via Cloudflare's global edge network.

### Steps:
1. Start your Auto 24 backend:
   ```bash
   npm run backend
   ```
2. In a second terminal window, run Cloudflare's free zero-config tunnel:
   ```bash
   npx cloudflared tunnel --url http://localhost:3000
   ```
3. Cloudflare will instantly output a worldwide public HTTPS URL:
   ```
   https://random-words-here.trycloudflare.com
   ```
4. **Done!**
   - Open that URL in your phone's browser: the live Web Radar Map loads instantly.
   - Enter that URL into the Driver App or Passenger App settings.
   - **Zero cost, zero credit card, 100% free HTTPS!**

---

## 🌐 Option 2: Render.com (24/7 Cloud Server — Zero Credit Card)

Render is a modern cloud hosting platform. Their Free Web Service tier gives you a 24/7 server with automated SSL without ever asking for a credit card.

### Step 1: Push Your Code to GitHub
1. Create a repository on [github.com](https://github.com) (e.g. `auto24`).
2. Push your project code:
   ```bash
   git add .
   git commit -m "Auto 24 production release"
   git remote add origin https://github.com/YOUR_USERNAME/auto24.git
   git push -u origin main
   ```

### Step 2: Create a Free Render Web Service
1. Go to [render.com](https://render.com) and click **Sign Up** using your GitHub account (No credit card needed).
2. Click **New +** → **Web Service**.
3. Select your `auto24` GitHub repository.
4. Configure the settings:
   - **Name**: `auto24-backend`
   - **Runtime**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && node src/server.js`
   - **Instance Type**: **Free ($0/month)**
5. Under **Environment Variables**, add:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: *(Copy the value from your `.env`)*
6. Click **Create Web Service**.
7. Render will build and deploy your service in 2 minutes, giving you a live URL:
   ```
   https://auto24-backend.onrender.com
   ```

---

## 💾 Free 24/7 Cloud Database (TiDB Cloud MySQL — Zero Credit Card)

If you want a 24/7 MySQL cloud database instead of local SQLite:

1. Sign up at [tidbcloud.com](https://tidbcloud.com) with Google or GitHub (100% free, no credit card required).
2. Click **Create Cluster** → Choose **Serverless (Free Forever)**.
3. Click **Connect** → Copy your connection string:
   ```
   mysql://<user>:<password>@<host>:4000/test?ssl={"rejectUnauthorized":true}
   ```
4. Paste this into your `.env` or Render environment variables under `DATABASE_URL`:
   - Auto 24 automatically switches to MySQL mode when `DATABASE_URL` is detected!
