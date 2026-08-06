const form = document.querySelector("#tracking-form");
const trackingInput = document.querySelector("#tracking-id");
const headerTrackingId = document.querySelector("#header-tracking-id");
const alertBox = document.querySelector("#alert");
const parcelTitle = document.querySelector("#parcel-title");
const statusPill = document.querySelector("#status-pill");
const summaryGrid = document.querySelector("#summary-grid");
const deliveryRecipient = document.querySelector("#delivery-recipient");
const deliveryAddress = document.querySelector("#delivery-address");
const statusTimeline = document.querySelector("#status-timeline");
const etaLarge = document.querySelector("#eta-large");
const progressCopy = document.querySelector("#progress-copy");
const progressFill = document.querySelector("#progress-fill");
const routeCompleted = document.querySelector("#route-completed");
const routeRemaining = document.querySelector("#route-remaining");
const routeTotal = document.querySelector("#route-total");
const historyList = document.querySelector("#history-list");
const fleetList = document.querySelector("#fleet-list");
const parcelList = document.querySelector("#parcel-list");
const blePanel = document.querySelector("#ble-panel");
const bleMapForm = document.querySelector("#ble-map-form");
const mapTagInput = document.querySelector("#map-tag");
const mapMacInput = document.querySelector("#map-mac");
const mapTrackingInput = document.querySelector("#map-tracking");
const mappingList = document.querySelector("#mapping-list");
const bleMapRefresh = document.querySelector("#ble-map-refresh");

const bleSimForm = document.querySelector("#ble-sim-form");
const simTagInput = document.querySelector("#sim-tag");
const simMacInput = document.querySelector("#sim-mac");
const simRssiInput = document.querySelector("#sim-rssi");
const simBattInput = document.querySelector("#sim-batt");
const simTrackingInput = document.querySelector("#sim-tracking");
const bleEventsList = document.querySelector("#ble-events-list");
const bleEventsRefresh = document.querySelector("#ble-events-refresh");
const bleEventsFilterInput = document.querySelector("#ble-events-filter");
const bleEventsFilterClear = document.querySelector("#ble-events-filter-clear");
const speedSelect = document.querySelector("#speed-select");
const restartButton = document.querySelector("#restart-button");
const tickButton = document.querySelector("#tick-button");
const refreshButton = document.querySelector("#refresh-button");
const connectionStatus = document.querySelector("#connection-status");
const privacyModeToggle = document.querySelector("#privacy-mode-toggle");
const mapCanvas = document.querySelector("#map");
const mapCaption = document.querySelector(".map-caption");
let bleEventsCache = [];
let selectedBleTagId = null;

let eventSource;
let currentTrackingId = trackingInput.value.trim().toUpperCase();
let map;
let currentAreaMarker;
let initialDeliveriesBeforeYours = null;
let bleEventsFilterValue = "";
let privacyModeEnabled = false;
let currentTrackingData = null;

initMap();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  track(trackingInput.value);
});

privacyModeToggle.addEventListener("change", () => {
  privacyModeEnabled = privacyModeToggle.checked;
  if (currentTrackingData) {
    updateMapVisibility(currentTrackingData);
  }
});

speedSelect.addEventListener("change", async () => {
  await postJson("/api/simulation/speed", { multiplier: Number(speedSelect.value) });
  await loadSimulation();
});

restartButton.addEventListener("click", async () => {
  await postJson("/api/simulation/restart", {});
  await loadSimulation();
  await track(currentTrackingId);
});

tickButton.addEventListener("click", async () => {
  await postJson("/api/simulation/tick", {});
  await loadSimulation();
  await fetchTracking(currentTrackingId);
});

refreshButton.addEventListener("click", loadSimulation);

async function track(rawTrackingId) {
  const trackingId = rawTrackingId.trim().toUpperCase();
  if (!trackingId) {
    showAlert("Enter a tracking ID.");
    return;
  }

  currentTrackingId = trackingId;
  initialDeliveriesBeforeYours = null;
  trackingInput.value = trackingId;
  headerTrackingId.textContent = trackingId;
  await fetchTracking(trackingId);
  subscribe(trackingId);
}

async function fetchTracking(trackingId) {
  try {
    const response = await fetch(`/api/parcels/${encodeURIComponent(trackingId)}`);
    if (!response.ok) {
      throw new Error(response.status === 404 ? "Tracking ID not found." : "Unable to load tracking data.");
    }
    const data = await response.json();
    hideAlert();
    renderTracking(data);
  } catch (error) {
    showAlert(error.message);
    setConnection("Disconnected", false);
  }
}

