# 🚀 Oracle Cloud Always-Free Deployment Guide (100% Free HTTPS)

This guide walks you through deploying **Auto 24** to an **Oracle Cloud Always-Free** virtual machine with **100% free automated SSL/TLS** via Caddy and Let's Encrypt.

---

## 📋 What You Get for $0 / Forever
- **Compute**: Oracle Cloud Always Free gives you up to **4 Ampere A1 ARM cores and 24 GB RAM** (or AMD E2.1.Micro) with **200 GB NVMe storage** for free forever.
- **24/7 MySQL Database**: Production MySQL 8.0 running inside Docker with persistent volume storage, online 24/7.
- **SSL Certificate**: Automatic, free Let's Encrypt SSL with auto-renewal handled by Caddy.
- **DDoS & Security Protection**: Built-in rate limiting, security headers, and signed driver authentication tokens.

---

## Step 1: Create Your Always-Free Instance in Oracle Cloud

1. Log in to [Oracle Cloud Console](https://cloud.oracle.com/).
2. Navigate to **Compute** → **Instances** → Click **Create Instance**.
3. Configure your instance:
   - **Name**: `auto24-server`
   - **Image**: **Ubuntu 22.04 / 24.04** or **Oracle Linux 9**
   - **Shape**:
     - *Recommended*: **Ampere (ARM) VM.Standard.A1.Flex** (2 to 4 OCPUs, 12 to 24 GB RAM) - Always Free eligible!
     - *Alternative*: **VM.Standard.E2.1.Micro** (1 OCPU, 1 GB RAM) - Always Free eligible!
   - **Networking**: Select your default Virtual Cloud Network (VCN) and ensure **Assign a public IPv4 address** is checked.
   - **SSH Keys**: Download your private key (`.key`) to your computer so you can SSH into the server.
4. Click **Create** and wait 1–2 minutes for the instance status to turn **RUNNING**.
5. Copy your instance's **Public IP Address** (e.g. `129.153.xx.xx`).

---

## Step 2: Open Ingress Ports (80 & 443) in Oracle Cloud

Oracle Cloud instances are protected by cloud firewalls. You must open HTTP (80) and HTTPS (443) to the public internet:

1. In the Oracle Cloud Console, click on your instance's **Virtual Cloud Network** (under Primary VNIC).
2. Click on **Security Lists** → Click **Default Security List for your VCN**.
3. Under **Ingress Rules**, click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`
   - **Description**: `HTTP and HTTPS for Auto 24 Caddy SSL`
4. Click **Add Ingress Rules**.

### Also open Ubuntu firewall inside the instance:
SSH into your server from PowerShell or terminal:
```bash
ssh -i /path/to/your-key.key ubuntu@<YOUR_PUBLIC_IP>
```
Run the following commands to ensure Ubuntu's `iptables` / `ufw` permits traffic:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

---

## Step 3: Install Docker & Git on the Server

Run these commands inside your SSH session:
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
sudo apt install -y git curl docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# Log out and log back in so docker group takes effect
exit
```
SSH back into your server:
```bash
ssh -i /path/to/your-key.key ubuntu@<YOUR_PUBLIC_IP>
```

---

## Step 4: Point a Domain (Free Options Available)

To obtain a trusted Let's Encrypt SSL certificate, Caddy needs a domain name pointed at your server's Public IP:

* **Option A: Free DuckDNS Subdomain (100% Free in 2 Minutes)**
  1. Go to [duckdns.org](https://www.duckdns.org/) and log in.
  2. Create a domain: e.g. `auto24-live.duckdns.org`.
  3. Enter your Oracle Cloud VM's **Public IP** and click **Update IP**.
* **Option B: Your Own Custom Domain**
  - Go to your DNS provider (Cloudflare, Namecheap, GoDaddy) and add an `A` record:
    - Host: `auto24` (or `@`)
    - Points to: `<YOUR_PUBLIC_IP>`

---

## Step 5: Clone & Launch Auto 24 with Automated SSL

1. Clone your repository (or copy your files) onto the server:
```bash
git clone <YOUR_GIT_REPO_URL> auto-24
cd auto-24
```

2. Create your production environment file (`.env`):
```bash
cat <<EOF > .env
DOMAIN=auto24-live.duckdns.org
ACME_EMAIL=your-email@example.com
PORT=3000
NODE_ENV=production
IDLE_TIMEOUT_SECONDS=15
MOVEMENT_THRESHOLD_METERS=7
SPEED_THRESHOLD_KMH=3
EOF
```
*(Replace `auto24-live.duckdns.org` with your actual domain and your real email).*

3. Build and launch the containers:
```bash
docker compose up -d --build
```

4. Watch Caddy automatically issue your free SSL certificate:
```bash
docker compose logs -f caddy
```
You will see:
```text
certificate obtained successfully {"identifier": "auto24-live.duckdns.org"}
serving initial configuration
```

---

## Step 6: Verify Live HTTPS & Test Mobile Apps

1. Open your browser to:
   ```text
   https://auto24-live.duckdns.org
   ```
   Notice the 🔒 **Secure Lock icon** in your browser bar!
   Your browser will now prompt for and allow live GPS location without security warnings.

2. Connect the **Viewer Mobile App**:
   - In the `viewer-app` mobile app, tap the ⚙️ **Gear Icon**.
   - Set Server Address to:
     ```text
     https://auto24-live.duckdns.org
     ```
   - Tap **Save & Reload**.

3. Connect the **Driver Mobile App**:
   - In `driver-app/src/services/api.js`, set `customBaseUrl` to:
     ```javascript
     export const API_BASE_URL = 'https://auto24-live.duckdns.org';
     ```
   - When drivers are approved, they will receive signed HMAC tokens and transmit encrypted GPS over HTTPS.

---

## 🛠️ Management & Maintenance

### View Live Backend Logs
```bash
docker compose logs -f backend
```

### Approve a Pending Driver
Run inside the container:
```bash
docker compose exec backend node src/approve-driver.js
```
Or approve directly:
```bash
docker compose exec backend node src/approve-driver.js <DRIVER_ID> approved
```

### Restart Services
```bash
docker compose restart
```

### Update Code to Latest Version
```bash
git pull
docker compose up -d --build
```
