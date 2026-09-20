# Auto 24 — Backend Service

Lightweight, high-performance Node.js REST API for live driver location tracking.
Uses native SQLite (`node:sqlite`) with zero external native compilation dependencies. Designed to run comfortably on low-resource machines (< 2GB RAM).

---

## 1. Quick Start

### Installation
```bash
cd backend
npm install
```

### Run the Server
```bash
# Production start
npm start

# Development mode (auto-reloads on file change in Node 22+)
npm run dev
```
The server will start on port `3000` (or the port defined in `.env`).

---

## 2. Configuration (`.env`)

```env
PORT=3000
IDLE_TIMEOUT_SECONDS=15
MOVEMENT_THRESHOLD_METERS=7
SPEED_THRESHOLD_KMH=3
```

- **`IDLE_TIMEOUT_SECONDS`**: If no GPS ping is received from an active driver within this threshold (default: 15s), the server automatically reports their `moving_status` as `"idle"`.
- **`MOVEMENT_THRESHOLD_METERS`**: Distance between consecutive GPS pings below which the vehicle is considered stationary (filters GPS drift).
- **`SPEED_THRESHOLD_KMH`**: Velocity threshold below which movement is marked `"idle"`.

---

## 3. Manual Driver Approval (Direct Database Edit)

Per system design, there is **no admin UI or approval endpoint**. Drivers default to `status = 'pending'` upon registration and cannot submit location updates until manually approved.

### Option A: Using the built-in CLI command (Easiest)
```bash
# View list of all registered drivers
npm run approve list
# or
node src/approve-driver.js list

# Approve driver by ID
npm run approve 1 approved
# or
node src/approve-driver.js 1 approved

# Reject or reset to pending
npm run approve 1 rejected
npm run approve 1 pending
```

### Option B: Using SQLite Command Line
```bash
sqlite3 data/auto24.db "UPDATE drivers SET status = 'approved' WHERE driver_id = 1;"
```

### Option C: Using DB Browser for SQLite / VS Code SQLite Extension
1. Open `backend/data/auto24.db`.
2. Browse table `drivers`.
3. Change the `status` column from `'pending'` to `'approved'`.
4. Write changes / save.

---

## 4. API Endpoints

### 1. Register Driver
`POST /register-driver`
- **Body**:
  ```json
  {
    "name": "Alex Smith",
    "phone": "+1234567890",
    "vehicle_no": "KA-01-AB-1234",
    "device_id": "device_uuid_here"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "message": "Driver registration received. Waiting for approval.",
    "driver": {
      "driver_id": 1,
      "name": "Alex Smith",
      "phone": "+1234567890",
      "vehicle_no": "KA-01-AB-1234",
      "device_id": "device_uuid_here",
      "status": "pending"
    }
  }
  ```

---

### 2. Check Registration Status
`GET /registration-status/:device_id`
- **Response**: `200 OK`
  ```json
  {
    "driver_id": 1,
    "device_id": "device_uuid_here",
    "name": "Alex Smith",
    "vehicle_no": "KA-01-AB-1234",
    "status": "pending"
  }
  ```
  *(Status changes to `"approved"` once manually flipped in DB)*

---

### 3. Update Location
`POST /update-location`
- **Body**:
  ```json
  {
    "device_id": "device_uuid_here",
    "lat": 12.9716,
    "lng": 77.5946,
    "timestamp": 1700000000000
  }
  ```
- **Behavior**:
  - If driver's status is **not** `"approved"`: Returns `403 Forbidden` (`{"error": "Forbidden: Driver registration is not approved"}`).
  - If approved: Computes delta from previous point, updates database, and returns:
  ```json
  {
    "success": true,
    "moving_status": "moving",
    "distanceMeters": 24.5,
    "speedKmh": 22.1,
    "timestamp": 1700000000000
  }
  ```

---

### 4. Get Driver Location (Viewer API)
`GET /driver/:id` (Accepts `driver_id` or `device_id`)
- **Response**: `200 OK`
  ```json
  {
    "driver_id": 1,
    "name": "Alex Smith",
    "vehicle_no": "KA-01-AB-1234",
    "status": "approved",
    "lat": 12.9716,
    "lng": 77.5946,
    "moving_status": "moving",
    "last_updated": 1700000000000,
    "is_live": true
  }
  ```
  *Note: If no location ping is received within `15s`, `moving_status` is dynamically returned as `"idle"`.*

---

### 5. List Drivers (Viewer / Test API)
`GET /drivers` (Optional query parameter: `?status=approved`)
- **Response**: `200 OK`
  ```json
  [
    {
      "driver_id": 1,
      "name": "Alex Smith",
      "vehicle_no": "KA-01-AB-1234",
      "status": "approved",
      "lat": 12.9716,
      "lng": 77.5946,
      "moving_status": "idle",
      "last_updated": 1700000000000,
      "is_live": false
    }
  ]
  ```