function subscribe(trackingId) {
  if (eventSource) {
    eventSource.close();
  }

  setConnection("Connecting", false);
  eventSource = new EventSource(`/api/parcels/${encodeURIComponent(trackingId)}/events`);
  eventSource.addEventListener("open", () => setConnection("Live updates", true));
  eventSource.addEventListener("tracking", (event) => {
    renderTracking(JSON.parse(event.data));
    hideAlert();
  });
  eventSource.addEventListener("error", () => {
    setConnection("Reconnecting", false);
  });
}

// -- Privacy mode & map visibility helpers --
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findProximityClusters(parcels, threshold = 100) {
  if (parcels.length === 0) return [];
  
  const clusters = [];
  const visited = new Set();
  
  for (const parcel of parcels) {
    if (visited.has(parcel.trackingId)) continue;
    
    const cluster = [parcel];
    visited.add(parcel.trackingId);
    
    for (const other of parcels) {
      if (visited.has(other.trackingId)) continue;
      const distance = calculateDistance(
        parcel.destination.lat, parcel.destination.lng,
        other.destination.lat, other.destination.lng
      );
      if (distance <= threshold) {
        cluster.push(other);
        visited.add(other.trackingId);
      }
    }
    
    clusters.push(cluster);
  }
  
  return clusters;
}

function calculateRevealDistance(trackingData) {
  const parcels = trackingData.truckParcels || [];
  if (parcels.length === 0) return 2;
  
  const clusters = findProximityClusters(parcels);
  const currentDeliveryStop = trackingData.deliveryStopNumber;
  
  // Find the cluster containing the current delivery
  for (const cluster of clusters) {
    const hasCurrentDelivery = cluster.some(p => p.deliveryStopNumber === currentDeliveryStop);
    if (hasCurrentDelivery) {
      if (cluster.length >= 5) {
        // 5 or more deliveries to same location: reveal 2 stops before
        return 2;
      } else if (cluster.length > 1) {
        // Multiple deliveries within 100m: reveal 3 stops before
        return 3;
      }
    }
  }
  
  // Default: reveal 2 stops before
  return 2;
}

function shouldShowMapTracking(trackingData) {
  if (!privacyModeEnabled) return true;
  if (trackingData.status === "delivered") return true;
  
  const revealDistance = calculateRevealDistance(trackingData);
  const stopsBeforeDelivery = trackingData.scheduledDeliveriesBeforeYours || 0;
  
  return stopsBeforeDelivery <= revealDistance;
}

function updateMapVisibility(trackingData) {
  const shouldShow = shouldShowMapTracking(trackingData);
  
  // Remove any existing color classes from caption
  mapCaption.classList.remove("tracking-hidden", "tracking-visible");
  
  // Only apply colors when privacy mode is OFF
  if (!privacyModeEnabled) {
    if (shouldShow) {
      // Close to delivery: green
      mapCaption.classList.add("tracking-visible");
    } else {
      // Far from delivery: yellow
      mapCaption.classList.add("tracking-hidden");
    }
  }
  // When privacy mode is ON, caption stays white (no classes)
}

async function loadSimulation() {
  const response = await fetch("/api/simulation");
  const data = await response.json();

  speedSelect.value = String(data.speedMultiplier);
  renderFleet(data.trucks);
  renderParcelIds(data.parcelIds);
}

