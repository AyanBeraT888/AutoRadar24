/**
 * Auto 24 — Viewer Web App Logic
 * Real-time map tracking with Flightradar24-style single vehicle profile card
 * and 3D Indian Auto Rickshaw markers (matching user reference image).
 */

// Backend API configuration
const API_BASE = window.location.origin.includes('3000')
  ? window.location.origin
  : 'http://localhost:3000';

const SINGLE_DRIVER_POLL_MS = 3000;
const NEARBY_OVERVIEW_POLL_MS = 6000;

// Application State
let map = null;
let tileLayer = null;
let isDarkMap = true;
let userLocation = null;
let userMarker = null;
let radarCircleLayer = null;
let currentDriverId = null;
let currentDriverData = null;
let pollTimer = null;
let overviewTimer = null;
let autoRecenter = true;
let previousPoint = null;
let allDriversList = [];
const activeMarkers = new Map(); // driver_id -> Leaflet Marker

// Settings State (Stored in localStorage)
let searchRadiusKm = parseFloat(localStorage.getItem('auto24_radius_km') || '1.0');
let showRadarCircle = localStorage.getItem('auto24_show_radar_circle') !== 'false';

// UI Elements
const els = {
  homeBar: document.getElementById('home-bar'),
  nearbyCountText: document.getElementById('nearby-count-text'),
  nearbyCountBadge: document.getElementById('nearby-count-badge'),
  locateMeBtn: document.getElementById('locate-me-btn'),
  mapThemeBtn: document.getElementById('map-theme-btn'),

  // Single Flightradar24 Vehicle Profile Card
  frCard: document.getElementById('vehicle-profile-card'),
  frVehicleNo: document.getElementById('fr-vehicle-no'),
  frOwnerName: document.getElementById('fr-owner-name'),
  frTypeBadge: document.getElementById('fr-type-badge'),
  frCloseBtn: document.getElementById('fr-close-btn'),
  frGraphicImg: document.getElementById('fr-graphic-img'),
  fr3dModel: document.getElementById('fr-3d-model'),
  frGraphicLabel: document.getElementById('fr-graphic-label'),
  frModelName: document.getElementById('fr-model-name'),
  frStatusCode: document.getElementById('fr-status-code'),
  frStatusText: document.getElementById('fr-status-text'),
  frStatusDetail: document.getElementById('fr-status-detail'),
  frCenterIconBadge: document.getElementById('fr-center-icon-badge'),
  frSpeedVal: document.getElementById('fr-speed-val'),
  frSpeedSub: document.getElementById('fr-speed-sub'),
  frMetricPing: document.getElementById('fr-metric-ping'),
  frMetricSignal: document.getElementById('fr-metric-signal'),
  frMetricCoords: document.getElementById('fr-metric-coords'),
  frMetricHeading: document.getElementById('fr-metric-heading'),
  frTrackProgress: document.getElementById('fr-track-progress'),
  frTrackMarker: document.getElementById('fr-track-marker'),
  frRecenterBtn: document.getElementById('fr-recenter-btn'),

  // Driver Modal
  modal: document.getElementById('driver-modal'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  driversList: document.getElementById('drivers-list'),
  modalSearchInput: document.getElementById('modal-search-input'),
  customIdInput: document.getElementById('custom-id-input'),
  loadCustomIdBtn: document.getElementById('load-custom-id-btn'),

  // Settings Modal
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  radiusSlider: document.getElementById('radius-slider'),
  radiusValText: document.getElementById('radius-val-text'),
  toggleRadiusCircle: document.getElementById('toggle-radius-circle'),
};

/**
 * Compute Haversine distance between two coordinates in km
 */
function computeDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Compute forward azimuth/bearing in degrees
 */
function computeBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

/**
 * Cardinal direction label
 */
function getCardinalDirection(angleDeg) {
  const directions = ['North (N)', 'North-East (NE)', 'East (E)', 'South-East (SE)', 'South (S)', 'South-West (SW)', 'West (W)', 'North-West (NW)'];
  const index = Math.round(angleDeg / 45) % 8;
  return directions[index];
}

/**
 * Format distance string
 */
function formatDistance(distKm) {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)}m`;
  }
  return `${distKm.toFixed(1)} km`;
}

/**
 * Resolve Toto / Auto model name intelligently
 */
function getVehicleModelName(driver) {
  if (!driver) return 'Mayuri Deluxe Electric Toto (E-Rickshaw)';
  if (driver.model) return driver.model;
  const plate = (driver.vehicle_no || '').toUpperCase();
  const name = (driver.name || '').toLowerCase();

  if (plate.startsWith('WB') || name.includes('mondal') || name.includes('toto')) {
    return 'Mayuri Deluxe Electric Toto (E-Rickshaw)';
  }
  if (plate.includes('SIM')) {
    return 'Yatri Pro EV Toto (Electric 3-Wheeler)';
  }
  if (plate.startsWith('KA') || plate.startsWith('DL') || plate.startsWith('MH')) {
    return 'Bajaj RE Compact 4S (Auto Rickshaw)';
  }
  return 'Electric Toto (Battery E-Rickshaw)';
}

/**
 * Initialize Map with Dark Radar tiles matching Flightradar24 (Image 2)
 */
function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
  }).setView([12.9716, 77.5946], 14);

  setMapTheme(isDarkMap);

  L.control.zoom({ position: 'topright' }).addTo(map);

  map.on('dragstart', () => {
    autoRecenter = false;
    if (els.frRecenterBtn) {
      els.frRecenterBtn.classList.remove('fr-btn-primary');
      els.frRecenterBtn.classList.add('fr-btn-secondary');
    }
  });
}

/**
 * Toggle Map Theme (Dark Radar / OSM Standard)
 */
function setMapTheme(dark) {
  isDarkMap = dark;
  if (tileLayer) {
    map.removeLayer(tileLayer);
  }

  const mapContainer = document.getElementById('map');

  if (isDarkMap) {
    mapContainer.classList.add('dark-radar-mode');
  } else {
    mapContainer.classList.remove('dark-radar-mode');
  }

  // 100% Free OpenStreetMap tiles (Zero API key required)
  tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  if (els.mapThemeBtn) {
    els.mapThemeBtn.innerHTML = isDarkMap
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }
}

/**
 * Radar Perimeter Circle
 */
function updateRadarCircle() {
  if (!map) return;

  if (userLocation && showRadarCircle && searchRadiusKm < 999) {
    const radiusMeters = searchRadiusKm * 1000;
    if (!radarCircleLayer) {
      radarCircleLayer = L.circle([userLocation.lat, userLocation.lng], {
        radius: radiusMeters,
        color: '#ffcc00',
        weight: 1.2,
        opacity: 0.6,
        fillColor: '#ffcc00',
        fillOpacity: 0.04,
        dashArray: '4, 8',
      }).addTo(map);
    } else {
      radarCircleLayer.setLatLng([userLocation.lat, userLocation.lng]);
      radarCircleLayer.setRadius(radiusMeters);
    }
  } else {
    if (radarCircleLayer) {
      map.removeLayer(radarCircleLayer);
      radarCircleLayer = null;
    }
  }
}

/**
let hasInitiallyCentered = false;

/**
 * Set User Location, Render Blue Pulsing Beacon, and Center Map
 */
function setUserLocationAndCenter(lat, lng, shouldCenter = true) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;

  userLocation = { lat, lng };

  const userIcon = L.divIcon({
    className: 'custom-user-div-icon',
    html: `
      <div class="user-location-wrapper">
        <div class="user-location-pulse"></div>
        <div class="user-location-pulse-secondary"></div>
        <div class="user-location-dot"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

  if (!userMarker) {
    userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    userMarker.bindTooltip('Your Location', { direction: 'top', offset: [0, -12] });
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  if (shouldCenter && map) {
    hasInitiallyCentered = true;
    map.flyTo([lat, lng], 16, { duration: 1.2 });
  }

  updateRadarCircle();
  fetchNearbyVehicles();

  if (els.locateMeBtn) {
    els.locateMeBtn.classList.remove('locating');
  }
}

