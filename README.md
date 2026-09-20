# Auto 24 — Live Driver Location Tracking Platform

A dedicated, lightweight live driver-location tracking system designed solely for location visibility (no bookings, no ride-matching, no payments, and no third-party auth).

---

## Architecture Overview

```
Auto 24/
├── backend/                      # Node.js + Express + SQLite (node:sqlite)
│   ├── .env                      # Server configuration
│   ├── src/
│   │   ├── server.js             # REST API endpoints & staleness detection
│   │   ├── db.js                 # SQLite schema & queries
│   │   ├── approve-driver.js     # CLI helper for manual database approval
│   │   └── utils/geo.js          # Haversine distance & moving/idle logic
│   └── test/e2e.test.js          # Automated end-to-end integration test
│
├── driver-app/                   # React Native (Expo) Android Foreground Service
│   ├── App.js                    # State router (Registration -> Pending -> Tracking)
│   ├── app.json                  # Android permissions & foreground service
│   ├── assets/                   # App icon & splash branding
│   └── src/
│       ├── screens/              # Registration, Pending, Tracking screens
│       ├── services/             # Background task, API client, Local storage
│       └── theme/                # Centralized colors & typography
│
├── web-viewer/                   # Flightradar24-style Leaflet Web Radar Map
│   ├── index.html                # Web viewer page with Leaflet & HUD
│   ├── css/style.css             # Dark Radar theme & Flightradar24 card styles
│   ├── js/                       # Map engine, 3D auto rendering, bearing math
│   └── assets/                   # 3D Indian Auto icons (yellow moving, red idle)
│
└── viewer-app/                   # React Native (Expo) Passenger / User Native App
    ├── App.js                    # Native WebView container, top HUD & controls
    ├── app.json                  # Expo config, dark theme & Android permissions
    ├── assets/                   # App icon, adaptive icon & splash branding
    └── src/
        ├── components/           # ServerConfigModal (quick IP switcher)
        ├── services/             # AsyncStorage server URL & preferences
        └── theme/                # Radar dark theme color tokens
```

---

## Accessible Links & Endpoints (by Subdivision)

### 1. Web Viewer Subdivision (`web-viewer/` — Port 3000)
The web viewer is served statically by the backend server or standalone:

