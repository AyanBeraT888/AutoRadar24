# Auto 24 — Viewer Web App (Phase 2)

A zero-login, mobile-optimized live location tracker built with plain HTML, modern CSS, and vanilla JavaScript using **Leaflet.js** and **OpenStreetMap**.

---

## 1. Features
- **Zero Login**: Users open the link and instantly see the vehicle on the live map.
- **OpenStreetMap Tiles**: Free map rendering with zero Google Maps billing or API keys required.
- **Live 3-Second Polling**: Polls `GET /driver/:id` every 3 seconds for continuous updates.
- **Dynamic Status Markers**:
  - **Moving**: Emerald green pin with glowing concentric radar pulse rings and "TRACKING ACTIVE" status pill.
  - **Idle**: Crimson red pin with stationary indicator and "DRIVER IDLE" status pill (triggered if stationary or no updates in 15 seconds).
- **Telemetry HUD**: Speed readout (km/h), elapsed time since last GPS ping ("Just now", "X seconds ago"), and exact coordinates.
- **Driver Switcher**: Modal to view and pick from all approved active drivers or input a custom ID.
- **Lightweight & Fast**: Pure client-side code with zero bundling/build steps required.

---

## 2. How to Open & Use

### Option A: Served via Backend (Built-in)
When the Auto 24 backend is running, the Web Viewer is served directly at:
```
http://localhost:3000/?driver=1
```
Or simply visit `http://localhost:3000` to pick from active drivers.

### Option B: Standalone Hosting
Open `web-viewer/index.html` with any local web server (e.g. `npx serve web-viewer`, Live Server in VS Code, or deploy to Vercel/Netlify/S3).
To point to a remote backend, the app automatically uses `http://localhost:3000` when opened locally, or uses `window.location.origin` if served from the same server.
