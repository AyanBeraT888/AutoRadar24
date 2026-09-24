/**
 * Auto 24 — Viewer Web App Logic
 * Real-time map tracking with Flightradar24-style single vehicle profile card
 * and 3D Indian Auto Rickshaw markers (matching user reference image).
 */

// Backend API configuration:
// Dynamic origin resolution supporting any port, domain, reverse proxy (Caddy/Nginx), or SSL.
const API_BASE = (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && !window.location.protocol.startsWith('file'))
  ? window.location.origin
  : 'http://localhost:3000';

const SINGLE_DRIVER_POLL_MS = 3000;
const NEARBY_OVERVIEW_POLL_MS = 6000;

// Application State
let map = null;
let tileLayer = null;
let isDarkMap = false; // Light mode OSM maps by default
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

  // Beacon Mode Switcher & Driver Console Elements
  beaconModeBtn: document.getElementById('beacon-mode-btn'),
  beaconModeLabel: document.getElementById('beacon-mode-label'),
  driverBroadcastBanner: document.getElementById('driver-broadcast-banner'),
  bannerDriverDetails: document.getElementById('banner-driver-details'),
  bannerOpenConsoleBtn: document.getElementById('banner-open-console-btn'),

  // Mode Switcher Modal
  modeModal: document.getElementById('mode-modal'),
  closeModeModalBtn: document.getElementById('close-mode-modal-btn'),
  saveModeModalBtn: document.getElementById('save-mode-modal-btn'),
  tabPassenger: document.getElementById('tab-passenger'),
  tabDriver: document.getElementById('tab-driver'),
  passengerModeView: document.getElementById('passenger-mode-view'),
  driverModeView: document.getElementById('driver-mode-view'),
  switchToDriverBtn: document.getElementById('switch-to-driver-btn'),
  switchToPassengerBtn: document.getElementById('switch-to-passenger-btn'),
  passengerFleetCount: document.getElementById('passenger-fleet-count'),
  passengerRadiusDisplay: document.getElementById('passenger-radius-display'),

  // Driver Console Cockpit Elements
  driverInputVehicle: document.getElementById('driver-input-vehicle'),
  driverInputName: document.getElementById('driver-input-name'),
  driverToggleBroadcastBtn: document.getElementById('driver-toggle-broadcast-btn'),
  driverBroadcastBtnText: document.getElementById('driver-broadcast-btn-text'),
  telStatus: document.getElementById('tel-status'),
  telSpeed: document.getElementById('tel-speed'),
  telAccuracy: document.getElementById('tel-accuracy'),
  telPings: document.getElementById('tel-pings'),
  gpsBlockedAlert: document.getElementById('gps-blocked-alert'),
  retryGpsBtn: document.getElementById('retry-gps-btn'),
  startSimulatedDriverBtn: document.getElementById('start-simulated-driver-btn'),

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

  // Skeletal Map & Offline Fallback Elements
  mapSkeleton: document.getElementById('map-skeleton'),
  skeletonStatusText: document.getElementById('skeleton-status-text'),
  fallbackScreen: document.getElementById('offline-fallback-screen'),
  fallbackTargetUrl: document.getElementById('fallback-target-url'),
  fallbackReconnectBtn: document.getElementById('fallback-reconnect-btn'),
  fallbackCountdownText: document.getElementById('fallback-countdown-text'),
  networkToast: document.getElementById('network-toast-banner'),
  toastRetryBtn: document.getElementById('toast-retry-btn'),
  toastMsg: document.getElementById('network-toast-msg'),
};

// Network & Fallback State
let hasLoadedSuccessfully = false;
let consecutiveErrors = 0;
let retryCountdown = 5;
let retryCountdownTimer = null;
let slowNetworkTimer = null;

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
    attributionControl: false,
  }).setView([12.9716, 77.5946], 14);

  setMapTheme(isDarkMap);

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
let hasRealGpsFix = false;

/**
 * Set User Location, Render Blue Pulsing Beacon, and Center Map
 */
