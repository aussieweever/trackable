import cors from "cors";
import express from "express";
import { DeliverySimulator } from "./simulator.js";

const app = express();
const simulator = new DeliverySimulator();
// BLE mappings for the backend simulator (in-memory)
const bleStore: Record<string, unknown> = {};
const bleMappings: Record<string, string> = {};
const macMappings: Record<string, string> = {};
const macToTag: Record<string, string> = {};
const tagToMacs: Record<string, string[]> = {};
const recentBleEvents: Array<{
  trackingId: string | null;
  tagId: string | null;
  macAddress: string | null;
  timestamp: string;
  rssi?: number;
  battery?: number;
  gps?: { lat: number; lng: number; label?: string; city?: string };
  source: "seed" | "ingest" | "gateway";
}> = [];
const postcodeCache = new Map<string, string | null>();
const postcodeInFlight = new Map<string, Promise<string | undefined>>();
const arrivingSoonByTrackingId: Record<string, boolean> = {};
const arrivingSoonEventByTrackingId: Record<string, { timestamp: string; location?: any }> = {};
const port = Number(process.env.PORT ?? 3000);
let bleGatewayTimer: ReturnType<typeof setInterval> | undefined;
const BLE_GATEWAY_BASE_MS = 5_000;

type RouteLikePoint = {
  lat?: number;
  lng?: number;
};

