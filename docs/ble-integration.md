BLE integration
================

This document explains the lightweight BLE ingestion added for local testing.

Endpoint
--------

POST /api/ble/events

- Content-Type: application/json
- Optional header: `X-API-Key: <BLE_API_KEY>` (if `BLE_API_KEY` env var is set on the server)

Sample payload (same as provided in the project):

```json
{
  "tag_id": "BLE-PT-493A7F12",
  "timestamp": "2026-08-04T07:22:15Z",
  "rssi": -63,
  "battery": 92,
  "sensors": {
    "temperature_c": 7.4,
    "humidity_pct": 58,
    "shock_g": 0.12,
    "tilt_deg": 3,
    "light_exposure": false
  },
  "broadcast_interval_ms": 1000,
  "firmware_version": "v2.3.1",
  "mode": "normal",
  "mac_address": "D4:9A:3C:7F:12:88"
}
```

What the server does
--------------------

- Validates `tag_id` is present
- Stores the payload in an in-memory map (last-seen per tag)
- Emits a `ble` event on the simulator EventEmitter so any existing SSE subscribers receive an updated tracking object
- If a parcel has `tag_id` or `mac_address` set (see `src/routes.ts` demo mapping), the parcel runtime will include a `ble` field and `GET /api/parcels/:id` will return the BLE data under the `ble` key.

Test script
-----------

Use the provided script to POST a sample BLE payload and verify the parcel has BLE data:

```bash
./scripts/test-ble.sh
```

Frontend notes
--------------

- Frontend should expect an optional `ble` object on tracking responses. Example fields: `ble.battery`, `ble.sensors.shock_g`, `ble.rssi`.
- Suggested UI behaviours:
  - Show battery percent near the tracking header when `ble` is present.
  - Raise notifications when `shock_g` exceeds threshold (e.g. 1.5g) or battery is low (<15%).

Security
--------

Set `BLE_API_KEY` in the server environment to require devices to authenticate using `X-API-Key` header.