/**
 * User Geolocation Beacon with multi-stage fallback (GPS -> Balanced -> IP)
 */
function initUserLocation(forceCenter = false) {
  if (els.locateMeBtn) {
    els.locateMeBtn.classList.add('locating');
  }

  const onSuccess = (pos) => {
    setUserLocationAndCenter(
      pos.coords.latitude,
      pos.coords.longitude,
      forceCenter || !hasInitiallyCentered
    );
  };

  const onFinalError = async () => {
    console.warn('[Viewer] Browser GPS unavailable or timed out. Falling back to IP Geolocation...');
    try {
      const res = await fetch('https://ipwho.is/');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.latitude && data.longitude) {
          console.log('[Viewer] Resolved location via IP:', data.city, data.latitude, data.longitude);
          setUserLocationAndCenter(
            data.latitude,
            data.longitude,
            forceCenter || !hasInitiallyCentered
          );
          return;
        }
      }
    } catch (e) {
      console.warn('[Viewer] IP Geolocation fallback failed:', e);
    }
    if (els.locateMeBtn) {
      els.locateMeBtn.classList.remove('locating');
    }
  };

  if (!navigator.geolocation) {
    onFinalError();
    return;
  }

  // Attempt 1: High accuracy GPS
  navigator.geolocation.getCurrentPosition(
    onSuccess,
    () => {
      // Attempt 2: Balanced / Standard accuracy fallback
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        () => {
          // Attempt 3: IP Location fallback
          onFinalError();
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
  );

  // Continuous background position watcher
  try {
    navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocationAndCenter(pos.coords.latitude, pos.coords.longitude, false);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
  } catch (err) {}
}

// Native App Bridge: allows React Native WebView (viewer-app) to inject precise GPS directly
window.handleNativeLocation = function (lat, lng, accuracy) {
  console.log('[Viewer Native Bridge] Received location from app:', lat, lng, 'accuracy:', accuracy);
  setUserLocationAndCenter(Number(lat), Number(lng), !hasInitiallyCentered);
};

// Listen for messages from React Native WebView
window.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && (data.type === 'USER_LOCATION' || data.type === 'LOCATION')) {
      window.handleNativeLocation(data.lat, data.lng, data.accuracy);
    }
  } catch (e) {}
});
document.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && (data.type === 'USER_LOCATION' || data.type === 'LOCATION')) {
      window.handleNativeLocation(data.lat, data.lng, data.accuracy);
    }
  } catch (e) {}
});