function getPointKey(point?: RouteLikePoint): string | undefined {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") return undefined;
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

async function lookupPostcode(point?: RouteLikePoint): Promise<string | undefined> {
  const key = getPointKey(point);
  if (!key) return undefined;
  if (postcodeCache.has(key)) return postcodeCache.get(key) ?? undefined;
  if (postcodeInFlight.has(key)) return postcodeInFlight.get(key);

  const task = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const [latStr, lngStr] = key.split(",");
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latStr)}&lon=${encodeURIComponent(lngStr)}&zoom=18&addressdetails=1`,
        {
          headers: {
            "User-Agent": "auspost-trackable-local-simulator/1.0"
          },
          signal: controller.signal
        }
      );
      if (!response.ok) {
        postcodeCache.set(key, null);
        return undefined;
      }
      const data = await response.json() as { address?: { postcode?: string } };
      const postcode = data?.address?.postcode?.trim();
      postcodeCache.set(key, postcode && postcode.length > 0 ? postcode : null);
      return postcode;
    } catch {
      postcodeCache.set(key, null);
      return undefined;
    } finally {
      if (timeout) clearTimeout(timeout);
      postcodeInFlight.delete(key);
    }
  })();

  postcodeInFlight.set(key, task);
  return task;
}

function resetArrivingSoonState() {
  for (const trackingId of Object.keys(arrivingSoonByTrackingId)) {
    delete arrivingSoonByTrackingId[trackingId];
  }
  for (const trackingId of Object.keys(arrivingSoonEventByTrackingId)) {
    delete arrivingSoonEventByTrackingId[trackingId];
  }
}

async function enrichTrackingWithArrivalState(tracking: any) {
  if (!tracking || !tracking.trackingId) return tracking;
  const currentPoint = tracking.currentLocation ?? tracking.destination;
  const destinationPoint = tracking.destination;
  const [currentPostcode, destinationPostcode] = await Promise.all([
    lookupPostcode(currentPoint),
    lookupPostcode(destinationPoint)
  ]);

  const samePostcode = Boolean(
    currentPostcode
    && destinationPostcode
    && currentPostcode === destinationPostcode
  );
  const trackingId = String(tracking.trackingId);
  const latched = arrivingSoonByTrackingId[trackingId] === true;
  const arrivingSoon = latched || samePostcode;
  if (arrivingSoon) {
    arrivingSoonByTrackingId[trackingId] = true;
    if (!arrivingSoonEventByTrackingId[trackingId]) {
      arrivingSoonEventByTrackingId[trackingId] = {
        timestamp: new Date().toISOString(),
        location: tracking.currentLocation ?? tracking.destination
      };
    }
  }

  const baseHistory = Array.isArray(tracking.history) ? tracking.history : [];
  const arrivingSoonEvent = arrivingSoonEventByTrackingId[trackingId];
  const history = arrivingSoonEvent
    ? [
      ...baseHistory,
      {
        status: "arriving_soon",
        timestamp: arrivingSoonEvent.timestamp,
        location: arrivingSoonEvent.location ?? tracking.currentLocation ?? tracking.destination,
        description: "Vehicle entered your destination postcode area."
      }
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    : baseHistory;

  return {
    ...tracking,
    history,
    arrivingSoon,
    currentPostcode: currentPostcode ?? null,
    destinationPostcode: destinationPostcode ?? null
  };
}

function normalizeMac(value: unknown): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function linkTagMac(tagId: string, mac: string): { conflictTag?: string } {
  const previousTag = macToTag[mac];
  if (previousTag && previousTag !== tagId && tagToMacs[previousTag]) {
    tagToMacs[previousTag] = tagToMacs[previousTag].filter((value) => value !== mac);
    if (tagToMacs[previousTag].length === 0) {
      delete tagToMacs[previousTag];
    }
  }
  macToTag[mac] = tagId;
  const tagMacs = tagToMacs[tagId] ?? [];
  if (!tagMacs.includes(mac)) {
    tagMacs.push(mac);
    tagToMacs[tagId] = tagMacs;
  }
  return previousTag && previousTag !== tagId ? { conflictTag: previousTag } : {};
}

function appendRecentBleEvent(entry: {
  trackingId: string | null;
  tagId: string | null;
  macAddress: string | null;
  timestamp?: string;
  rssi?: number;
  battery?: number;
  gps?: { lat: number; lng: number; label?: string; city?: string };
  source: "seed" | "ingest" | "gateway";
}) {
  recentBleEvents.unshift({
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString()
  });
  if (recentBleEvents.length > 150) recentBleEvents.length = 150;
}

function updateBleGatewayFromTruckPosition() {
  const state = simulator.getState();
  const now = new Date().toISOString();

  for (const trackingId of state.parcelIds) {
    const tracking = simulator.getTracking(trackingId) as any;
    if (!tracking || !tracking.ble) continue;
    const gatewayPoint = tracking.currentLocation ?? tracking.destination;
    if (!gatewayPoint) continue;

    const currentBle = tracking.ble as any;
    const nextBle = {
      ...currentBle,
      timestamp: now,
      gps: {
        lat: gatewayPoint.lat,
        lng: gatewayPoint.lng,
        label: gatewayPoint.label,
        city: gatewayPoint.city
      }
    };

    (simulator as any).upsertBle(trackingId, nextBle);
    appendRecentBleEvent({
      trackingId,
      tagId: typeof nextBle.tagId === "string" ? nextBle.tagId : null,
      macAddress: normalizeMac(nextBle.macAddress) ?? null,
      timestamp: now,
      rssi: typeof nextBle.rssi === "number" ? nextBle.rssi : undefined,
      battery: typeof nextBle.battery === "number" ? nextBle.battery : undefined,
      gps: nextBle.gps,
      source: "gateway"
    });
  }
}

function restartBleGatewayTimer() {
  if (bleGatewayTimer) {
    clearInterval(bleGatewayTimer);
    bleGatewayTimer = undefined;
  }
  const speed = simulator.getState().speedMultiplier || 1;
  const intervalMs = Math.max(250, Math.round(BLE_GATEWAY_BASE_MS / speed));
  bleGatewayTimer = setInterval(updateBleGatewayFromTruckPosition, intervalMs);
  bleGatewayTimer.unref();
}

function seedBleStateFromSimulator() {
  recentBleEvents.length = 0;
  for (const key of Object.keys(bleMappings)) delete bleMappings[key];
  for (const key of Object.keys(macMappings)) delete macMappings[key];
  for (const key of Object.keys(macToTag)) delete macToTag[key];
  for (const key of Object.keys(tagToMacs)) delete tagToMacs[key];

  const state = simulator.getState();
  for (const trackingId of state.parcelIds) {
    const tracking = simulator.getTracking(trackingId) as any;
    const ble = tracking?.ble;
    if (!ble) continue;
    const tagId = typeof ble.tagId === "string" ? ble.tagId : undefined;
    const mac = normalizeMac(ble.macAddress);
    if (tagId) bleMappings[tagId] = trackingId;
    if (mac) {
      macMappings[mac] = trackingId;
      if (tagId) linkTagMac(tagId, mac);
    }
    appendRecentBleEvent({
      trackingId,
      tagId: tagId ?? null,
      macAddress: mac ?? null,
      timestamp: typeof ble.timestamp === "string" ? ble.timestamp : undefined,
      rssi: typeof ble.rssi === "number" ? ble.rssi : undefined,
      battery: typeof ble.battery === "number" ? ble.battery : undefined,
      gps: tracking?.currentLocation ? {
        lat: tracking.currentLocation.lat,
        lng: tracking.currentLocation.lng,
        label: tracking.currentLocation.label,
        city: tracking.currentLocation.city
      } : undefined,
      source: "seed"
    });
  }
}

app.use(cors());
app.use(express.json());
app.use("/vendor/leaflet", express.static("node_modules/leaflet/dist"));
app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/simulation", (_req, res) => {
  res.json(simulator.getState());
});

app.get("/api/map-tiles/:z/:y/:x", async (req, res) => {
  const { z, y, x } = req.params;
  if (![z, y, x].every((value) => /^\d+$/.test(value))) {
    res.status(400).json({ error: "Invalid tile coordinates." });
    return;
  }

  const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  try {
    const tileResponse = await fetch(tileUrl, {
      headers: {
        "User-Agent": "auspost-trackable-local-simulator/1.0"
      }
    });

    if (!tileResponse.ok || !tileResponse.body) {
      res.status(502).json({ error: "Map tile could not be loaded." });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", tileResponse.headers.get("content-type") ?? "image/png");
    res.send(Buffer.from(await tileResponse.arrayBuffer()));
  } catch {
    res.status(502).json({ error: "Map tile could not be loaded." });
  }
});

// BLE ingestion endpoint (similar to frontend mock-server)
app.post('/api/ble/events', (req, res) => {
  const apiKey = process.env.BLE_API_KEY;
  if (apiKey && String(req.headers['x-api-key']) !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body ?? {};
  const rawTagId = body.tag_id ?? body.tagId;
  const incomingTagId = typeof rawTagId === 'string' && rawTagId.trim().length > 0 ? String(rawTagId).trim() : undefined;
  const mac = normalizeMac(body.mac_address ?? body.macAddress);
  if (!incomingTagId && !mac) {
    res.status(400).json({ error: 'Provide tag_id/tagId or mac_address/macAddress' });
    return;
  }

  const derivedTagId = mac ? macToTag[mac] : undefined;
  const canonicalTagId = incomingTagId ?? derivedTagId;
  const linkResult = incomingTagId && mac ? linkTagMac(incomingTagId, mac) : {};

  const ble = {
    tagId: canonicalTagId,
    timestamp: body.timestamp ?? new Date().toISOString(),
    rssi: typeof body.rssi === 'number' ? body.rssi : undefined,
    battery: typeof body.battery === 'number' ? body.battery : undefined,
    sensors: typeof body.sensors === 'object' ? body.sensors : undefined,
    macAddress: body.mac_address ?? body.macAddress,
    raw: body
  };

  const trackingIdRaw = body.trackingId ?? body.tracking_id;

  // If trackingId provided, attach directly
  if (trackingIdRaw) {
    const trackingId = String(trackingIdRaw).toUpperCase();
    const updated = (simulator as any).upsertBle(trackingId, ble);
    if (!updated) {
      res.status(404).json({ error: 'Tracking ID not found' });
      return;
    }
    if (canonicalTagId) bleMappings[canonicalTagId] = trackingId;
    if (mac) macMappings[mac] = trackingId;
    appendRecentBleEvent({
      trackingId,
      tagId: canonicalTagId ?? null,
      macAddress: mac ?? null,
      timestamp: typeof ble.timestamp === "string" ? ble.timestamp : undefined,
      rssi: ble.rssi,
      battery: ble.battery,
      gps: (ble as any).gps,
      source: "ingest"
    });
    res.json({ received: true, trackingId, tagId: canonicalTagId, conflictTag: linkResult.conflictTag ?? null });
    return;
  }

  // Resolve using canonical identity first (tag), then MAC fallback.
  let resolvedTrackingId: string | undefined;
  if (canonicalTagId && bleMappings[canonicalTagId]) resolvedTrackingId = bleMappings[canonicalTagId];
  else if (mac && macMappings[mac]) resolvedTrackingId = macMappings[mac];

  // Search current parcels for matching BLE or mac
  if (!resolvedTrackingId && (canonicalTagId || mac)) {
    const state = simulator.getState();
    for (const id of state.parcelIds) {
      const tracking = simulator.getTracking(id);
      if (tracking && (tracking as any).ble) {
        const existing = (tracking as any).ble as any;
        if ((canonicalTagId && existing.tagId === canonicalTagId) || (existing.macAddress && mac && existing.macAddress.toUpperCase() === mac)) {
          resolvedTrackingId = id;
          break;
        }
      }
    }
  }

  if (resolvedTrackingId) {
    (simulator as any).upsertBle(resolvedTrackingId, ble);
    if (canonicalTagId) bleMappings[canonicalTagId] = resolvedTrackingId;
    if (mac) macMappings[mac] = resolvedTrackingId;
    appendRecentBleEvent({
      trackingId: resolvedTrackingId,
      tagId: canonicalTagId ?? null,
      macAddress: mac ?? null,
      timestamp: typeof ble.timestamp === "string" ? ble.timestamp : undefined,
      rssi: ble.rssi,
      battery: ble.battery,
      gps: (ble as any).gps,
      source: "ingest"
    });
    res.json({ received: true, trackingId: resolvedTrackingId, tagId: canonicalTagId, note: 'Auto-mapped by existing mapping or previous BLE', conflictTag: linkResult.conflictTag ?? null });
    return;
  }

  // Fallback: attach to first parcel if available
  const state = simulator.getState();
  if (state.parcelIds && state.parcelIds.length > 0) {
    const chosen = state.parcelIds[0];
    (simulator as any).upsertBle(chosen, ble);
    if (canonicalTagId) bleMappings[canonicalTagId] = chosen;
    if (mac) macMappings[mac] = chosen;
    appendRecentBleEvent({
      trackingId: chosen,
      tagId: canonicalTagId ?? null,
      macAddress: mac ?? null,
      timestamp: typeof ble.timestamp === "string" ? ble.timestamp : undefined,
      rssi: ble.rssi,
      battery: ble.battery,
      gps: (ble as any).gps,
      source: "ingest"
    });
    res.json({ received: true, trackingId: chosen, tagId: canonicalTagId, note: 'Auto-assigned to first tracking entry', conflictTag: linkResult.conflictTag ?? null });
    return;
  }

  // store in bleStore as final fallback
  const storeKey = canonicalTagId ?? mac ?? `ble-${Date.now()}`;
  bleStore[storeKey] = ble;
  res.json({ received: true, tagId: canonicalTagId ?? null, macAddress: mac ?? null, note: 'Stored in bleStore (no parcels available)', conflictTag: linkResult.conflictTag ?? null });
});

// Admin endpoints for inspecting and managing BLE mappings/store
app.get('/api/ble/mappings', (_req, res) => {
  res.json({ bleMappings, macMappings, associations: { macToTag, tagToMacs } });
});

app.get('/api/ble/store', (_req, res) => {
  res.json(bleStore);
});

app.get('/api/ble/events/recent', (req, res) => {
  const limitRaw = req.query.limit;
  const limit = Number.isFinite(Number(limitRaw)) ? Math.max(1, Math.min(200, Number(limitRaw))) : 25;
  res.json({ events: recentBleEvents.slice(0, limit) });
});

app.post('/api/ble/map', (req, res) => {
  const body = req.body ?? {};
  const trackingIdRaw = body.trackingId ?? body.tracking_id;
  if (!trackingIdRaw) {
    res.status(400).json({ error: 'trackingId is required' });
    return;
  }
  const trackingId = String(trackingIdRaw).toUpperCase();
  const tagId = body.tagId ?? body.tag_id;
  const mac = normalizeMac(body.macAddress ?? body.mac_address);

  if (!tagId && !mac) {
    res.status(400).json({ error: 'Provide tagId or macAddress to map' });
    return;
  }

  if (tagId) bleMappings[String(tagId)] = trackingId;
  if (mac) macMappings[mac] = trackingId;
  if (tagId && mac) linkTagMac(String(tagId), mac);

  res.json({ success: true, mapping: { tagId: tagId ?? null, mac: mac ?? null, trackingId } });
});

app.delete('/api/ble/map', (req, res) => {
  const body = req.body ?? {};
  const tagId = body.tagId ?? body.tag_id ?? req.query.tagId ?? req.query.tag_id;
  const mac = body.macAddress ?? body.mac_address ?? req.query.macAddress ?? req.query.mac_address;

  if (!tagId && !mac) {
    res.status(400).json({ error: 'Provide tagId or macAddress to delete' });
    return;
  }

  if (tagId && bleMappings[String(tagId)]) delete bleMappings[String(tagId)];
  const normalizedMac = normalizeMac(mac);
  if (normalizedMac && macMappings[normalizedMac]) delete macMappings[normalizedMac];

  if (normalizedMac && macToTag[normalizedMac]) {
    const linkedTag = macToTag[normalizedMac];
    delete macToTag[normalizedMac];
    if (tagToMacs[linkedTag]) {
      tagToMacs[linkedTag] = tagToMacs[linkedTag].filter((value) => value !== normalizedMac);
      if (tagToMacs[linkedTag].length === 0) delete tagToMacs[linkedTag];
    }
  }
  if (tagId && tagToMacs[String(tagId)]) {
    for (const linkedMac of tagToMacs[String(tagId)]) {
      if (macToTag[linkedMac] === String(tagId)) delete macToTag[linkedMac];
    }
    delete tagToMacs[String(tagId)];
  }

  res.json({ success: true });
});

app.post("/api/simulation/speed", (req, res) => {
  try {
    simulator.setSpeed(Number(req.body?.multiplier));
    restartBleGatewayTimer();
    res.json(simulator.getState());
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid speed multiplier." });
  }
});

app.post("/api/simulation/restart", (_req, res) => {
  resetArrivingSoonState();
  simulator.restart();
  seedBleStateFromSimulator();
  restartBleGatewayTimer();
  res.json(simulator.getState());
});

app.post("/api/simulation/tick", (_req, res) => {
  simulator.tick();
  res.json(simulator.getState());
});

app.get("/api/parcels/:trackingId", async (req, res) => {
  const tracking = simulator.getTracking(req.params.trackingId);
  if (!tracking) {
    res.status(404).json({ error: "Tracking ID not found." });
    return;
  }
  const enriched = await enrichTrackingWithArrivalState(tracking);
  res.json(enriched);
});

app.get("/api/parcels/:trackingId/events", async (req, res) => {
  const trackingId = req.params.trackingId;
  const initialTracking = simulator.getTracking(trackingId);

  if (!initialTracking) {
    res.status(404).json({ error: "Tracking ID not found." });
    return;
  }

  res.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onTracking = (updatedTrackingId: string, data: unknown) => {
    if (updatedTrackingId === trackingId) {
      void enrichTrackingWithArrivalState(data)
        .then((enriched) => send("tracking", enriched))
        .catch(() => send("tracking", data));
    }
  };

  const initialEnriched = await enrichTrackingWithArrivalState(initialTracking);
  send("tracking", initialEnriched);
  simulator.on("tracking", onTracking);

  const heartbeat = setInterval(() => send("heartbeat", { timestamp: new Date().toISOString() }), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    simulator.off("tracking", onTracking);
    res.end();
  });
});

app.listen(port, () => {
  seedBleStateFromSimulator();
  restartBleGatewayTimer();
  console.log(`AusPost delivery simulator listening on http://localhost:${port}`);
});