function renderTracking(data) {
  currentTrackingData = data;
  headerTrackingId.textContent = data.trackingId;
  parcelTitle.textContent = data.trackingId;
  statusPill.textContent = formatStatus(data.status);
  statusPill.className = `status-pill ${data.status}`;

  deliveryRecipient.textContent = data.recipient ?? "Recipient unavailable";
  deliveryAddress.textContent = data.destination
    ? `${data.destination.label}, ${data.destination.city}`
    : "Address unavailable";

  if (data.status !== "delivered" && initialDeliveriesBeforeYours === null) {
    initialDeliveriesBeforeYours = data.scheduledDeliveriesBeforeYours;
  }

  const arrivingSoonActive = data.status === "delivered"
    ? true
    : Number.isFinite(data.scheduledDeliveriesBeforeYours)
      ? data.scheduledDeliveriesBeforeYours === 0
      : false;

  if (data.status === "delivered") {
    summaryGrid.innerHTML = [
      summaryItem("Status", "Delivered"),
      summaryItem("Delivered at", formatDateTime(data.deliveredAt)),
      summaryItem("Current location", "No active truck data"),
      summaryItem("ETA", "Delivery complete")
    ].join("");
    etaLarge.textContent = "Delivered";
    progressCopy.textContent = "Parcel delivered";
    progressFill.style.width = "100%";
    renderRouteStats({
      beforeYours: 0,
      deliveryStopNumber: data.deliveryStopNumber,
      delivered: true
    });
    updateMapFromHistory(data.history);
  } else {
    summaryGrid.innerHTML = [
      summaryItem("Current location", `${data.currentLocation.label}, ${data.currentLocation.city}`),
      summaryItem("ETA", `${formatTime(data.estimatedDeliveryWindow.from)} - ${formatTime(data.estimatedDeliveryWindow.to)}`),
      summaryItem("Before yours", `${data.scheduledDeliveriesBeforeYours} deliveries`),
      summaryItem("Truck", `${data.truck.name} (${data.truck.currentRouteIndex + 1}/${data.truck.routeLength})`)
    ].join("");

    const etaRange = `${formatTime(data.estimatedDeliveryWindow.from)} - ${formatTime(data.estimatedDeliveryWindow.to)}`;
    etaLarge.textContent = etaRange;

    const beforeYours = data.scheduledDeliveriesBeforeYours;
    progressCopy.textContent = beforeYours === 0
      ? "You are next for delivery"
      : `Approximately ${beforeYours} ${beforeYours === 1 ? "delivery" : "deliveries"} before yours`;

    const baseline = Math.max(initialDeliveriesBeforeYours ?? beforeYours, 0);
    const progressPercent = baseline === 0
      ? 85
      : Math.max(0, Math.min(100, ((baseline - beforeYours) / baseline) * 100));
    progressFill.style.width = `${progressPercent.toFixed(0)}%`;

    renderRouteStats({
      beforeYours,
      deliveryStopNumber: data.deliveryStopNumber,
      delivered: false
    });
    updateAreaMarker(data.currentLocation);
  }

  renderStatusTimeline(data.status, arrivingSoonActive);
  renderHistory(data.history);
  renderBle(data.ble);
  setMapArrivingSoon(arrivingSoonActive);
  updateMapVisibility(data);
}

function renderBle(ble) {
  if (!blePanel) return;
  if (!ble) {
    blePanel.innerHTML = `<div class="ble-empty">No BLE data</div>`;
    return;
  }

  const last = ble.timestamp ? new Date(ble.timestamp).toLocaleString() : 'Unknown';
  const temperature = ble.sensors?.temperature_c ?? 'N/A';
  const shock = ble.sensors?.shock_g ?? 'N/A';
  const gpsText = ble.gps
    ? `${ble.gps.label || 'Route point'} (${ble.gps.lat?.toFixed?.(4) ?? ble.gps.lat}, ${ble.gps.lng?.toFixed?.(4) ?? ble.gps.lng})`
    : 'N/A';

  blePanel.innerHTML = `
    <div class="ble-card">
      <div class="ble-row"><strong>Tag</strong><span><code>${escapeHtml(ble.tagId)}</code></span></div>
      <div class="ble-row"><strong>Battery</strong><span>${escapeHtml(ble.battery ?? 'N/A')}%</span></div>
      <div class="ble-row"><strong>RSSI</strong><span>${escapeHtml(ble.rssi ?? 'N/A')}</span></div>
      <div class="ble-row"><strong>Temperature</strong><span>${escapeHtml(temperature)}${temperature === 'N/A' ? '' : ' C'}</span></div>
      <div class="ble-row"><strong>Shock</strong><span>${escapeHtml(shock)}</span></div>
      <div class="ble-row"><strong>GPS</strong><span>${escapeHtml(gpsText)}</span></div>
      <div class="ble-row"><strong>Last seen</strong><span>${escapeHtml(last)}</span></div>
    </div>
  `;
}

// -- BLE mappings & simulate helpers --
async function loadMappings() {
  try {
    const resp = await fetch('/api/ble/mappings');
    if (!resp.ok) throw new Error('Unable to load mappings');
    const data = await resp.json();
    renderMappings(data.bleMappings ?? {}, data.macMappings ?? {});
  } catch (err) {
    console.error('loadMappings error', err);
  }
}