/**
 * CREATE 3D AUTO MAP MARKER ICON (Matching User's Reference Image)
 * "i want this type of icon to show in web viewer app to locato autos"
 * Yellow when moving, Red when idle!
 */
function createVehicleIcon(movingStatus, vehicleNo, isSelected = false) {
  const isMoving = movingStatus === 'moving';
  const isJammed = movingStatus === 'jammed';
  const iconSrc = isMoving ? './assets/auto-3d-yellow.png' : './assets/auto-3d-red.png';
  const selectedClass = isSelected ? 'selected' : '';
  const jamClass = isJammed ? 'traffic-jam' : '';

  const statusTitle = isJammed
    ? 'Traffic Jam (Congestion Cluster)'
    : isMoving
    ? 'Moving (Active)'
    : 'Idle (Stationary)';

  const html = `
    <div class="auto-3d-marker-container ${selectedClass} ${jamClass}" title="${vehicleNo || 'Auto'} • ${statusTitle}">
      <img src="${iconSrc}" class="auto-3d-img" alt="Auto" />
      ${isJammed ? '<div class="jam-badge">JAM</div>' : ''}
    </div>
  `;

  return L.divIcon({
    className: 'custom-auto-3d-icon',
    html: html,
    iconSize: [48, 58],
    iconAnchor: [24, 29],
  });
}

/**
 * Fetch and plot active vehicles within radius
 */