function setUserLocationAndCenter(lat, lng, shouldCenter = true, isRealGps = false) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;

  // If we already received real device GPS, ignore stale/approximate IP estimates
  if (!isRealGps && hasRealGpsFix) {
    console.log('[Viewer] Ignoring approximate IP location because real GPS is active');
    return;
  }

  if (isRealGps) {
    hasRealGpsFix = true;
  }

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

  const tooltipText = isRealGps ? 'Your Location (GPS)' : 'Approximate Location (IP/Network)';

  if (!userMarker) {
    userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    userMarker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -12] });
  } else {
    userMarker.setLatLng([lat, lng]);
    userMarker.setTooltipContent(tooltipText);
  }

  // Always center if requested, or if real GPS has arrived for the first time
  if ((shouldCenter || !hasInitiallyCentered) && map) {
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
      forceCenter || !hasInitiallyCentered,
      true
    );
  };

  const onFinalError = async () => {
    // If native GPS bridge already supplied real coordinates, skip IP fallback completely
    if (hasRealGpsFix) {
      if (els.locateMeBtn) els.locateMeBtn.classList.remove('locating');
      return;
    }

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
            forceCenter || !hasInitiallyCentered,
            false // Marked as IP fallback
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
        setUserLocationAndCenter(pos.coords.latitude, pos.coords.longitude, false, true);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
  } catch (err) {}
}

// Native App Bridge: allows React Native WebView (viewer-app) to inject precise GPS directly
window.handleNativeLocation = function (lat, lng, accuracy, forceCenter = false) {
  console.log('[Viewer Native Bridge] Received real device GPS:', lat, lng, 'accuracy:', accuracy);
  const shouldCenter = forceCenter || !hasRealGpsFix || !hasInitiallyCentered;
  setUserLocationAndCenter(Number(lat), Number(lng), shouldCenter, true);
};