async function loadBleEvents() {
  if (!bleEventsList) return;
  try {
    const resp = await fetch('/api/ble/events/recent?limit=150');
    if (!resp.ok) throw new Error('Unable to load BLE events');
    const data = await resp.json();
    const events = Array.isArray(data.events) ? data.events : [];
    bleEventsCache = events;
    if (selectedBleTagId && !events.some((event) => event.tagId === selectedBleTagId)) {
      selectedBleTagId = null;
    }
    renderBleEvents(events);
  } catch (err) {
    bleEventsList.innerHTML = '<div class="ble-events-empty">Unable to load BLE events</div>';
  }
}

function renderBleEvents(events) {
  if (!bleEventsList) return;
  if (!events.length) {
    bleEventsList.innerHTML = '<div class="ble-events-empty">No BLE events yet</div>';
    return;
  }
  const filter = bleEventsFilterValue.trim().toUpperCase();
  const filteredEvents = filter
    ? events.filter((event) => {
      const tag = String(event.tagId ?? "").toUpperCase();
      const tracking = String(event.trackingId ?? "").toUpperCase();
      const mac = String(event.macAddress ?? "").toUpperCase();
      return tag.includes(filter) || tracking.includes(filter) || mac.includes(filter);
    })
    : events;

  const latestByTag = new Map();
  for (const event of filteredEvents) {
    if (!event.tagId) continue;
    const existing = latestByTag.get(event.tagId);
    if (!existing) {
      latestByTag.set(event.tagId, event);
      continue;
    }
    const currentTs = Date.parse(String(event.timestamp ?? ""));
    const existingTs = Date.parse(String(existing.timestamp ?? ""));
    if ((Number.isFinite(currentTs) ? currentTs : 0) >= (Number.isFinite(existingTs) ? existingTs : 0)) {
      latestByTag.set(event.tagId, event);
    }
  }

  const latestEvents = [...latestByTag.values()].sort((a, b) => {
    const aTs = Date.parse(String(a.timestamp ?? ""));
    const bTs = Date.parse(String(b.timestamp ?? ""));
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });

  const detailBlock = selectedBleTagId
    ? buildBleEventHistoryBlock(selectedBleTagId, filteredEvents)
    : "";

  if (!latestEvents.length && !detailBlock) {
    bleEventsList.innerHTML = '<div class="ble-events-empty">No BLE events match this filter</div>';
    return;
  }

   const latestRows = latestEvents.map((event) => {
     const ts = event.timestamp ? formatDateTime(event.timestamp) : 'Unknown time';
     const source = event.source || 'ingest';
     const tracking = event.trackingId ?? 'Unassigned';
     const tag = event.tagId ?? 'N/A';
     const mac = event.macAddress ?? 'N/A';
     const rssi = typeof event.rssi === 'number' ? event.rssi : 'N/A';
     const battery = typeof event.battery === 'number' ? `${event.battery}%` : 'N/A';
     const gps = event.gps ? `${event.gps.label || 'Route point'} (${event.gps.lat}, ${event.gps.lng})` : 'N/A';
     const runClass = trackingRunClass(tracking);
     return `
       <button class="ble-event-item ble-event-open ${runClass}" type="button" data-tag-id="${escapeHtml(tag)}" title="View full event history for ${escapeHtml(tag)}">
         <div class="ble-event-top"><strong>${escapeHtml(tracking)}</strong><span>${escapeHtml(ts)}</span></div>
         <div class="ble-event-row"><span>Tag</span><code>${escapeHtml(tag)}</code></div>
         <div class="ble-event-row"><span>MAC</span><code>${escapeHtml(mac)}</code></div>
         <div class="ble-event-row"><span>RSSI</span><span>${escapeHtml(rssi)}</span></div>
         <div class="ble-event-row"><span>Battery</span><span>${escapeHtml(battery)}</span></div>
         <div class="ble-event-row"><span>GPS</span><span>${escapeHtml(gps)}</span></div>
         <div class="ble-event-source">Source: ${escapeHtml(source)} · Click for full history</div>
       </button>
     `;
   }).join('');

  bleEventsList.innerHTML = detailBlock + latestRows;

  bleEventsList.querySelectorAll('.ble-event-open').forEach((button) => {
    button.addEventListener('click', () => {
      selectedBleTagId = button.dataset.tagId || null;
      renderBleEvents(bleEventsCache);
    });
  });

  const closeBtn = bleEventsList.querySelector('#ble-events-history-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      selectedBleTagId = null;
      renderBleEvents(bleEventsCache);
    });
  }
}