async function fetchNearbyVehicles() {
  try {
    const res = await fetch(`${API_BASE}/drivers?status=approved`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const drivers = await res.json();
    allDriversList = drivers || [];

    let countInRadius = 0;
    const currentRenderedIds = new Set();

    drivers.forEach((driver) => {
      const id = String(driver.driver_id);

      if (driver.lat != null && driver.lng != null) {
        const lat = Number(driver.lat);
        const lng = Number(driver.lng);
        const isSelected = String(currentDriverId) === id;

        let isWithinRadius = true;
        let distKm = 0;
        if (userLocation && searchRadiusKm < 999) {
          distKm = computeDistanceKm(userLocation.lat, userLocation.lng, lat, lng);
          isWithinRadius = distKm <= searchRadiusKm;
        }

        if (isWithinRadius || isSelected) {
          if (isWithinRadius) countInRadius++;
          currentRenderedIds.add(id);

          const icon = createVehicleIcon(driver.moving_status, driver.vehicle_no, isSelected);

          if (!activeMarkers.has(id)) {
            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.on('click', () => {
              selectDriver(driver.driver_id);
            });
            activeMarkers.set(id, marker);
          } else {
            const marker = activeMarkers.get(id);
            marker.setLatLng([lat, lng]);
            marker.setIcon(icon);
          }

          if (isSelected) {
            updateSelectedDriverCard(driver);
          }
        }
      }
    });

    for (const [id, marker] of activeMarkers.entries()) {
      if (!currentRenderedIds.has(id) && id !== String(currentDriverId)) {
        map.removeLayer(marker);
        activeMarkers.delete(id);
      }
    }

    if (els.nearbyCountText) {
      if (searchRadiusKm >= 999) {
        els.nearbyCountText.textContent = `${countInRadius} ${countInRadius === 1 ? 'Auto' : 'Autos'} Online`;
      } else {
        const radiusStr = searchRadiusKm < 1 ? `${Math.round(searchRadiusKm * 1000)}m` : `${searchRadiusKm}km`;
        els.nearbyCountText.textContent = `${countInRadius} ${countInRadius === 1 ? 'Auto' : 'Autos'} within ${radiusStr}`;
      }
    }
  } catch (err) {
    console.warn('[Viewer] Could not refresh nearby autos:', err.message);
  }
}

/**
 * Update the SINGLE Flightradar24-style Vehicle Profile Card
 * "card strictly contain -> 1. owner name 2. vehicle no. 3. toto model 4. a graphical picture of toto instead of actual photo"
 */
function updateSelectedDriverCard(driver) {
  if (!driver) return;
  currentDriverData = driver;

  // 1. Owner Name
  els.frOwnerName.textContent = driver.name || 'Auto Driver';

  // 2. Vehicle No
  els.frVehicleNo.textContent = driver.vehicle_no || 'AUTO-24';

  // 3. Toto Model
  const modelName = getVehicleModelName(driver);
  els.frModelName.textContent = modelName;
  els.frModelName.title = modelName;

  const isAuto = modelName.toLowerCase().includes('auto');
  els.frTypeBadge.textContent = isAuto ? 'AUTO-3W' : 'TOTO-EV';
  els.frTypeBadge.className = 'fr-tag ' + (isAuto ? 'fr-tag-brand' : 'fr-tag-type');

  // 4. Graphical Picture of Toto / Auto (User's exact 3D GLB model + fallback)
  const isMoving = driver.moving_status === 'moving';
  const imgPath = isMoving ? './assets/auto-3d-yellow.png' : './assets/auto-3d-red.png';
  const glbPath = isMoving ? './assets/tuktuk_moving_yellow.glb' : './assets/tuktuk_idle_red.glb';

  if (els.fr3dModel) {
    if (els.fr3dModel.getAttribute('src') !== glbPath) {
      els.fr3dModel.setAttribute('src', glbPath);
    }
  }
  if (els.frGraphicImg) {
    els.frGraphicImg.src = imgPath;
  }
  if (els.frGraphicLabel) {
    els.frGraphicLabel.textContent = isMoving ? '© Auto 24 • 3D Yellow Model' : '© Auto 24 • 3D Red Idle Model';
  }

  // Telemetry: Moving vs Idle vs Traffic Jam
  const isJammed = driver.moving_status === 'jammed' || Boolean(driver.in_traffic_jam);
  if (isJammed) {
    els.frStatusCode.textContent = 'JAM';
    els.frStatusText.textContent = 'TRAFFIC JAM';
    els.frStatusText.style.color = '#f59e0b';
    els.frStatusDetail.textContent = 'CONGESTION DETECTED (2+ MIN)';
    els.frCenterIconBadge.style.borderColor = 'rgba(245, 158, 11, 0.6)';
    if (els.frGraphicLabel) {
      els.frGraphicLabel.textContent = '© Auto 24 • Traffic Congestion Cluster';
    }
  } else if (isMoving) {
    els.frStatusCode.textContent = 'MOV';
    els.frStatusText.textContent = 'MOVING';
    els.frStatusText.style.color = '#ffcc00';
    els.frStatusDetail.textContent = 'TRACKING ACTIVE';
    els.frCenterIconBadge.style.borderColor = 'rgba(255, 204, 0, 0.4)';
  } else {
    els.frStatusCode.textContent = 'IDLE';
    els.frStatusText.textContent = 'STATIONARY';
    els.frStatusText.style.color = '#ff3b30';
    els.frStatusDetail.textContent = 'VEHICLE IDLE';
    els.frCenterIconBadge.style.borderColor = 'rgba(255, 59, 48, 0.4)';
  }

  // Speed Calculation
  let speedKmh = 0;
  if (driver.speed_kmh != null && Number(driver.speed_kmh) > 0) {
    speedKmh = Math.round(driver.speed_kmh);
  } else if (driver.lat != null && driver.lng != null && previousPoint && previousPoint.last_updated && driver.last_updated) {
    const timeDelta = (driver.last_updated - previousPoint.last_updated) / 1000;
    if (timeDelta > 0 && timeDelta < 30) {
      const dist = computeDistanceKm(previousPoint.lat, previousPoint.lng, Number(driver.lat), Number(driver.lng)) * 1000;
      speedKmh = Math.round((dist / timeDelta) * 3.6);
    }
  } else if (isMoving) {
    speedKmh = 18;
  }
  els.frSpeedVal.textContent = isMoving ? (speedKmh || 18) : 0;

  // Heading & Coordinates
  let heading = driver.heading || 0;
  if (driver.lat != null && driver.lng != null) {
    const lat = Number(driver.lat);
    const lng = Number(driver.lng);
    els.frMetricCoords.textContent = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

    if (previousPoint && (previousPoint.lat !== lat || previousPoint.lng !== lng)) {
      heading = computeBearing(previousPoint.lat, previousPoint.lng, lat, lng);
    }
    previousPoint = { lat, lng, last_updated: driver.last_updated };

    if (autoRecenter) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  } else {
    els.frMetricCoords.textContent = 'Waiting for GPS';
  }

  els.frMetricHeading.textContent = `${heading}° (${getCardinalDirection(heading)})`;

  // Last Ping elapsed time
  if (driver.last_updated) {
    const elapsedSec = Math.max(0, Math.round((Date.now() - Number(driver.last_updated)) / 1000));
    if (elapsedSec < 5) {
      els.frMetricPing.textContent = 'Just now';
    } else if (elapsedSec < 60) {
      els.frMetricPing.textContent = `${elapsedSec}s ago`;
    } else {
      els.frMetricPing.textContent = `${Math.round(elapsedSec / 60)}m ago`;
    }

    if (elapsedSec <= 15) {
      els.frMetricSignal.className = 'fr-cell-value text-green';
      els.frMetricSignal.textContent = '● Live (3s GPS ping)';
    } else {
      els.frMetricSignal.className = 'fr-cell-value';
      els.frMetricSignal.style.color = '#ff3b30';
      els.frMetricSignal.textContent = `● Idle (${elapsedSec}s since ping)`;
    }
  } else {
    els.frMetricPing.textContent = 'No pings recorded';
    els.frMetricSignal.textContent = '● Standby';
  }

  // Update map marker icon if present
  const id = String(driver.driver_id);
  if (activeMarkers.has(id) && driver.lat != null && driver.lng != null) {
    const marker = activeMarkers.get(id);
    marker.setLatLng([Number(driver.lat), Number(driver.lng)]);
    marker.setIcon(createVehicleIcon(driver.moving_status, driver.vehicle_no, true));
  }
}

/**
 * Poll selected driver specifically
 */
async function fetchSelectedDriverData() {
  if (!currentDriverId) return;

  try {
    const res = await fetch(`${API_BASE}/driver/${currentDriverId}`);
    if (!res.ok) {
      if (res.status === 404) {
        els.frStatusCode.textContent = 'OFF';
        els.frStatusText.textContent = 'OFFLINE';
        els.frStatusDetail.textContent = 'NOT IN DATABASE';
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const driver = await res.json();
    updateSelectedDriverCard(driver);
  } catch (err) {
    console.warn('[Viewer] Single poll error:', err.message);
  }
}

/**
 * Select a Vehicle:
 * - Hides Homepage Bar
 * - Reveals the SINGLE Flightradar24 profile card
 * - Centers camera on vehicle
 */
function selectDriver(driverId) {
  if (!driverId) return;
  currentDriverId = String(driverId);
  document.body.classList.add('has-selected-vehicle');

  els.homeBar.classList.add('hud-hidden');
  els.frCard.classList.remove('fr-hidden');

  const url = new URL(window.location);
  url.searchParams.set('driver', driverId);
  window.history.replaceState({}, '', url);

  previousPoint = null;
  autoRecenter = true;
  if (els.frRecenterBtn) {
    els.frRecenterBtn.classList.remove('fr-btn-secondary');
    els.frRecenterBtn.classList.add('fr-btn-primary');
  }

  if (activeMarkers.has(currentDriverId)) {
    const m = activeMarkers.get(currentDriverId);
    map.flyTo(m.getLatLng(), 16, { duration: 1 });
  }

  fetchNearbyVehicles();

  if (pollTimer) clearInterval(pollTimer);
  fetchSelectedDriverData();
  pollTimer = setInterval(fetchSelectedDriverData, SINGLE_DRIVER_POLL_MS);
}

/**
 * Deselect Vehicle:
 * - Hides the single profile card
 * - Returns to general map overview
 */
function deselectDriver() {
  currentDriverId = null;
  currentDriverData = null;
  document.body.classList.remove('has-selected-vehicle');

  els.homeBar.classList.remove('hud-hidden');
  els.frCard.classList.add('fr-hidden');

  const url = new URL(window.location);
  url.searchParams.delete('driver');
  url.searchParams.delete('id');
  window.history.replaceState({}, '', url.pathname);

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  fetchNearbyVehicles();

  if (userLocation) {
    map.flyTo([userLocation.lat, userLocation.lng], 15, { duration: 1 });
  }
}

/**
 * Render list of vehicles in modal
 */
function renderDriversList(filterQuery = '') {
  const query = filterQuery.toLowerCase().trim();
  let list = [...allDriversList];

  if (userLocation) {
    list.forEach((d) => {
      if (d.lat != null && d.lng != null) {
        d._distKm = computeDistanceKm(userLocation.lat, userLocation.lng, Number(d.lat), Number(d.lng));
      } else {
        d._distKm = 99999;
      }
    });
    list.sort((a, b) => a._distKm - b._distKm);
  }

  const filtered = list.filter((d) => {
    if (!query) return true;
    return (
      (d.name && d.name.toLowerCase().includes(query)) ||
      (d.vehicle_no && d.vehicle_no.toLowerCase().includes(query)) ||
      (d.model && d.model.toLowerCase().includes(query)) ||
      String(d.driver_id).includes(query)
    );
  });

  if (filtered.length === 0) {
    els.driversList.innerHTML = `
      <div class="loader-container">
        <p>No matching autos found.</p>
      </div>
    `;
    return;
  }

  els.driversList.innerHTML = filtered
    .map((d) => {
      let distanceBadge = '';
      if (d._distKm != null && d._distKm < 9999) {
        const inRadius = searchRadiusKm >= 999 || d._distKm <= searchRadiusKm;
        const color = inRadius ? '#ffcc00' : '#8b949e';
        distanceBadge = `• <span style="color: ${color}; font-weight: 600;">${formatDistance(d._distKm)}</span>`;
      }

      const isCurrent = String(d.driver_id) === String(currentDriverId);
      const isMoving = d.moving_status === 'moving';
      const badgeColor = isMoving ? '#ffcc00' : '#ff3b30';
      const iconThumb = isMoving ? './assets/auto-3d-yellow.png' : './assets/auto-3d-red.png';

      return `
        <div class="driver-item ${isCurrent ? 'selected' : ''}" data-id="${d.driver_id}">
          <img src="${iconThumb}" width="32" height="38" style="object-fit: contain; margin-right: 12px;" alt="Auto" />
          <div class="driver-item-info">
            <h4>${d.name || 'Auto Driver'} ${isCurrent ? '★' : ''}</h4>
            <p>${d.vehicle_no || 'AUTO-24'} ${distanceBadge}</p>
            <span style="font-size: 11px; color: #8b949e;">${getVehicleModelName(d)}</span>
          </div>
          <span class="driver-item-badge" style="color: ${badgeColor}; border: 1px solid ${badgeColor};">
            ${isMoving ? 'MOVING' : 'IDLE'}
          </span>
        </div>
      `;
    })
    .join('');

  els.driversList.querySelectorAll('.driver-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      selectDriver(id);
      els.modal.classList.add('hidden');
    });
  });
}

