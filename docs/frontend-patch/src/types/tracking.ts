// Tracking data types for the parcel tracking system

export type ParcelStatusType = 
  | 'COLLECTED'
  | 'AT_LOCAL_DEPOT'
  | 'LOADED_ON_VEHICLE'
  | 'DELIVERY_STARTED'
  | 'APPROACHING'
  | 'NEXT_DELIVERY'
  | 'DELIVERED';

export interface ParcelStatus {
  status: ParcelStatusType;
  label: string;
  completedAt?: string;
  isCompleted: boolean;
}

export interface DeliveryWindow {
  start: string; // e.g., "14:30"
  end: string;   // e.g., "15:00"
  date: string;  // e.g., "2026-07-31"
}

export interface VehicleLocation {
  latitude: number;
  longitude: number;
  lastUpdated: string;
}

export interface RouteStop {
  stopIndex: number;
  address: string;
  latitude: number;
  longitude: number;
  recipientName: string;
  isCustomerDelivery: boolean;
  isCompleted: boolean;
  completedAt?: string | null;
}

export interface TrafficSegment {
  from: number;
  to: number;
  fromAddress: string;
  toAddress: string;
  distance: number;
  baseTimeMinutes: number;
  actualTimeMinutes: number;
  trafficMultiplier: number;
  delayMinutes: number;
  hasDelay: boolean;
}

export interface TrafficInfo {
  segments: TrafficSegment[];
  totalDistance: number;
  totalBaseTimeMinutes: number;
  totalActualTimeMinutes: number;
  totalDelayMinutes: number;
  efficiency: number;
}

export interface TrafficIncident {
  id: string;
  type: string;
  description: string;
  affectedSegments: string[];
  affectedStopIndices: number[];
  createdAt: string;
  label: string;
  delayMultiplier: number;
  icon: string;
}

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

export interface DeliveryRoute {
  routeId: string;
  vehicleId: string;
  driverName: string;
  totalStops: number;
  completedStops: number;
  currentStopIndex: number;
  stops?: RouteStop[];
}

export interface ParcelTracking {
  trackingId: string;
  parcelId: string;
  recipientName: string;
  deliveryAddress: string;
  destinationCoords?: {
    latitude: number;
    longitude: number;
  };
  // BLE device data (optional)
  ble?: BLEEvent;
  statuses: ParcelStatus[];
  currentStatus: ParcelStatusType;
  deliveriesBeforeYours: number;
  customerStopIndex?: number;
  estimatedDelivery: DeliveryWindow;
  route: DeliveryRoute;
  vehicleLocation?: VehicleLocation;
  showLiveTracking: boolean;
  trafficInfo?: TrafficInfo;
  activeIncidents?: TrafficIncident[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning';
  message: string;
  timestamp: string;
}

// API Response types
export interface TrackingResponse {
  success: boolean;
  data?: ParcelTracking;
  error?: string;
}

export interface TrackingUpdateEvent {
  trackingId: string;
  eventType: 'STATUS_UPDATE' | 'ETA_UPDATE' | 'LOCATION_UPDATE';
  data: Partial<ParcelTracking>;
  timestamp: string;
}