function buildBleEventHistoryBlock(tagId, events) {
  const tagEvents = events
    .filter((event) => event.tagId === tagId)
    .sort((a, b) => {
      const aTs = Date.parse(String(a.timestamp ?? ""));
      const bTs = Date.parse(String(b.timestamp ?? ""));
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });

  return `
    <div class="ble-history-panel">
      <div class="ble-history-header">
        <strong>History for ${escapeHtml(tagId)}</strong>
        <button id="ble-events-history-close" type="button">Close</button>
      </div>
      <pre class="ble-history-json">${escapeHtml(JSON.stringify(tagEvents, null, 2))}</pre>
    </div>
  `;
}

function renderMappings(bleMappingsObj, macMappingsObj) {
  if (!mappingList) return;

  // Group entries by trackingId so Tag and MAC for the same tracking appear together
  const groups = {};
  for (const [tag, tracking] of Object.entries(bleMappingsObj)) {
    const t = String(tracking);
    groups[t] = groups[t] || { tags: [], macs: [] };
    groups[t].tags.push(String(tag));
  }
  for (const [mac, tracking] of Object.entries(macMappingsObj)) {
    const t = String(tracking);
    groups[t] = groups[t] || { tags: [], macs: [] };
    groups[t].macs.push(String(mac));
  }

  const rows = [];
  const trackingIds = Object.keys(groups).sort();
  for (const trackingId of trackingIds) {
    const entry = groups[trackingId];
    rows.push(`<div class="mapping-group">
      <div class="mapping-tracking"><strong>${escapeHtml(trackingId)}</strong></div>
      <div class="mapping-entries">
        ${entry.tags.map((tag) => `
          <div class="mapping-entry mapping-item">
            <div class="mapping-left">
              <div class="mapping-label">Tag:</div>
              <div class="mapping-value"><code>${escapeHtml(tag)}</code></div>
            </div>
            <div class="mapping-right">
              <button class="mapping-delete" data-tag="${escapeHtml(tag)}">Delete</button>
              <button class="mapping-fill" data-tag="${escapeHtml(tag)}" data-tracking="${escapeHtml(trackingId)}">Fill</button>
            </div>
          </div>
        `).join('')}

        ${entry.macs.map((mac) => `
          <div class="mapping-entry mapping-item">
            <div class="mapping-left">
              <div class="mapping-label">MAC:</div>
              <div class="mapping-value"><code>${escapeHtml(mac)}</code></div>
            </div>
            <div class="mapping-right">
              <button class="mapping-delete" data-mac="${escapeHtml(mac)}">Delete</button>
              <button class="mapping-fill" data-mac="${escapeHtml(mac)}" data-tracking="${escapeHtml(trackingId)}">Fill</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`);
  }

  mappingList.innerHTML = rows.join('\n') || '<div class="mapping-empty">No mappings</div>';

  mappingList.querySelectorAll('.mapping-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const tag = btn.dataset.tag;
      const mac = btn.dataset.mac;
      const label = tag ? `tag ${tag}` : mac ? `mac ${mac}` : 'mapping';
      if (!window.confirm(`Delete mapping for ${label}? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        const body = {};
        if (tag) body.tagId = tag;
        if (mac) body.macAddress = mac;
        await deleteJson('/api/ble/map', body);
        await loadMappings();
        showAlert('Mapping removed');
        setTimeout(hideAlert, 1200);
      } catch (err) {
        showAlert(err.message || 'Failed to delete mapping');
      } finally {
        btn.disabled = false;
      }
    });
  });

  mappingList.querySelectorAll('.mapping-fill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const mac = btn.dataset.mac;
      const tracking = btn.dataset.tracking;
      if (tag) simTagInput.value = tag;
      if (mac) simMacInput.value = mac;
      if (tracking) simTrackingInput.value = tracking;
    });
  });
}

async function deleteJson(url, body) {
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || 'Request failed');
  }
  return resp.json().catch(() => ({}));
}