// Listen for messages from React Native WebView
window.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && (data.type === 'USER_LOCATION' || data.type === 'LOCATION')) {
      window.handleNativeLocation(data.lat, data.lng, data.accuracy, data.forceCenter);
    }
  } catch (e) {}
});
document.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && (data.type === 'USER_LOCATION' || data.type === 'LOCATION')) {
      window.handleNativeLocation(data.lat, data.lng, data.accuracy, data.forceCenter);
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
 * Dismiss Skeletal Map Animation
 */
function dismissSkeletonMap() {
  if (els.mapSkeleton && !els.mapSkeleton.classList.contains('hidden')) {
    setTimeout(() => {
      els.mapSkeleton.classList.add('hidden');
    }, 300);
    if (slowNetworkTimer) clearTimeout(slowNetworkTimer);
  }
}

/**
 * Show Fullscreen Fallback Screen
 */
function showFallbackScreen(errMsg = '') {
  dismissSkeletonMap();
  if (els.fallbackScreen) {
    els.fallbackScreen.classList.remove('hidden');
    if (els.fallbackTargetUrl) {
      els.fallbackTargetUrl.textContent = API_BASE || window.location.origin;
    }
    startFallbackCountdown();
  }
}

/**
 * Hide Fullscreen Fallback Screen
 */
function hideFallbackScreen() {
  if (els.fallbackScreen) {
    els.fallbackScreen.classList.add('hidden');
    if (retryCountdownTimer) {
      clearInterval(retryCountdownTimer);
      retryCountdownTimer = null;
    }
  }
}

/**
 * Show / Hide Floating Network Toast Banner
 */
function showNetworkToast(msg = 'Reconnecting to AutoRadar18 radar...') {
  if (els.networkToast) {
    if (els.toastMsg) els.toastMsg.textContent = msg;
    els.networkToast.classList.remove('hidden');
  }
}

function hideNetworkToast() {
  if (els.networkToast) {
    els.networkToast.classList.add('hidden');
  }
}

/**
 * Auto-retry Countdown Manager
 */
function startFallbackCountdown() {
  if (retryCountdownTimer) clearInterval(retryCountdownTimer);
  retryCountdown = 5;
  if (els.fallbackCountdownText) {
    els.fallbackCountdownText.textContent = `Auto-retrying in ${retryCountdown} seconds...`;
  }
  retryCountdownTimer = setInterval(() => {
    retryCountdown--;
    if (retryCountdown <= 0) {
      clearInterval(retryCountdownTimer);
      retryCountdownTimer = null;
      retryConnection();
    } else if (els.fallbackCountdownText) {
      els.fallbackCountdownText.textContent = `Auto-retrying in ${retryCountdown} seconds...`;
    }
  }, 1000);
}

/**
 * Manual or Automatic Reconnect Attempt
 */
async function retryConnection() {
  const btnText = document.getElementById('fallback-reconnect-btn-text');
  if (btnText) btnText.textContent = 'Scanning Radar...';
  if (els.fallbackReconnectBtn) els.fallbackReconnectBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-cache' });
    if (res.ok) {
      hideFallbackScreen();
      hideNetworkToast();
      consecutiveErrors = 0;
      hasLoadedSuccessfully = true;
      await fetchNearbyVehicles();
      if (btnText) btnText.textContent = 'Re-Scan Network';
      if (els.fallbackReconnectBtn) els.fallbackReconnectBtn.disabled = false;
      return;
    }
  } catch (e) {
    console.warn('[Auto 24] Reconnect attempt failed:', e.message);
  }

  if (btnText) btnText.textContent = 'Re-Scan Network';
  if (els.fallbackReconnectBtn) els.fallbackReconnectBtn.disabled = false;
  startFallbackCountdown();
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

    hasLoadedSuccessfully = true;
    consecutiveErrors = 0;
    dismissSkeletonMap();
    hideFallbackScreen();
    hideNetworkToast();

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

    // Automatic Radius Expansion:
    // If no autos are found within the user's initial radius, automatically expand the radar radius to find nearest autos
    if (userLocation && countInRadius === 0 && searchRadiusKm < 999 && drivers.length > 0) {
      let nearestDistKm = Infinity;
      drivers.forEach((driver) => {
        if (driver.lat != null && driver.lng != null) {
          const d = computeDistanceKm(userLocation.lat, userLocation.lng, Number(driver.lat), Number(driver.lng));
          if (d < nearestDistKm) {
            nearestDistKm = d;
          }
        }
      });

      if (nearestDistKm !== Infinity && nearestDistKm > searchRadiusKm && nearestDistKm <= 25) {
        let expandedRadius = searchRadiusKm;
        if (nearestDistKm <= 2.0) expandedRadius = 2.0;
        else if (nearestDistKm <= 3.0) expandedRadius = 3.0;
        else if (nearestDistKm <= 5.0) expandedRadius = 5.0;
        else if (nearestDistKm <= 10.0) expandedRadius = 10.0;
        else expandedRadius = Math.min(25, Math.ceil(nearestDistKm));

        if (expandedRadius > searchRadiusKm) {
          searchRadiusKm = expandedRadius;
          localStorage.setItem('auto24_radius_km', String(searchRadiusKm));
          updateRadarCircle();
          showNetworkToast(`🔍 Radar auto-expanded to ${searchRadiusKm} km to locate nearest autos`);

          // Re-evaluate drivers with expanded radius
          countInRadius = 0;
          drivers.forEach((driver) => {
            const id = String(driver.driver_id);
            if (driver.lat != null && driver.lng != null) {
              const dKm = computeDistanceKm(userLocation.lat, userLocation.lng, Number(driver.lat), Number(driver.lng));
              if (dKm <= searchRadiusKm) {
                countInRadius++;
                currentRenderedIds.add(id);
                const isSelected = String(currentDriverId) === id;
                const icon = createVehicleIcon(driver.moving_status, driver.vehicle_no, isSelected);
                if (!activeMarkers.has(id)) {
                  const marker = L.marker([Number(driver.lat), Number(driver.lng)], { icon }).addTo(map);
                  marker.on('click', () => selectDriver(driver.driver_id));
                  activeMarkers.set(id, marker);
                } else {
                  activeMarkers.get(id).setLatLng([Number(driver.lat), Number(driver.lng)]).setIcon(icon);
                }
              }
            }
          });
        }
      }
    }

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
        els.nearbyCountText.textContent = `${countInRadius} ${countInRadius === 1 ? 'Auto' : 'Autos'} in Radar (${radiusStr})`;
      }
    }

    if (els.passengerFleetCount) {
      els.passengerFleetCount.textContent = `${countInRadius} in radar`;
    }

    // Sync live radar count to native mobile app (viewer-app)
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'RADAR_COUNT_UPDATE',
          count: countInRadius,
          radiusKm: searchRadiusKm,
        }));
      }
    } catch {}
  } catch (err) {
    consecutiveErrors++;
    console.warn('[Viewer] Could not refresh nearby autos:', err.message);
    if (!hasLoadedSuccessfully) {
      showFallbackScreen(err.message);
    } else if (consecutiveErrors >= 2) {
      showNetworkToast('⚡ Signal Lost • Auto-reconnecting to radar...');
    }
  }
}

