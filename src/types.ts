export type Coordinates = {
  lat: number;
  lng: number;
};

export type RoutePoint = Coordinates & {
  label: string;
  city: string;
};

export type ParcelDefinition = {
  trackingId: string;
  recipient: string;
  destination: RoutePoint;
  deliveryRouteIndex: number;
};

export type TruckDefinition = {
  id: string;
  name: string;
  route: RoutePoint[];
  parcels: ParcelDefinition[];
};

export type ParcelEvent = {
  status: "loaded" | "in_transit" | "out_for_delivery" | "arriving_soon" | "delivered";
  timestamp: string;
  location: RoutePoint;
  description: string;
};

export type BLEEvent = {
  tagId: string;
  timestamp?: string;
  rssi?: number;
  battery?: number;
  sensors?: Record<string, any>;
  macAddress?: string;
  gps?: {
    lat: number;
    lng: number;
    label?: string;
    city?: string;
  };
  raw?: unknown;
};

export type ParcelRuntime = ParcelDefinition & {
  truckId: string;
  status: "loaded" | "in_transit" | "out_for_delivery" | "delivered";
  deliveredAt?: string;
  history: ParcelEvent[];
  // optional BLE device data attached at runtime
  ble?: BLEEvent;
};

export type TruckSnapshot = {
  id: string;
  name: string;
  currentRouteIndex: number;
  currentLocation: RoutePoint;
  routeLength: number;
  parcelCount: number;
};

export type TruckParcelInfo = {
  trackingId: string;
  destination: Coordinates;
  deliveryStopNumber: number;
};

export type ActiveTrackingResponse = {
  trackingId: string;
  recipient: string;
  destination: RoutePoint;
  status: "loaded" | "in_transit" | "out_for_delivery";
  currentLocation: RoutePoint;
  estimatedDeliveryWindow: {
    from: string;
    to: string;
  };
  scheduledDeliveriesBeforeYours: number;
  deliveryStopNumber: number;
  deliveryTotalStops: number;
  truck: TruckSnapshot;
  truckParcels: TruckParcelInfo[];
  history: ParcelEvent[];
  ble?: BLEEvent;
};

export type DeliveredTrackingResponse = {
  trackingId: string;
  recipient: string;
  destination: RoutePoint;
  status: "delivered";
  deliveredAt: string;
  deliveryStopNumber: number;
  deliveryTotalStops: number;
  truckParcels: TruckParcelInfo[];
  history: ParcelEvent[];
  ble?: BLEEvent;
};

export type TrackingResponse = ActiveTrackingResponse | DeliveredTrackingResponse;

export type SimulatorState = {
  startedAt: string;
  speedMultiplier: number;
  updateIntervalMs: number;
  simulatedMinuteMs: number;
  trucks: TruckSnapshot[];
  parcelIds: string[];
};
