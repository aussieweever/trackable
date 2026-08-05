import type { RoutePoint, TruckDefinition } from "./types.js";

const GPS_POINTS_PER_ROUTE_LEG = 10;

const truckOneWaypoints = [
  { label: "Docklands Parcel Facility", city: "Docklands", lat: -37.8183, lng: 144.9459 },
  { label: "Victoria Harbour", city: "Docklands", lat: -37.8189, lng: 144.9403 },
  { label: "Marvel Stadium", city: "Docklands", lat: -37.8165, lng: 144.9475 },
  { label: "Southern Cross", city: "Melbourne", lat: -37.8183, lng: 144.9525 },
  { label: "Queen Victoria Market", city: "Melbourne", lat: -37.8076, lng: 144.9568 },
  { label: "Melbourne Central", city: "Melbourne", lat: -37.8106, lng: 144.9631 },
  { label: "Bourke Street Mall", city: "Melbourne", lat: -37.8136, lng: 144.9647 },
  { label: "Federation Square", city: "Melbourne", lat: -37.8179, lng: 144.9691 },
  { label: "Southbank Promenade", city: "Southbank", lat: -37.8206, lng: 144.9646 },
  { label: "Crown Melbourne", city: "Southbank", lat: -37.8239, lng: 144.9586 },
  { label: "South Melbourne Market", city: "South Melbourne", lat: -37.8326, lng: 144.9566 },
  { label: "Albert Park", city: "South Melbourne", lat: -37.8424, lng: 144.956 },
  { label: "Port Melbourne", city: "Port Melbourne", lat: -37.8396, lng: 144.942 },
  { label: "Fishermans Bend", city: "Port Melbourne", lat: -37.8255, lng: 144.9207 },
  { label: "Docklands Return Depot", city: "Docklands", lat: -37.8183, lng: 144.9459 }
];

const truckTwoWaypoints = [
  { label: "Richmond Parcel Facility", city: "Richmond", lat: -37.823, lng: 144.998 },
  { label: "Burnley Station", city: "Richmond", lat: -37.8276, lng: 145.007 },
  { label: "Swan Street", city: "Richmond", lat: -37.8255, lng: 144.9957 },
  { label: "Church Street", city: "Richmond", lat: -37.8183, lng: 144.9993 },
  { label: "East Melbourne", city: "East Melbourne", lat: -37.8136, lng: 144.9828 },
  { label: "Jolimont", city: "East Melbourne", lat: -37.8168, lng: 144.9849 },
  { label: "MCG", city: "East Melbourne", lat: -37.8199, lng: 144.9834 },
  { label: "Fitzroy Gardens", city: "East Melbourne", lat: -37.8139, lng: 144.979 },
  { label: "Collins Street", city: "Melbourne", lat: -37.8151, lng: 144.9707 },
  { label: "Flinders Street", city: "Melbourne", lat: -37.8183, lng: 144.9671 },
  { label: "Domain Interchange", city: "Southbank", lat: -37.8314, lng: 144.9716 },
  { label: "Kings Way", city: "South Melbourne", lat: -37.8331, lng: 144.965 },
  { label: "Clarendon Street", city: "South Melbourne", lat: -37.8338, lng: 144.9609 },
  { label: "South Wharf", city: "Southbank", lat: -37.8244, lng: 144.9507 },
  { label: "Richmond Return Depot", city: "Richmond", lat: -37.823, lng: 144.998 }
];

const deliveryWaypointIndexes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const truckOneRoute = interpolateRoute(truckOneWaypoints);
const truckTwoRoute = interpolateRoute(truckTwoWaypoints);

function interpolateRoute(waypoints: RoutePoint[]): RoutePoint[] {
  return waypoints.flatMap((start, index) => {
    const next = waypoints[index + 1];
    if (!next) {
      return [start];
    }

    return Array.from({ length: GPS_POINTS_PER_ROUTE_LEG }, (_, step) => {
      if (step === 0) {
        return start;
      }

      const ratio = step / GPS_POINTS_PER_ROUTE_LEG;
      return {
        label: `En route to ${next.label}`,
        city: next.city,
        lat: interpolateCoordinate(start.lat, next.lat, ratio),
        lng: interpolateCoordinate(start.lng, next.lng, ratio)
      };
    });
  });
}

function interpolateCoordinate(start: number, end: number, ratio: number) {
  return Number((start + (end - start) * ratio).toFixed(6));
}

export const truckDefinitions: TruckDefinition[] = [
  {
    id: "truck-docklands-01",
    name: "Docklands CBD Run",
    route: truckOneRoute,
    parcels: deliveryWaypointIndexes.map((deliveryWaypointIndex, index) => {
      const deliveryRouteIndex = deliveryWaypointIndex * GPS_POINTS_PER_ROUTE_LEG;
      return {
        trackingId: `APD-${String(index + 1).padStart(4, "0")}`,
        recipient: `CBD recipient ${index + 1}`,
        destination: truckOneRoute[deliveryRouteIndex],
        deliveryRouteIndex
      };
    })
  },
  {
    id: "truck-richmond-02",
    name: "Richmond South Run",
    route: truckTwoRoute,
    parcels: deliveryWaypointIndexes.map((deliveryWaypointIndex, index) => {
      const deliveryRouteIndex = deliveryWaypointIndex * GPS_POINTS_PER_ROUTE_LEG;
      return {
        trackingId: `APR-${String(index + 1).padStart(4, "0")}`,
        recipient: `Richmond recipient ${index + 1}`,
        destination: truckTwoRoute[deliveryRouteIndex],
        deliveryRouteIndex
      };
    })
  }
];
