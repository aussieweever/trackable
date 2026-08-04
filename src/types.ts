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
  status: "loaded" | "in_transit" | "out_for_delivery" | "delivered";
  timestamp: string;
  location: RoutePoint;
  description: string;
};

export type ParcelRuntime = ParcelDefinition & {
  truckId: string;
  status: "loaded" | "in_transit" | "out_for_delivery" | "delivered";
  deliveredAt?: string;
  history: ParcelEvent[];
};

export type TruckSnapshot = {
  id: string;
  name: string;
  currentRouteIndex: number;
  currentLocation: RoutePoint;
  routeLength: number;
  parcelCount: number;
};

export type ActiveTrackingResponse = {
  trackingId: string;
  status: "loaded" | "in_transit" | "out_for_delivery";
  currentLocation: RoutePoint;
  estimatedDeliveryWindow: {
    from: string;
    to: string;
  };
  scheduledDeliveriesBeforeYours: number;
  truck: TruckSnapshot;
  history: ParcelEvent[];
};

export type DeliveredTrackingResponse = {
  trackingId: string;
  status: "delivered";
  deliveredAt: string;
  history: ParcelEvent[];
};

export type TrackingResponse = ActiveTrackingResponse | DeliveredTrackingResponse;

export type SimulatorState = {
  startedAt: string;
  speedMultiplier: number;
  simulatedMinuteMs: number;
  trucks: TruckSnapshot[];
  parcelIds: string[];
};