/**
 * Update the COMPACT Vehicle Telemetry Card
 * Strictly keep info only about:
 * 1. Owner Name
 * 2. If they put no. of toto then otherwise null
 * 3. Current Speed
 * 4. Heading / Bearing
 * 5. Signal with Ping
 */
function updateSelectedDriverCard(driver) {
  if (!driver) return;
  currentDriverData = driver;

  // 1. Owner Name
  const rawOwner = driver.name ? String(driver.name).trim() : '';
  const displayOwner = (rawOwner !== '' && rawOwner.toLowerCase() !== 'null' && rawOwner.toLowerCase() !== 'undefined')
    ? rawOwner
    : 'null';
  if (els.frOwnerName) {
    els.frOwnerName.textContent = displayOwner;
    els.frOwnerName.title = displayOwner;
  }

  // 2. No. of Toto (if they put no. of toto then otherwise null)
  const rawPlate = driver.vehicle_no ? String(driver.vehicle_no).trim() : '';
  const hasValidPlate = rawPlate !== '' && rawPlate.toLowerCase() !== 'null' && rawPlate.toLowerCase() !== 'undefined';
  const displayPlate = hasValidPlate ? rawPlate : 'null';

  if (els.frVehicleNo) {
    els.frVehicleNo.textContent = displayPlate;
    if (displayPlate === 'null') {
      els.frVehicleNo.classList.add('text-null');
    } else {
      els.frVehicleNo.classList.remove('text-null');
    }
  }

  // 3. Current Speed
  const isMoving = driver.moving_status === 'moving';
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
  if (els.frSpeedVal) {
    els.frSpeedVal.textContent = isMoving ? (speedKmh || 18) : 0;
  }

  // 4. Heading / Bearing
  let heading = driver.heading || 0;
  if (driver.lat != null && driver.lng != null) {
    const lat = Number(driver.lat);
    const lng = Number(driver.lng);

    if (previousPoint && (previousPoint.lat !== lat || previousPoint.lng !== lng)) {
      heading = computeBearing(previousPoint.lat, previousPoint.lng, lat, lng);
    }
    previousPoint = { lat, lng, last_updated: driver.last_updated };

    if (autoRecenter) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  }
  if (els.frMetricHeading) {
    els.frMetricHeading.innerHTML = `${Math.round(heading)}° <span class="sub-text">(${getCardinalDirection(heading)})</span>`;
  }

  // 5. Signal with Ping
  const signalDot = document.getElementById('signal-dot');
  if (driver.last_updated) {
    const elapsedSec = Math.max(0, Math.round((Date.now() - Number(driver.last_updated)) / 1000));
    let pingText = '';
    if (elapsedSec < 5) {
      pingText = 'Just now';
    } else if (elapsedSec < 60) {
      pingText = `${elapsedSec}s ago`;
    } else {
      pingText = `${Math.round(elapsedSec / 60)}m ago`;
    }

    if (els.frMetricPing) {
      els.frMetricPing.textContent = `(${pingText})`;
    }

    if (els.frMetricSignal) {
      if (elapsedSec <= 15) {
        els.frMetricSignal.className = 'status-text';
        els.frMetricSignal.innerHTML = `Live <span id="fr-metric-ping" class="sub-text">(${pingText})</span>`;
        if (signalDot) signalDot.className = 'signal-dot-ring';
      } else {
        els.frMetricSignal.className = 'status-text idle';
        els.frMetricSignal.innerHTML = `Idle <span id="fr-metric-ping" class="sub-text">(${pingText})</span>`;
        if (signalDot) signalDot.className = 'signal-dot-ring idle';
      }
    }
  } else {
    if (els.frMetricPing) els.frMetricPing.textContent = '(None)';
    if (els.frMetricSignal) {
      els.frMetricSignal.className = 'status-text idle';
      els.frMetricSignal.innerHTML = `Standby <span id="fr-metric-ping" class="sub-text">(Waiting)</span>`;
      if (signalDot) signalDot.className = 'signal-dot-ring idle';
    }
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
        const signalDot = document.getElementById('signal-dot');
        if (els.frMetricSignal) {
          els.frMetricSignal.className = 'status-text offline';
          els.frMetricSignal.innerHTML = `Offline <span class="sub-text">(Not found)</span>`;
        }
        if (signalDot) signalDot.className = 'signal-dot-ring offline';
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

  // Device Permissions & Services Toggles
  function setupPermissionSwitch(id, altId, onChange) {
    const sw1 = document.getElementById(id);
    const sw2 = altId ? document.getElementById(altId) : null;
    const handleChange = (checked) => {
      if (sw1) sw1.checked = checked;
      if (sw2) sw2.checked = checked;
      onChange(checked);
    };
    if (sw1) sw1.addEventListener('change', (e) => handleChange(e.target.checked));
    if (sw2) sw2.addEventListener('change', (e) => handleChange(e.target.checked));
  }

  // 1. Precise Location (GPS) Toggle
  setupPermissionSwitch('toggle-perm-gps', 'toggle-perm-gps-modal', (enabled) => {
    if (enabled) {
      // Re-enable GPS if previously declined or turned off
      initUserLocation(true);
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION' }));
      }
    } else {
      if (userMarker && map) {
        map.removeLayer(userMarker);
        userMarker = null;
      }
      if (radarCircleLayer && map) {
        map.removeLayer(radarCircleLayer);
        radarCircleLayer = null;
      }
      userLocation = null;
      showNetworkToast('📍 GPS Location Disabled');
    }
  });

  // 2. Motion & Compass Toggle
  setupPermissionSwitch('toggle-perm-motion', 'toggle-perm-motion-modal', (enabled) => {
    localStorage.setItem('auto24_motion_enabled', String(enabled));
    if (!enabled) {
      showNetworkToast('🧭 Compass & Heading Tracking Paused');
    } else {
      showNetworkToast('🧭 Compass & Orientation Enabled');
    }
  });

  // 3. Network & Telemetry Toggle
  setupPermissionSwitch('toggle-perm-network', 'toggle-perm-network-modal', (enabled) => {
    localStorage.setItem('auto24_network_enabled', String(enabled));
    if (!enabled) {
      if (overviewTimer) {
        clearInterval(overviewTimer);
        overviewTimer = null;
      }
      showNetworkToast('🌐 Cloud Telemetry Paused');
    } else {
      if (!overviewTimer) {
        overviewTimer = setInterval(fetchNearbyVehicles, NEARBY_OVERVIEW_POLL_MS);
      }
      fetchNearbyVehicles();
      showNetworkToast('🌐 Cloud Telemetry Streaming Active');
    }
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
      try {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION' }));
        }
      } catch {}
      if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
        map.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 1.2 });
        setTimeout(() => els.locateMeBtn.classList.remove('locating'), 1200);
      }
      initUserLocation(true);
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

  if (els.fallbackReconnectBtn) {
    els.fallbackReconnectBtn.addEventListener('click', () => {
      retryConnection();
    });
  }

  if (els.toastRetryBtn) {
    els.toastRetryBtn.addEventListener('click', () => {
      retryConnection();
    });
  }

  // Network State Change Listeners
  window.addEventListener('online', () => {
    hideNetworkToast();
    retryConnection();
  });

  window.addEventListener('offline', () => {
    if (!hasLoadedSuccessfully) {
      showFallbackScreen('Device network is offline');
    } else {
      showNetworkToast('⚡ Network Offline • Attempting to reconnect...');
    }
  });
}

