Frontend changes implemented locally (not committed in frontend repo)
===============================================================

I updated the frontend to display BLE battery and to raise notifications on shock/battery events. The frontend repository in `frontend/trackable_package_frontend` is not a git repo in this workspace, so changes were made directly to files there. Below are the precise edits to apply if you need to reproduce or review them.

Files changed
-------------
- `frontend/trackable_package_frontend/src/types/tracking.ts`
  - Added `BLEEvent` type and made `ble?: BLEEvent` optional field on `ParcelTracking`.

- `frontend/trackable_package_frontend/src/pages/TrackingPage/TrackingPage.tsx`
  - Added BLE-driven notifications in `handleTrackingUpdate` (low battery and shock detection).
  - Display BLE battery in the header next to the Tracking ID when `tracking.ble` is present.

Code snippets
-------------

1) `BLEEvent` type (add to `types/tracking.ts`):

```ts
export interface BLEEvent {
  tagId: string;
  timestamp: string;
  rssi?: number;
  battery?: number;
  sensors?: {
    temperature_c?: number;
    humidity_pct?: number;
    shock_g?: number;
    tilt_deg?: number;
    light_exposure?: boolean;
  };
  macAddress?: string;
}
```

And inside `ParcelTracking` add `ble?: BLEEvent;`.

2) `TrackingPage` changes (high level):
- In `handleTrackingUpdate`, compare previous and current `ble` values and call `addNotification` when battery <= 15% or when `shock_g` crosses >1.5g.
- In the header render, show `🔋 {tracking.ble.battery}%` when `tracking.ble` exists.

How to view/test locally
------------------------
1. Start backend: `cd backend/trackable && npm run dev`
2. Start frontend dev server (in separate terminal): `cd frontend/trackable_package_frontend && npm start`
3. Run the BLE test script to push a sample BLE event and see the server attach `ble` data to the parcel: `cd backend/trackable && ./scripts/test-ble.sh`
4. Open the frontend and track `APD-0004` — you should see battery displayed and notifications appear based on sensor thresholds.

If you'd like I can also copy the modified frontend files into a new branch inside the backend repo (for easier commit/pull-request flow), or create a patch file you can apply to the frontend repo. Tell me which you prefer.

