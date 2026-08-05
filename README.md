# AusPost Trackable Backend Simulator

In-memory Node/TypeScript service that simulates two AusPost trucks delivering 10 parcels each across Melbourne suburbs. Each truck follows an OSRM-routed road path with more than 1,000 GPS points and moves one GPS route point every 10 seconds at 1x speed.

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

The UI lets you enter a tracking ID, subscribe to live SSE tracking updates, restart the route, manually advance the simulation by one GPS point, and change the simulation speed. It also loads a local Leaflet map and proxies OpenStreetMap tiles through the backend, then shows the truck's current GPS position with a small blue marker.

## Tracking IDs

Truck 1: `APD-0001` to `APD-0010`

Truck 2: `APR-0001` to `APR-0010`

## APIs

`GET /health`

Returns service health.

`GET /api/simulation`

Returns simulator state, truck locations, speed, and available tracking IDs.

`POST /api/simulation/speed`

Changes the simulated speed.

```json
{ "multiplier": 10 }
```

At `1`, one route point takes 10 seconds. At `10`, one route point takes 1 second. Values below `1` slow the simulation down.

`POST /api/simulation/restart`

Restarts both routes and reloads all parcels.

`POST /api/simulation/tick`

Manually advances the simulation by one route point. Useful for testing.

`GET /api/parcels/:trackingId`

Returns active tracking data while the parcel is still on the truck:

```json
{
  "trackingId": "APD-0004",
  "status": "in_transit",
  "currentLocation": {
    "label": "Southern Cross",
    "city": "Melbourne",
    "lat": -37.8183,
    "lng": 144.9525
  },
  "estimatedDeliveryWindow": {
    "from": "2026-08-04T11:25:00.000Z",
    "to": "2026-08-04T12:25:00.000Z"
  },
  "scheduledDeliveriesBeforeYours": 2,
  "truck": {},
  "history": []
}
```

After delivery, active truck/location/ETA data is no longer returned:

```json
{
  "trackingId": "APD-0004",
  "status": "delivered",
  "deliveredAt": "2026-08-04T11:21:00.000Z",
  "history": []
}
```

`GET /api/parcels/:trackingId/events`

Server-Sent Events stream for frontend subscriptions. It immediately emits the current tracking state and then emits `tracking` events whenever that parcel changes or the truck advances.

```js
const events = new EventSource("http://localhost:3000/api/parcels/APD-0004/events");
events.addEventListener("tracking", (event) => {
  console.log(JSON.parse(event.data));
});
```