| Accessible Link | Method | Description |
| :--- | :---: | :--- |
| [http://localhost:3000/](http://localhost:3000/) | `GET` | **Home Map View**: Displays interactive OpenStreetMap with nearby autos and radar scanning |
| [http://localhost:3000/index.html](http://localhost:3000/index.html) | `GET` | Direct index file route |
| [http://localhost:3000/?driver=1](http://localhost:3000/?driver=1) | `GET` | **Direct Vehicle Tracking**: Tracks specific driver ID (replace `1` with any driver/device ID) |
| [http://localhost:3000/?driver=1&radius=5](http://localhost:3000/?driver=1&radius=5) | `GET` | Direct tracking with custom search radius parameter (km) |
| [http://localhost:3000/css/style.css](http://localhost:3000/css/style.css) | `GET` | Web viewer stylesheet & theme tokens |
| [http://localhost:3000/js/app.js](http://localhost:3000/js/app.js) | `GET` | Leaflet map logic, telemetry HUD, and polling engine |
| [http://localhost:3000/assets/favicon.png](http://localhost:3000/assets/favicon.png) | `GET` | Web viewer brand favicon |
| [http://localhost:3000/vendor/leaflet/leaflet.js](http://localhost:3000/vendor/leaflet/leaflet.js) | `GET` | Bundled Leaflet.js map engine |
| [http://localhost:3000/vendor/leaflet/leaflet.css](http://localhost:3000/vendor/leaflet/leaflet.css) | `GET` | Bundled Leaflet.js stylesheet |

---

### 2. Backend REST API Subdivision (`backend/` — Port 3000)
Core service handling driver state, validation, and real-time telemetry:

| Endpoint | Method | Payload / Params | Description |
| :--- | :---: | :--- | :--- |
| [http://localhost:3000/health](http://localhost:3000/health) | `GET` | *None* | Service health check and current server epoch |
| [http://localhost:3000/drivers](http://localhost:3000/drivers) | `GET` | *None* | List all registered drivers with active coordinates |
| [http://localhost:3000/drivers?status=approved](http://localhost:3000/drivers?status=approved) | `GET` | `status=approved` | Filter list of approved drivers |
| [http://localhost:3000/driver/:id](http://localhost:3000/driver/1) | `GET` | `:id` (Driver ID or Device ID) | Live position, speed, and staleness status for a driver |
| `http://localhost:3000/registration-status/:device_id` | `GET` | `:device_id` | Polled by driver app to check approval status |
| `http://localhost:3000/register-driver` | `POST` | `{ name, phone, vehicle_no, device_id }` | Self-registration endpoint for drivers (defaults to `pending`) |
| `http://localhost:3000/update-location` | `POST` | `{ device_id, lat, lng, timestamp }` | Broadcast live GPS coordinates every 3–5s (requires approval) |

---

### 3. Driver Native App Subdivision (`driver-app/` — Expo / Metro Port 8081)
React Native mobile app for Android foreground location broadcast:

| Target / Interface | Protocol / Address | Description |
| :--- | :--- | :--- |
| Metro Bundler Dev Server | [http://localhost:8081](http://localhost:8081) | Expo Metro development interface |
| Metro Status Check | [http://localhost:8081/status](http://localhost:8081/status) | Bundler health endpoint |
| Android Emulator Backend Bridge | `http://10.0.2.2:3000` | Localhost loopback address used inside Android Emulator |
| Physical Android Device Connection | `http://<YOUR_LAN_IP>:3000` | Configured on app's registration screen for physical devices on same Wi-Fi |

---

### 4. User / Passenger Native App Subdivision (`viewer-app/` — Expo / Metro)
Zero-login React Native mobile app for live Auto/Toto radar tracking:

| Target / Interface | Protocol / Address | Description |
| :--- | :--- | :--- |
| Metro Bundler Dev Server | [http://localhost:8081](http://localhost:8081) (or 8082) | Expo Metro development interface |
| Android Emulator Default | `http://10.0.2.2:3000` | Default preconfigured backend server URL on Android |
| Physical Android Device Connection | `http://<YOUR_LAN_IP>:3000` | Selected or typed in the in-app **Server Settings ⚙️** modal |
| Localhost (Web / Desktop preview) | `http://localhost:3000` | Local host connection option |

---

## Quick Start (Root Commands)

Run commands conveniently from the root `Auto 24` workspace directory:

```bash
# Start backend server only
npm run backend

# Start driver app (Metro bundler)
npm run driver

# Start user / passenger native app (Metro bundler)
npm run viewer

# Approve a driver directly in the database
npm run approve 1 approved

# Simulate live moving drivers for testing
npm run simulate
```

---

## Phase 1 Execution & Verification

### 1. Start Backend
```bash
cd backend
npm install
npm start
```
Runs on `http://localhost:3000`.

### 2. Run Backend E2E Test Suite
```bash
cd backend
npm run test:e2e
```
Verifies registration, unapproved update rejection (403), database manual approval, moving vs. idle Haversine calculation, and 15s staleness timeout.

### 3. Manually Approve Drivers in the Database
Because there is no admin panel by design, approve drivers directly:
```bash
cd backend
# List registered drivers
npm run approve list

# Approve a driver by ID
npm run approve 1 approved
```

### 4. Start the Driver App
```bash
cd driver-app
npm install
npx expo start
```

---

## Phase 2 Execution: Flightradar24 Web Viewer

The web viewer requires no build steps and is served automatically by the backend server:

1. Ensure the backend is running (`npm run backend` or `cd backend && npm start`).
2. Open your browser to:
   - **Live Radar Map**: [http://localhost:3000/](http://localhost:3000/)
   - **Track Driver #1**: [http://localhost:3000/?driver=1](http://localhost:3000/?driver=1)
3. Features:
   - 3D Indian Auto icons (Yellow = moving, Red = idle/stopped)
   - Flightradar24 single vehicle card (Owner name, vehicle no, model, 3D render, recenter button)
   - 100% free OpenStreetMap tiles with dark radar filter (zero API keys needed)

---

## Phase 3 Execution: Start the User Native App (`viewer-app`)

The user/passenger native app requires **no login**, provides full dark radar live tracking, and includes a built-in server switcher to connect seamlessly across emulators and physical devices.

### 1. Start the App from Root or Subdirectory

**Option A (From Root Directory):**
```bash
npm run viewer
```

**Option B (From `viewer-app/` Subdirectory):**
```bash
cd viewer-app
npm install
npx expo start
```

### 2. Run on Your Device or Emulator

Once Metro starts, choose your platform in the terminal:
- **Android Emulator**: Press `a` in the terminal. (Make sure an Android Virtual Device is running in Android Studio).
- **Physical Phone (Expo Go)**:
  1. Install the **Expo Go** app from Google Play Store or iOS App Store.
  2. Scan the QR code displayed in your terminal with your phone's camera (iOS) or the Expo Go app (Android).
  3. Ensure your phone and computer are on the **same Wi-Fi network**.
- **Web Browser Preview**: Press `w` in the terminal to preview in the web browser.

### 3. Connecting to the Backend Server

The app features a built-in **Server Settings modal** accessible by tapping the ⚙️ (Gear) icon in the top-right header:

- **Android Emulator**: The app automatically defaults to `http://10.0.2.2:3000` (the Android loopback address to your host PC). No configuration needed!
- **Physical Device**: Tap ⚙️ in the header, choose **Custom IP**, enter your computer's local Wi-Fi IP address (e.g., `http://192.168.1.50:3000`), and tap **Save & Reload**.
- Find your local IP on Windows by running:
  ```powershell
  ipconfig
  ```
  (Look for `IPv4 Address` under your active Wi-Fi adapter).

### 4. Testing Live Vehicle Tracking

1. In one terminal, start the backend: `npm run backend`
2. Start the simulator to feed realistic moving autos:
   ```bash
   npm run simulate
   ```
3. In another terminal, start the viewer app: `npm run viewer`
4. Open the viewer app on your emulator or phone:
   - You will immediately see live autos moving across the dark radar map.
   - Tap any vehicle on the map to open its Flightradar24-style vehicle profile card showing owner name, vehicle number, Toto model, and real-time status.
   - Tap **Recenter Vehicle** to lock the camera onto that auto.
   - Use the ⟳ button in the header to refresh at any time.
