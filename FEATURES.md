# AusPost Trackable - Feature Documentation

## Privacy Mode

### Overview
Privacy Mode is a customer-centric feature that allows recipients to control when real-time GPS tracking is visible on their parcel. This balances transparency with privacy by revealing location only when necessary.

### How It Works

#### Visual Indicators
The map caption header "Current GPS Position" displays color-coded backgrounds:

| Status | Color | Meaning |
|--------|-------|---------|
| Privacy ON | White (no color) | Tracking completely hidden |
| Privacy OFF + Far | Pale Yellow (#fffef0) | Tracking inactive, >2 stops away |
| Privacy OFF + Close | Pale Green (#e8f7ea) | Tracking active, ≤2 stops away |
| Delivered | Pale Green (#e8f7ea) | Package delivered |

#### Logic Flow
```javascript
if (privacyModeToggle === OFF) {
  if (delivery <= 2 stops away) {
    // Show green: tracking visible
    // Map caption: green background
    // Map canvas: visible
  } else {
    // Show yellow: tracking hidden
    // Map caption: yellow background
    // Map canvas: hidden or reduced opacity
  }
} else {
  // Privacy mode ON
  // Map caption: white (no color)
  // Map canvas: hidden
}
```

### Smart Proximity Detection

The system automatically calculates when to reveal tracking based on delivery clustering:

#### Calculation Algorithm

1. **Haversine Distance Formula**
   - Calculates great-circle distance between delivery GPS coordinates
   - Accurate to within meters

2. **Proximity Clustering**
   - Groups all deliveries within 100-meter radius
   - Creates clusters of nearby stops

3. **Adaptive Reveal Thresholds**
   ```
   If (deliveries in cluster) >= 5:
     reveal 2 stops before delivery
   Else if (deliveries in cluster) > 1:
     reveal 3 stops before delivery
   Else:
     reveal 2 stops before delivery (default)
   ```

#### Example Scenarios

**Scenario 1: Multi-unit Building**
- 8 deliveries to apartments in same building
- Calculation: cluster.length = 8 (>= 5) → reveal distance = 2
- Result: Green background appears when 2 or fewer stops remain

**Scenario 2: Strip Mall**
- 3 deliveries within 100m radius
- Calculation: cluster.length = 3 (> 1) → reveal distance = 3
- Result: Green background appears when 3 or fewer stops remain

**Scenario 3: Single Isolated Delivery**
- Only 1 delivery to this location in the truck
- Calculation: cluster.length = 1 → reveal distance = 2 (default)
- Result: Green background appears when 2 or fewer stops remain

### Implementation Details

#### Frontend Logic
- `calculateDistance(lat1, lng1, lat2, lng2)` - Haversine calculation
- `findProximityClusters(parcels, threshold=100)` - Clustering algorithm
- `calculateRevealDistance(trackingData)` - Determines threshold
- `shouldShowMapTracking(trackingData)` - 2-stop fixed threshold for colors
- `updateMapVisibility(trackingData)` - Applies color classes to caption

#### Backend Data
- `truckParcels` array included in tracking response
- Contains: trackingId, destination coords, deliveryStopNumber
- Enables frontend to perform proximity calculations

### User Experience

**Enabled Privacy Mode:**
- Map caption stays white (no color change)
- Customer has full control over tracking visibility
- Peace of mind knowing location cannot be tracked

**Disabled Privacy Mode:**
- Yellow header = "On its way, still a few stops" (reassurance without stress)
- Green header = "Arriving soon!" (timely notification)
- Natural color progression as delivery approaches

## BLE Integration

### Tag Tracking
- Associate BLE tags with parcels for temperature/shock monitoring
- Real-time tag status in BLE Monitor panel
- Latest event displayed per tag

### Event Management
- Automatic MAC-to-tag associativity
- Bidirectional tag/MAC lookups
- Event history with timestamps and GPS coordinates

### Data Collection
- **RSSI** (signal strength) for proximity sensing
- **Battery** percentage for tag health monitoring
- **Sensors** including temperature and shock detection
- **GPS** location from truck at event time

### Testing Features
- Simulate BLE events from UI
- Map tags to tracking IDs
- View complete event history
- Filter events by tag/tracking/MAC

## Delivery Celebration

### Fireworks Animation
When a parcel status changes to "delivered":
- 50 particles burst from screen center
- 6 different colors (red, yellow, green, blue)
- Staggered timing for smooth effect
- Duration: ~1 second

### Visual Feedback
- Animation creates celebratory mood
- Clear visual confirmation of successful delivery
- Non-intrusive fixed positioning

## Color Coding System

### Route Identification
**Docklands (Blue)**
- Tracking IDs: APD-0001 to APD-0010
- Fleet items: Blue border + light blue background
- Parcel tokens: Blue styling
- BLE event cards: Blue borders/backgrounds

**Richmond (Red)**
- Tracking IDs: APR-0001 to APR-0010
- Fleet items: Red border + light red background
- Parcel tokens: Red styling
- BLE event cards: Red borders/backgrounds

### Privacy Indicators (Map Caption)
- **White**: Privacy enabled (tracking hidden)
- **Yellow**: Privacy disabled, far from delivery
- **Green**: Privacy disabled, close to delivery or delivered

## Speed Control

### Multiplier Levels
```
0.5x  - Half speed (20s per route point)
1x    - Normal speed (10s per route point) [DEFAULT]
5x    - 5x faster
10x   - 10x faster
15x   - 15x faster
20x   - 20x faster
30x   - 30x faster
```

### Implementation
- Speed change sent to `/api/simulation/speed`
- Backend recalculates tick interval: `max(250ms, 10000ms / multiplier)`
- Affects all parcels uniformly

## Interactive Testing

### Manual Controls
- **Restart Route**: Reset simulation, reload all parcels
- **Advance GPS Point**: Manually tick simulation once
- **Refresh**: Reload simulation state

### Quick Selection
- Click parcel token to start tracking
- Color-coded by route (blue/red)
- Numbers indicate parcel position on route

### Real-time Status
- Connection indicator (Disconnected/Connecting/Live updates)
- Live SSE stream updates
- Automatic refresh on changes

## Technical Architecture

### State Management
- Current tracking ID maintained in frontend
- Privacy mode toggle state persists per session
- Tracking data cached for proximity calculations
- BLE events cached for filtering/history

### Performance Optimizations
- SSE for efficient live updates
- Local proximity clustering (no server computation)
- Map invalidation on size changes
- Debounced cascade of updates

### Error Handling
- Graceful fallback for missing GPS data
- Network error recovery with reconnection attempts
- Invalid tracking ID feedback
- BLE event parsing validation