if (bleMapForm) {
  bleMapForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const tag = (mapTagInput?.value || '').trim() || undefined;
    const mac = (mapMacInput?.value || '').trim() || undefined;
    const tracking = (mapTrackingInput?.value || '').trim();
    if (!tracking) { showAlert('Enter a tracking ID to map to.'); return; }
    try {
      await postJson('/api/ble/map', { trackingId: tracking, tagId: tag ?? undefined, macAddress: mac ?? undefined });
      await loadMappings();
      showAlert('Mapping saved');
      setTimeout(hideAlert, 1200);
    } catch (err) {
      showAlert(err.message || 'Failed to save mapping');
    }
  });
}

if (bleMapRefresh) bleMapRefresh.addEventListener('click', () => loadMappings());
if (bleEventsRefresh) bleEventsRefresh.addEventListener('click', () => loadBleEvents());
if (bleEventsFilterInput) {
  bleEventsFilterInput.addEventListener('input', () => {
    bleEventsFilterValue = bleEventsFilterInput.value || '';
    renderBleEvents(bleEventsCache);
  });
}
if (bleEventsFilterClear) {
  bleEventsFilterClear.addEventListener('click', () => {
    bleEventsFilterValue = '';
    if (bleEventsFilterInput) bleEventsFilterInput.value = '';
    renderBleEvents(bleEventsCache);
  });
}

if (bleSimForm) {
  bleSimForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const tag = (simTagInput?.value || '').trim() || undefined;
    const mac = (simMacInput?.value || '').trim() || undefined;
    const rssiRaw = (simRssiInput?.value || '').trim();
    const battRaw = (simBattInput?.value || '').trim();
    const tracking = (simTrackingInput?.value || '').trim() || undefined;

    if (!tag && !mac) { showAlert('Provide tag ID or MAC address to simulate.'); return; }

    const body = {};
    if (tag) body.tag_id = tag;
    if (mac) body.mac_address = mac;
    if (rssiRaw !== '') body.rssi = Number(rssiRaw);
    if (battRaw !== '') body.battery = Number(battRaw);
    if (tracking) body.trackingId = tracking;

    try {
      const result = await postJson('/api/ble/events', body);
      await loadMappings();
      await loadBleEvents();
      if (result.trackingId) {
        await fetchTracking(result.trackingId);
        showAlert(`Simulated and attached to ${result.trackingId}`);
      } else {
        showAlert('Simulated BLE event (no tracking assigned)');
      }
      setTimeout(hideAlert, 1600);
    } catch (err) {
      showAlert(err.message || 'Failed to simulate event');
    }
  });
}

function renderStatusTimeline(status, arrivingSoon) {
  const rows = [
    { key: "collected", label: "Collected", done: true },
    { key: "depot", label: "Arrived at local depot", done: status !== "loaded" },
    { key: "loaded", label: "Loaded onto delivery vehicle", done: true },
    { key: "delivery_run", label: "Delivery run started", done: status === "in_transit" || status === "out_for_delivery" || status === "delivered" },
    { key: "arriving_soon", label: "Arriving soon", done: arrivingSoon || status === "delivered" },
    { key: "delivered", label: "Delivered", done: status === "delivered" }
  ];

  statusTimeline.innerHTML = rows.map((row) => `
    <li class="${row.done ? "done" : ""}">
      <span class="status-dot">${row.done ? "\u2713" : "\u2022"}</span>
      <span class="status-label">${escapeHtml(row.label)}</span>
    </li>
  `).join("");
}

function setMapArrivingSoon(arrivingSoon) {
  const mapCanvasEl = document.querySelector('#map');
  if (!mapCanvasEl) return;
  mapCanvasEl.classList.toggle('arriving-soon', Boolean(arrivingSoon));
}

function renderRouteStats({ beforeYours, deliveryStopNumber, delivered }) {
  const total = Math.max(1, Number.isFinite(deliveryStopNumber) ? Number(deliveryStopNumber) : 1);
  const remaining = delivered
    ? 0
    : Math.max(0, Math.min(total, (Number.isFinite(beforeYours) ? Number(beforeYours) : 0) + 1));
  const completed = delivered
    ? total
    : Math.max(0, total - remaining);

  routeCompleted.textContent = String(completed);
  routeRemaining.textContent = String(remaining);
  routeTotal.textContent = String(total);
}

function renderFleet(trucks) {
  fleetList.innerHTML = trucks.map((truck) => `
    <div class="fleet-item ${fleetRunClass(truck)}">
      <strong>${escapeHtml(truck.name)}</strong>
      <span>${escapeHtml(truck.currentLocation.label)}, ${escapeHtml(truck.currentLocation.city)}</span>
      <span>Route point ${truck.currentRouteIndex + 1} of ${truck.routeLength} (path points)</span>
    </div>
  `).join("");
}