// =========================================================
// TRANSIT MODE & DRIVER BEACON BROADCASTING LOGIC
// =========================================================

let currentAppMode = localStorage.getItem('auto24_active_mode') || 'passenger';
let isDriverBroadcasting = false;
let driverWatchId = null;
let broadcastPingCount = 0;
let driverDeviceId = localStorage.getItem('auto24_driver_device_id');
if (!driverDeviceId) {
  driverDeviceId = 'dev_web_' + Math.random().toString(36).substring(2, 11);
  localStorage.setItem('auto24_driver_device_id', driverDeviceId);
}
let registeredDriverId = localStorage.getItem('auto24_registered_driver_id');

function syncModeUI() {
  const isDriver = currentAppMode === 'driver';
  if (els.beaconModeBtn) {
    els.beaconModeBtn.classList.toggle('driver-active', isDriver);
  }
  if (els.beaconModeLabel) {
    els.beaconModeLabel.textContent = isDriver ? 'Driver' : 'Passenger';
  }
  if (els.tabPassenger && els.tabDriver) {
    els.tabPassenger.classList.toggle('active', !isDriver);
    els.tabDriver.classList.toggle('active', isDriver);
  }
  if (els.passengerModeView && els.driverModeView) {
    els.passengerModeView.classList.toggle('hidden', isDriver);
    els.driverModeView.classList.toggle('hidden', !isDriver);
  }
  if (els.passengerRadiusDisplay) {
    els.passengerRadiusDisplay.textContent = searchRadiusKm >= 999 ? 'All Active' : `${searchRadiusKm.toFixed(1)} km`;
  }
  if (els.driverBroadcastBanner) {
    els.driverBroadcastBanner.classList.toggle('hidden', !isDriverBroadcasting);
  }
}