/**
 * Open Driver Selector Modal
 */
async function openDriverModal() {
  els.modal.classList.remove('hidden');
  if (els.modalSearchInput) els.modalSearchInput.value = '';
  renderDriversList();
  await fetchNearbyVehicles();
  renderDriversList(els.modalSearchInput ? els.modalSearchInput.value : '');
}

/**
 * Settings UI Setup & Handlers
 */
function setupSettingsUI() {
  function syncSettingsView() {
    if (searchRadiusKm >= 999) {
      els.radiusValText.textContent = 'Show All';
      els.radiusSlider.value = 10;
    } else {
      els.radiusValText.textContent = `${searchRadiusKm < 1 ? (searchRadiusKm * 1000) + 'm' : searchRadiusKm.toFixed(1) + ' km'}`;
      els.radiusSlider.value = searchRadiusKm;
    }

    document.querySelectorAll('.preset-chip').forEach((chip) => {
      const chipVal = chip.getAttribute('data-radius');
      const isMatch = (chipVal === 'all' && searchRadiusKm >= 999) || (parseFloat(chipVal) === searchRadiusKm);
      chip.classList.toggle('active', isMatch);
    });

    els.toggleRadiusCircle.checked = showRadarCircle;
  }

  function applyRadiusChange(newVal) {
    if (newVal === 'all' || newVal >= 999) {
      searchRadiusKm = 9999;
    } else {
      searchRadiusKm = parseFloat(newVal);
    }
    localStorage.setItem('auto24_radius_km', String(searchRadiusKm));
    syncSettingsView();
    updateRadarCircle();
    fetchNearbyVehicles();
  }

  els.radiusSlider.addEventListener('input', (e) => {
    applyRadiusChange(e.target.value);
  });

  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      applyRadiusChange(chip.getAttribute('data-radius'));
    });
  });

  els.toggleRadiusCircle.addEventListener('change', (e) => {
    showRadarCircle = e.target.checked;
    localStorage.setItem('auto24_show_radar_circle', String(showRadarCircle));
    updateRadarCircle();
  });

  if (els.settingsBtn) {
    els.settingsBtn.addEventListener('click', () => {
      syncSettingsView();
      els.settingsModal.classList.remove('hidden');
    });
  }

  if (els.closeSettingsBtn) {
    els.closeSettingsBtn.addEventListener('click', () => {
      els.settingsModal.classList.add('hidden');
    });
  }

  if (els.saveSettingsBtn) {
    els.saveSettingsBtn.addEventListener('click', () => {
      els.settingsModal.classList.add('hidden');
    });
  }

  syncSettingsView();
}

