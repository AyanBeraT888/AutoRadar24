# Auto 24 — Driver Native App (Phase 1)

React Native (Expo) Android foreground-service location broadcast app.

---

## 1. Features
- **Zero Third-Party Auth**: Direct self-registration with full name, phone number, vehicle number, and a hardware/storage-generated `device_id`.
- **Manual Approval Gate**: Sits in an animated "Waiting for approval" state and polls `GET /registration-status/:device_id`. Cannot transmit GPS until approved.
- **Persistent Android Foreground Service**: Uses `expo-location` + `expo-task-manager` with notification `"Auto 24 — Tracking active"`. Transmits live coordinates every 3–5 seconds even when the phone screen is locked or the app is minimized.
- **Minimal Android Permissions**: Strictly requests:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_LOCATION`

---

## 2. Directory Structure

```
driver-app/
├── App.js                      # Root router: Register -> Pending -> Tracking
├── app.json                    # Permissions & Foreground Service definition
├── assets/                     # App icon & splash branding assets
│   ├── icon.png
│   ├── adaptive-icon.png
│   └── splash.png
├── package.json
└── src/
    ├── screens/
    │   ├── RegistrationScreen.js  # Form + server connection config
    │   ├── PendingScreen.js       # Waiting for approval & live polling
    │   └── TrackingScreen.js      # Active tracking & telemetry dashboard
    ├── services/
    │   ├── api.js                 # Backend REST client
    │   ├── storage.js             # Local device_id & profile persistence
    │   └── locationTask.js        # Background task & foreground service
    └── theme/
        ├── colors.js              # Centralized status & brand colors
        └── typography.js          # Geometric sans-serif styles
```

---

## 3. How to Run

### Install Dependencies
```bash
cd driver-app
npm install
```

### Start Development Server
```bash
npx expo start
```
- **Android Emulator**: Press `a` in the terminal to launch the Android emulator. (The app defaults to `http://10.0.2.2:3000` to reach your machine's backend).
- **Physical Device**: Connect phone to the same Wi-Fi, tap "Configure Backend Server" on the registration screen, and enter your computer's local IP (e.g. `http://192.168.1.5:3000`).

### Bare / Dev-Client Prebuild (for Native Android Folder)
When ready to build the standalone Android APK or configure native code directly:
```bash
npx expo prebuild --platform android
```
This generates the `android/` directory with all permissions and foreground service manifest entries automatically configured.