function setAppMode(mode) {
  currentAppMode = mode;
  localStorage.setItem('auto24_active_mode', mode);
  syncModeUI();
}

async function registerDriverIfNeeded() {
  const vehicle = (els.driverInputVehicle?.value || 'WB20B4455').trim().toUpperCase();
  const name = (els.driverInputName?.value || 'Oishik Mondal').trim();
  
  try {
    const res = await fetch(`${API_BASE}/register-driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone: '9876543210',
        vehicle_no: vehicle,
        device_id: driverDeviceId,
      }),
    });
    const data = await res.json();
    if (data && data.driver && data.driver.driver_id) {
      registeredDriverId = data.driver.driver_id;
      localStorage.setItem('auto24_registered_driver_id', String(registeredDriverId));
      return registeredDriverId;
    }
  } catch (e) {
    console.warn('[Driver] Registration check fallback:', e);
  }
  return registeredDriverId || 1;
}

async function broadcastDriverPosition(pos) {
  if (!pos || !pos.coords) return;
  const { latitude, longitude, speed, accuracy } = pos.coords;

  broadcastPingCount++;
  if (els.telPings) els.telPings.textContent = String(broadcastPingCount);
  if (els.telSpeed) els.telSpeed.textContent = speed ? `${Math.round(speed * 3.6)} km/h` : '0 km/h';
  if (els.telAccuracy) els.telAccuracy.textContent = accuracy ? `±${Math.round(accuracy)}m` : '--';

  const driverId = registeredDriverId || (await registerDriverIfNeeded());
  try {
    const res = await fetch(`${API_BASE}/drivers/${driverId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: latitude,
        lng: longitude,
        device_id: driverDeviceId,
        speed: speed || 0,
        accuracy: accuracy || 0,
      }),
    });
    if (res.ok) {
      if (els.telStatus) {
        els.telStatus.textContent = 'ONLINE';
        els.telStatus.className = 'telemetry-val on';
      }
      if (els.bannerDriverDetails) {
        const vehicle = els.driverInputVehicle?.value || 'WB20B4455';
        els.bannerDriverDetails.textContent = `${vehicle} • Telemetry broadcast active (ping #${broadcastPingCount})`;
      }
    }
  } catch (err) {
    console.warn('[Driver] Broadcast sync error:', err);
  }
}

let isSimulationActive = false;
let simulationInterval = null;
let simAngle = 0;

function hideGpsBlockedAlert() {
  if (els.gpsBlockedAlert) {
    els.gpsBlockedAlert.classList.add('hidden');
  }
}

