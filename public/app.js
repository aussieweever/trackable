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
const speedSelect = document.querySelector("#speed-select");
const restartButton = document.querySelector("#restart-button");
const tickButton = document.querySelector("#tick-button");
const refreshButton = document.querySelector("#refresh-button");
const connectionStatus = document.querySelector("#connection-status");

let eventSource;
let currentTrackingId = trackingInput.value.trim().toUpperCase();
let map;
let currentAreaMarker;
let initialDeliveriesBeforeYours = null;

initMap();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  track(trackingInput.value);
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

async function loadSimulation() {
  const response = await fetch("/api/simulation");
  const data = await response.json();

  speedSelect.value = String(data.speedMultiplier);
  renderFleet(data.trucks);
  renderParcelIds(data.parcelIds);
}

function renderTracking(data) {
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
    renderRouteStats(0, 0, initialDeliveriesBeforeYours ?? 0);
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

    renderRouteStats(beforeYours, data.truck?.parcelCount ?? 0, baseline);
    updateAreaMarker(data.currentLocation);
  }

  renderStatusTimeline(data.status);
  renderHistory(data.history);
}

function renderStatusTimeline(status) {
  const rows = [
    { key: "collected", label: "Collected", done: true },
    { key: "depot", label: "Arrived at local depot", done: status !== "loaded" },
    { key: "loaded", label: "Loaded onto delivery vehicle", done: true },
    { key: "delivery_run", label: "Delivery run started", done: status === "out_for_delivery" || status === "delivered" },
    { key: "delivered", label: "Delivered", done: status === "delivered" }
  ];

  statusTimeline.innerHTML = rows.map((row) => `
    <li class="${row.done ? "done" : ""}">
      <span class="status-dot">${row.done ? "\u2713" : "\u2022"}</span>
      <span class="status-label">${escapeHtml(row.label)}</span>
    </li>
  `).join("");
}

function renderRouteStats(beforeYours, parcelCount, baseline) {
  const derivedTotal = Math.max(parcelCount, baseline + 1, 1);
  const remaining = Math.max(0, Math.min(derivedTotal, beforeYours + 1));
  const completed = Math.max(0, derivedTotal - remaining);

  routeCompleted.textContent = String(completed);
  routeRemaining.textContent = String(remaining);
  routeTotal.textContent = String(derivedTotal);
}

function renderFleet(trucks) {
  fleetList.innerHTML = trucks.map((truck) => `
    <div class="fleet-item">
      <strong>${escapeHtml(truck.name)}</strong>
      <span>${escapeHtml(truck.currentLocation.label)}, ${escapeHtml(truck.currentLocation.city)}</span>
      <span>Route point ${truck.currentRouteIndex + 1} of ${truck.routeLength}</span>
    </div>
  `).join("");
}

function renderParcelIds(parcelIds) {
  parcelList.innerHTML = parcelIds.map((parcelId) => `
    <button class="parcel-token" type="button" data-tracking-id="${escapeHtml(parcelId)}">${escapeHtml(parcelId)}</button>
  `).join("");

  parcelList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => track(button.dataset.trackingId));
  });
}

function renderHistory(history) {
  historyList.innerHTML = history.map((event) => `
    <li class="history-item">
      <span class="history-time">${formatDateTime(event.timestamp)}</span>
      <span class="history-copy">
        <strong>${formatStatus(event.status)}</strong>
        <span>${escapeHtml(event.description)}</span>
        <span>${escapeHtml(event.location.label)}, ${escapeHtml(event.location.city)}</span>
      </span>
    </li>
  `).join("");
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
    "/api/map-tiles/{z}/{y}/{x}",
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
await track(currentTrackingId);