function fleetRunClass(truck) {
  const id = String(truck?.id || '').toLowerCase();
  const name = String(truck?.name || '').toLowerCase();
  if (id.includes('docklands') || name.includes('docklands')) return 'run-docklands';
  if (id.includes('richmond') || name.includes('richmond')) return 'run-richmond';
  return 'run-unknown';
}

function renderParcelIds(parcelIds) {
  parcelList.innerHTML = parcelIds.map((parcelId) => `
    <button class="parcel-token ${trackingRunClass(parcelId)}" type="button" data-tracking-id="${escapeHtml(parcelId)}">${escapeHtml(parcelId)}</button>
  `).join("");

  parcelList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => track(button.dataset.trackingId));
  });
}

function trackingRunClass(trackingId) {
  const upper = String(trackingId || '').toUpperCase();
  if (upper.startsWith('APD-')) return 'run-docklands';
  if (upper.startsWith('APR-')) return 'run-richmond';
  return 'run-unknown';
}

function renderHistory(history) {
  historyList.innerHTML = history.map((event) => `
    <li class="history-item">
      <span class="history-time">${formatDateTime(event.timestamp)}</span>
      <span class="history-copy">
        <strong>${formatHistoryStatus(event)}</strong>
        <span>${escapeHtml(event.description)}</span>
        <span>${escapeHtml(event.location.label)}, ${escapeHtml(event.location.city)}</span>
      </span>
    </li>
  `).join("");
}

function formatHistoryStatus(event) {
  const description = String(event?.description ?? '').toLowerCase();
  if (event?.status === 'arriving_soon') return 'Arriving soon';
  if (event?.status === 'in_transit') return 'Delivery run started';
  if (event?.status === 'loaded' && description.includes('collected')) return 'Collected';
  if (event?.status === 'loaded' && description.includes('local depot')) return 'Arrived at local depot';
  if (event?.status === 'loaded') return 'Loaded onto delivery vehicle';
  return formatStatus(event?.status ?? '');
}

function summaryItem(label, value) {
  return `
    <div class="summary-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Request failed.");
  }
  return response.json();
}

function setConnection(label, live) {
  connectionStatus.textContent = label;
  connectionStatus.classList.toggle("live", live);
}

function initMap() {
  if (!window.L) {
    showAlert("Map library could not be loaded.");
    return;
  }

  map = L.map("map", {
    attributionControl: false,
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([-37.821, 144.968], 13);

  const streetTiles = L.tileLayer(
    // Load tiles directly from OSM to avoid local Node TLS trust issues in the proxy route.
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {}
  );

  streetTiles.on("tileerror", () => {
    showAlert("Map tiles could not be loaded. Tracking data is still updating.");
  });

  streetTiles.addTo(map);

  L.control.scale({
    imperial: false,
    metric: true
  }).addTo(map);

  L.control.attribution({
    prefix: false
  }).addAttribution("&copy; OpenStreetMap contributors").addTo(map);

  setTimeout(() => map.invalidateSize(), 0);
}

function updateMapFromHistory(history) {
  const latestEvent = history.at(-1);
  if (latestEvent?.location) {
    updateAreaMarker(latestEvent.location);
  }
}

function updateAreaMarker(location) {
  if (!map || !location) {
    return;
  }

  const latLng = [location.lat, location.lng];
  const radiusMetres = 60;

  if (!currentAreaMarker) {
    currentAreaMarker = L.circle(latLng, {
      radius: radiusMetres,
      color: "#0b64d8",
      weight: 2,
      fillColor: "#0b64d8",
      fillOpacity: 0.34
    }).addTo(map);
  } else {
    currentAreaMarker.setLatLng(latLng);
    currentAreaMarker.setRadius(radiusMetres);
  }

  currentAreaMarker.bindPopup(`${escapeHtml(location.label)}, ${escapeHtml(location.city)}`);
  map.setView(latLng, 16, { animate: true });
  setTimeout(() => map.invalidateSize(), 0);
}

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.hidden = false;
}

function hideAlert() {
  alertBox.hidden = true;
}

function formatStatus(status) {
  if (status === "out_for_delivery") {
    return "On its way to you";
  }

  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

await loadSimulation();
await loadMappings();
await loadBleEvents();
await track(currentTrackingId);