function showGpsBlockedAlert(reason = 'PERMISSION_DENIED') {
  if (els.gpsBlockedAlert) {
    els.gpsBlockedAlert.classList.remove('hidden');
  }
  if (els.telStatus) {
    els.telStatus.textContent = 'GPS BLOCKED';
    els.telStatus.className = 'telemetry-val off';
  }
}

function startSimulatedDriver() {
  hideGpsBlockedAlert();
  if (driverWatchId !== null) {
    navigator.geolocation.clearWatch(driverWatchId);
    driverWatchId = null;
  }
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }

  isSimulationActive = true;
  isDriverBroadcasting = true;
  broadcastPingCount = 0;

  if (els.driverToggleBroadcastBtn) {
    els.driverToggleBroadcastBtn.classList.add('broadcasting');
  }
  if (els.driverBroadcastBtnText) {
    els.driverBroadcastBtnText.textContent = 'STOP TRANSMITTING / GO OFFLINE';
  }
  if (els.telStatus) {
    els.telStatus.textContent = 'ONLINE (DEMO)';
    els.telStatus.className = 'telemetry-val on';
  }

  registerDriverIfNeeded();

  // Base coordinates: user location or default Kolkata transit node
  const baseLat = (userLocation && typeof userLocation.lat === 'number') ? userLocation.lat : 22.5726;
  const baseLng = (userLocation && typeof userLocation.lng === 'number') ? userLocation.lng : 88.3639;

  const simulateStep = () => {
    if (!isDriverBroadcasting || !isSimulationActive) return;
    simAngle = (simAngle + 0.08) % (2 * Math.PI);
    const lat = baseLat + 0.0035 * Math.sin(simAngle);
    const lng = baseLng + 0.0045 * Math.cos(simAngle);
    const speed = 7.5 + 2.5 * Math.sin(simAngle * 2); // ~27-36 km/h

    broadcastDriverPosition({
      coords: {
        latitude: lat,
        longitude: lng,
        speed: speed,
        accuracy: 4,
      }
    });

    if (els.telStatus) {
      els.telStatus.textContent = 'ONLINE (DEMO)';
      els.telStatus.className = 'telemetry-val on';
    }
  };

  simulateStep();
  simulationInterval = setInterval(simulateStep, 2500);
  syncModeUI();
}

function startDriverBroadcasting() {
  hideGpsBlockedAlert();
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  isSimulationActive = false;

  if (!navigator.geolocation) {
    showGpsBlockedAlert('NOT_SUPPORTED');
    return;
  }

  isDriverBroadcasting = true;
  broadcastPingCount = 0;
  if (els.driverToggleBroadcastBtn) {
    els.driverToggleBroadcastBtn.classList.add('broadcasting');
  }
  if (els.driverBroadcastBtnText) {
    els.driverBroadcastBtnText.textContent = 'STOP TRANSMITTING / GO OFFLINE';
  }
  if (els.telStatus) {
    els.telStatus.textContent = 'CONNECTING...';
    els.telStatus.className = 'telemetry-val on';
  }

  registerDriverIfNeeded();

  const onWatchError = (err) => {
    console.warn('[Driver] Geolocation error:', err);
    showGpsBlockedAlert(err && err.code === 1 ? 'PERMISSION_DENIED' : 'UNAVAILABLE');
  };

  // Try GPS with multi-stage fallback (High accuracy -> Balanced accuracy)
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      broadcastDriverPosition(pos);
      driverWatchId = navigator.geolocation.watchPosition(
        (p) => broadcastDriverPosition(p),
        onWatchError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
      );
    },
    (err) => {
      console.warn('[Driver] High accuracy location failed, attempting balanced mode:', err);
      if (err && err.code === 1) {
        // User explicitly denied permission in browser
        onWatchError(err);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          broadcastDriverPosition(pos);
          driverWatchId = navigator.geolocation.watchPosition(
            (p) => broadcastDriverPosition(p),
            onWatchError,
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
          );
        },
        () => {
          onWatchError(err);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
  );

  syncModeUI();
}