/**
 * Setup Carousel Dots for Toto Graphics / 3D Model
 */
function setupCarousel() {
  document.querySelectorAll('.fr-dot').forEach((dot) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const slide = parseInt(dot.getAttribute('data-slide'), 10);
      const isYellow = slide === 0;
      const glbPath = isYellow ? './assets/tuktuk_moving_yellow.glb' : './assets/tuktuk_idle_red.glb';
      const imgPath = isYellow ? './assets/auto-3d-yellow.png' : './assets/auto-3d-red.png';

      if (els.fr3dModel) {
        els.fr3dModel.setAttribute('src', glbPath);
      }
      if (els.frGraphicImg) {
        els.frGraphicImg.src = imgPath;
      }
      if (els.frGraphicLabel) {
        els.frGraphicLabel.textContent = isYellow ? '© Auto 24 • 3D Yellow Model' : '© Auto 24 • 3D Red Idle Model';
      }
      document.querySelectorAll('.fr-dot').forEach((d) => {
        d.classList.toggle('active', parseInt(d.getAttribute('data-slide'), 10) === slide);
      });
    });
  });
}

// Setup Event Listeners
function setupEventListeners() {
  if (els.frRecenterBtn) {
    els.frRecenterBtn.addEventListener('click', () => {
      autoRecenter = true;
      els.frRecenterBtn.classList.remove('fr-btn-secondary');
      els.frRecenterBtn.classList.add('fr-btn-primary');
      if (currentDriverId && activeMarkers.has(currentDriverId)) {
        map.flyTo(activeMarkers.get(currentDriverId).getLatLng(), 16);
      }
    });
  }

  if (els.locateMeBtn) {
    els.locateMeBtn.addEventListener('click', () => {
      els.locateMeBtn.classList.add('locating');
      if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
        map.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 1.2 });
        setTimeout(() => els.locateMeBtn.classList.remove('locating'), 1200);
      }
      initUserLocation(true);
    });
  }

  if (els.mapThemeBtn) {
    els.mapThemeBtn.addEventListener('click', () => {
      setMapTheme(!isDarkMap);
    });
  }

  if (els.nearbyCountBadge) els.nearbyCountBadge.addEventListener('click', openDriverModal);
  if (els.closeModalBtn) els.closeModalBtn.addEventListener('click', () => els.modal.classList.add('hidden'));

  if (els.frCloseBtn) els.frCloseBtn.addEventListener('click', deselectDriver);

  if (els.modalSearchInput) {
    els.modalSearchInput.addEventListener('input', (e) => {
      renderDriversList(e.target.value);
    });
  }

  if (els.loadCustomIdBtn) {
    els.loadCustomIdBtn.addEventListener('click', () => {
      const val = els.customIdInput.value.trim();
      if (val) {
        selectDriver(val);
        els.modal.classList.add('hidden');
      }
    });
  }
}

// App Startup
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupSettingsUI();
  setupCarousel();
  setupEventListeners();
  initUserLocation();
  fetchNearbyVehicles();

  const urlParams = new URLSearchParams(window.location.search);
  const driverParam = urlParams.get('driver') || urlParams.get('id');

  if (driverParam) {
    selectDriver(driverParam);
  } else {
    els.homeBar.classList.remove('hud-hidden');
    els.frCard.classList.add('fr-hidden');
  }

  overviewTimer = setInterval(fetchNearbyVehicles, NEARBY_OVERVIEW_POLL_MS);
});
