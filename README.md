# AusPost Trackable Backend Simulator

In-memory Node/TypeScript service that simulates two AusPost trucks delivering 10 parcels each across Melbourne suburbs. Each truck follows an OSRM-routed road path with more than 1,000 GPS points and moves one GPS route point every 10 seconds at 1x speed.

## Features

### Core Tracking
- **Real-time GPS tracking** with live Server-Sent Events (SSE) updates
- **Two truck routes**: Docklands (APD-xxxx) and Richmond (APR-xxxx)
- **Route simulation** with Leaflet map visualization
- **Speed control** (0.5x to 30x multiplier)
- **Parcel status timeline** showing collection → depot → loaded → in transit → delivery

### Privacy Mode (Client-Facing)
- **Toggle-able privacy protection** for customer delivery tracking
- **Smart proximity detection** that hides real-time location until close to delivery
- **Color-coded visual indicators**:
  - **No color (white)**: Privacy mode enabled
  - **Pale yellow**: Privacy disabled, delivery far (>2 stops away)
  - **Pale green**: Privacy disabled, delivery close (≤2 stops away)
- **Automatic cluster detection**: Adjusts reveal distance based on delivery density:
  - 2 stops before (single/few deliveries)
  - 3 stops before (multiple deliveries within 100m)
  - 2 stops before (5+ deliveries to same building)

### BLE Integration
- **BLE tag tracking** for package monitoring
- **Color-coded BLE event cards** (Docklands blue, Richmond red)
- **Tag-to-tracking mapping** for parcel association
- **BLE event simulation** for testing
- **Event history** with GPS coordinates

### UI/UX
- **Responsive web interface** with real-time updates
- **Fleet overview** showing all active trucks
- **Quick-select parcel tokens** with run color coding
- **Delivery status timeline** with progress tracking
- **Parcel history log** with timestamps
- **Fireworks animation** on delivery notification

## Run

```bash
npm install
npm run dev
```

The API listens on `http://localhost:3000` by default. Set `PORT=3001` to use another port.

Open the UI at:

```bash
http://localhost:3000
```

## Tracking IDs

**Docklands Route (Blue)**
- `APD-0001` to `APD-0010`

**Richmond Route (Red)**
- `APR-0001` to `APR-0010`

## APIs

### Health Check

`GET /health`

Returns service health status.

### Simulation Control

`GET /api/simulation`

Returns simulator state, truck locations, speed, and available tracking IDs.

```json
{
  "startedAt": "2026-08-07T10:00:00Z",
  "speedMultiplier": 1,
  "updateIntervalMs": 10000,
  "trucks": [...],
  "parcelIds": ["APD-0001", "APD-0002", ...]
}
```

`POST /api/simulation/speed`

Changes the simulated speed multiplier.

```json
{ "multiplier": 10 }
```

At `1x`, one route point takes 10 seconds. At `10x`, one route point takes 1 second.

`POST /api/simulation/restart`

Restarts both routes and resets all parcels to "loaded" status.

`POST /api/simulation/tick`

Manually advances the simulation by one route point.

### Tracking APIs

`GET /api/parcels/:trackingId`

Returns active tracking data while parcel is on truck:

```json
{
  "trackingId": "APD-0004",
  "recipient": "John Smith",
  "destination": {
    "label": "125 Flinders Street",
    "city": "Melbourne",
    "lat": -37.8183,
    "lng": 144.9525
  },
  "status": "out_for_delivery",
  "currentLocation": { ... },
  "estimatedDeliveryWindow": {
    "from": "2026-08-07T14:30:00Z",
    "to": "2026-08-07T15:30:00Z"
  },
  "scheduledDeliveriesBeforeYours": 2,
  "deliveryStopNumber": 8,
  "deliveryTotalStops": 10,
  "truckParcels": [...],
  "truck": { ... },
  "history": [...],
  "ble": { ... }
}
```

After delivery:

```json
{
  "trackingId": "APD-0004",
  "status": "delivered",
  "deliveredAt": "2026-08-07T14:45:00Z",
  "deliveryStopNumber": 8,
  "deliveryTotalStops": 10,
  "truckParcels": [...],
  "history": [...]
}
```

`GET /api/parcels/:trackingId/events`

Server-Sent Events stream for live tracking updates:

```javascript
const events = new EventSource("http://localhost:3000/api/parcels/APD-0004/events");
events.addEventListener("tracking", (event) => {
  console.log(JSON.parse(event.data));
});
```

### BLE APIs

`GET /api/ble/mappings`

Returns current BLE tag and MAC address mappings to tracking IDs.

`POST /api/ble/map`

Create or update a BLE tag/MAC to tracking ID mapping:

```json
{
  "trackingId": "APD-0004",
  "tagId": "BLE-PT-11A2B3C4",
  "macAddress": "D4:9A:3C:11:A2:B3"
}
```

`POST /api/ble/events`

Ingest or simulate a BLE event:

```json
{
  "tag_id": "BLE-PT-11A2B3C4",
  "mac_address": "D4:9A:3C:11:A2:B3",
  "rssi": -65,
  "battery": 87,
  "trackingId": "APD-0004"
}
```

`GET /api/ble/events/recent?limit=150`

Returns up to 150 most recent BLE events.

## Privacy Mode Guide

### For Customers
When **Privacy Mode** is toggled ON:
- The map caption appears **white** with no color coding
- GPS position is completely hidden from view
- Perfect for customers who prefer no live tracking

When **Privacy Mode** is OFF:
- **Yellow background** = Delivery is on the way, still several stops away
- **Green background** = Delivery is very close! Expected within 2 stops
- Real-time GPS position is only visible when close to delivery

### Technical Details
Privacy reveal distance is calculated using:
1. **Haversine distance formula** to find deliveries within 100m radius
2. **Proximity clustering** to group nearby delivery stops
3. **Adaptive reveal thresholds**:
   ```
   If 5+ stops to same location → reveal 2 stops before
   If multiple stops within 100m  → reveal 3 stops before
   Otherwise                       → reveal 2 stops before
   ```

## Frontend Features

### Map Caption Indicator
The "Current GPS Position" header provides immediate visual feedback:

| Scenario | Color | Meaning |
|----------|-------|---------|
| Privacy ON | White | Location tracking disabled |
| Privacy OFF, >2 stops | Yellow | Still far away |
| Privacy OFF, ≤2 stops | Green | Delivery imminent |
| Delivered | Green | Package delivered |

### Speed Control
Adjust simulation speed from 0.5x to 30x:
- **0.5x**: Real-time simulation (10s per route point)
- **1x**: Normal speed (default)
- **5x - 30x**: Accelerated testing

### BLE Event Monitoring
- View raw BLE events from connected tags
- Filter by tag ID, tracking ID, or MAC address
- Create manual BLE tag/tracking associations
- Simulate BLE events for testing

### Delivery Notification
Celebration animation (fireworks) triggers on delivery status change.

## Build

```bash
npm run build
```

Compiles TypeScript to JavaScript in the `dist/` directory.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `BLE_API_KEY` - Optional API key for BLE ingestion endpoint