function stopDriverBroadcasting() {
  isDriverBroadcasting = false;
  isSimulationActive = false;
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  if (driverWatchId !== null) {
    navigator.geolocation.clearWatch(driverWatchId);
    driverWatchId = null;
  }
  hideGpsBlockedAlert();

  if (els.driverToggleBroadcastBtn) {
    els.driverToggleBroadcastBtn.classList.remove('broadcasting');
  }
  if (els.driverBroadcastBtnText) {
    els.driverBroadcastBtnText.textContent = 'START TRANSMITTING / GO ONLINE';
  }
  if (els.telStatus) {
    els.telStatus.textContent = 'OFFLINE';
    els.telStatus.className = 'telemetry-val off';
  }
  syncModeUI();
}

function toggleDriverBroadcast() {
  if (isDriverBroadcasting) {
    stopDriverBroadcasting();
  } else {
    startDriverBroadcasting();
  }
}

function setupModeSwitcherUI() {
  if (els.beaconModeBtn) {
    els.beaconModeBtn.addEventListener('click', () => {
      syncModeUI();
      els.modeModal.classList.remove('hidden');
    });
  }

  if (els.bannerOpenConsoleBtn) {
    els.bannerOpenConsoleBtn.addEventListener('click', () => {
      setAppMode('driver');
      els.modeModal.classList.remove('hidden');
    });
  }

  if (els.closeModeModalBtn) {
    els.closeModeModalBtn.addEventListener('click', () => {
      els.modeModal.classList.add('hidden');
    });
  }

  if (els.saveModeModalBtn) {
    els.saveModeModalBtn.addEventListener('click', () => {
      els.modeModal.classList.add('hidden');
    });
  }

  if (els.tabPassenger) {
    els.tabPassenger.addEventListener('click', () => setAppMode('passenger'));
  }

  if (els.tabDriver) {
    els.tabDriver.addEventListener('click', () => setAppMode('driver'));
  }

  if (els.switchToDriverBtn) {
    els.switchToDriverBtn.addEventListener('click', () => setAppMode('driver'));
  }

  if (els.switchToPassengerBtn) {
    els.switchToPassengerBtn.addEventListener('click', () => setAppMode('passenger'));
  }

  if (els.driverToggleBroadcastBtn) {
    els.driverToggleBroadcastBtn.addEventListener('click', toggleDriverBroadcast);
  }

  if (els.retryGpsBtn) {
    els.retryGpsBtn.addEventListener('click', () => {
      startDriverBroadcasting();
    });
  }

  if (els.startSimulatedDriverBtn) {
    els.startSimulatedDriverBtn.addEventListener('click', () => {
      startSimulatedDriver();
    });
  }

  syncModeUI();
}

// App Startup
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupSettingsUI();
  setupCarousel();
  setupEventListeners();
  setupModeSwitcherUI();
  initUserLocation();

  // Notify native container that the map is ready for GPS injection
  try {
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
    }
  } catch {}

  // Slow network helper: If map skeleton is still displayed after 3.5s, inform the user
  slowNetworkTimer = setTimeout(() => {
    if (els.skeletonStatusText && els.mapSkeleton && !els.mapSkeleton.classList.contains('hidden')) {
      els.skeletonStatusText.textContent = 'SLOW NETWORK DETECTED • OPTIMIZING SATELLITE RADAR...';
    }
  }, 3500);

  fetchNearbyVehicles();

  const urlParams = new URLSearchParams(window.location.search);
  const driverParam = urlParams.get('driver') || urlParams.get('id');

  overviewTimer = setInterval(fetchNearbyVehicles, NEARBY_OVERVIEW_POLL_MS);
});

// Native Bridge Helpers
window.openSettingsModal = function () {
  if (els.settingsModal) {
    els.settingsModal.classList.remove('hidden');
    const syncFn = window._syncSettingsView || (typeof syncSettingsView === 'function' ? syncSettingsView : null);
    if (syncFn) syncFn();
  }
};

if (typeof window !== 'undefined' && window.ReactNativeWebView) {
  document.body.classList.add('in-webview');
}

// React Native WebView message bridge for actions
window.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && data.type === 'OPEN_RADAR_SETTINGS') {
      window.openSettingsModal();
    }
  } catch (e) {}
});
