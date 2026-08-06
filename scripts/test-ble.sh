#!/usr/bin/env bash
set -euo pipefail

URL=${URL:-http://localhost:3000}
TAG=${TAG:-BLE-PT-493A7F12}

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<JSON | curl -sS -X POST "$URL/api/ble/events" -H 'Content-Type: application/json' -d @-
{
  "tag_id": "${TAG}",
  "timestamp": "${TIMESTAMP}",
  "rssi": -63,
  "battery": 92,
  "sensors": {"temperature_c":7.4,"humidity_pct":58,"shock_g":0.12,"tilt_deg":3,"light_exposure":false},
  "broadcast_interval_ms": 1000,
  "firmware_version": "v2.3.1",
  "mode": "normal",
  "mac_address": "D4:9A:3C:7F:12:88"
}
JSON

echo
sleep 0.2
curl -sS "$URL/api/parcels/APD-0004" | python3 -m json.tool
