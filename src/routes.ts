import type { RoutePoint, TruckDefinition } from "./types.js";

const GPS_POINTS_PER_ROUTE_LEG = 10;

type RouteWaypoint = RoutePoint & {
  deliveryStop?: boolean;
};

const truckOneWaypoints: RouteWaypoint[] = [
  { label: "Docklands Parcel Facility", city: "Docklands", lat: -37.8183, lng: 144.9459 },
  { label: "Victoria Harbour", city: "Docklands", lat: -37.8189, lng: 144.9403 },
  { label: "Marvel Stadium", city: "Docklands", lat: -37.8165, lng: 144.9475, deliveryStop: true },
  { label: "Southern Cross", city: "Melbourne", lat: -37.8183, lng: 144.9525, deliveryStop: true },
  { label: "Queen Victoria Market", city: "Melbourne", lat: -37.8076, lng: 144.9568, deliveryStop: true },
  { label: "Melbourne Central", city: "Melbourne", lat: -37.8106, lng: 144.9631, deliveryStop: true },
  { label: "Bourke Street Mall", city: "Melbourne", lat: -37.8136, lng: 144.9647, deliveryStop: true },
  { label: "Federation Square", city: "Melbourne", lat: -37.8179, lng: 144.9691, deliveryStop: true },
  { label: "Southbank Promenade", city: "Southbank", lat: -37.8206, lng: 144.9646, deliveryStop: true },
  { label: "Crown Melbourne", city: "Southbank", lat: -37.8239, lng: 144.9586, deliveryStop: true },
  { label: "South Melbourne Market", city: "South Melbourne", lat: -37.8326, lng: 144.9566, deliveryStop: true },
  { label: "Montague Street", city: "South Melbourne", lat: -37.8354, lng: 144.9528 },
  { label: "Albert Park", city: "South Melbourne", lat: -37.8424, lng: 144.956 },
  { label: "Albert Road", city: "South Melbourne", lat: -37.8392, lng: 144.9512 },
  { label: "Bay Street", city: "Port Melbourne", lat: -37.8378, lng: 144.9449 },
  { label: "Port Melbourne", city: "Port Melbourne", lat: -37.8396, lng: 144.942, deliveryStop: true },
  { label: "Williamstown Road", city: "Port Melbourne", lat: -37.8345, lng: 144.9318 },
  { label: "Todd Road", city: "Port Melbourne", lat: -37.8295, lng: 144.9215 },
  { label: "Fishermans Bend", city: "Port Melbourne", lat: -37.8255, lng: 144.9207 },
  { label: "Lorimer Street West", city: "Port Melbourne", lat: -37.8247, lng: 144.9293 },
  { label: "Lorimer Street East", city: "Port Melbourne", lat: -37.8236, lng: 144.9394 },
  { label: "Yarra River Crossing", city: "Docklands", lat: -37.822, lng: 144.9477 },
  { label: "Wurundjeri Way", city: "Docklands", lat: -37.8195, lng: 144.9504 },
  { label: "Docklands Return Depot", city: "Docklands", lat: -37.8183, lng: 144.9459 }
];

const truckTwoWaypoints: RouteWaypoint[] = [
  { label: "Richmond Parcel Facility", city: "Richmond", lat: -37.823, lng: 144.998 },
  { label: "Burnley Station", city: "Richmond", lat: -37.8276, lng: 145.007 },
  { label: "Swan Street", city: "Richmond", lat: -37.8255, lng: 144.9957, deliveryStop: true },
  { label: "Church Street", city: "Richmond", lat: -37.8183, lng: 144.9993, deliveryStop: true },
  { label: "East Melbourne", city: "East Melbourne", lat: -37.8136, lng: 144.9828, deliveryStop: true },
  { label: "Jolimont", city: "East Melbourne", lat: -37.8168, lng: 144.9849, deliveryStop: true },
  { label: "MCG", city: "East Melbourne", lat: -37.8199, lng: 144.9834, deliveryStop: true },
  { label: "Fitzroy Gardens", city: "East Melbourne", lat: -37.8139, lng: 144.979, deliveryStop: true },
  { label: "Collins Street", city: "Melbourne", lat: -37.8151, lng: 144.9707, deliveryStop: true },
  { label: "Flinders Street", city: "Melbourne", lat: -37.8183, lng: 144.9671, deliveryStop: true },
  { label: "St Kilda Road", city: "Southbank", lat: -37.8223, lng: 144.9698 },
  { label: "Domain Interchange", city: "Southbank", lat: -37.8314, lng: 144.9716, deliveryStop: true },
  { label: "Kings Way", city: "South Melbourne", lat: -37.8331, lng: 144.965 },
  { label: "Clarendon Street", city: "South Melbourne", lat: -37.8338, lng: 144.9609, deliveryStop: true },
  { label: "Normanby Road", city: "Southbank", lat: -37.8277, lng: 144.9552 },
  { label: "South Wharf", city: "Southbank", lat: -37.8244, lng: 144.9507 },
  { label: "Wurundjeri Way", city: "Docklands", lat: -37.8209, lng: 144.9525 },
  { label: "Batman Avenue Bridge", city: "Melbourne", lat: -37.8198, lng: 144.9734 },
  { label: "Olympic Boulevard", city: "Melbourne", lat: -37.823, lng: 144.9848 },
  { label: "Swan Street East", city: "Richmond", lat: -37.8254, lng: 144.9955 },
  { label: "Church Street North", city: "Richmond", lat: -37.8186, lng: 144.9991 },
  { label: "Richmond Return Depot", city: "Richmond", lat: -37.823, lng: 144.998 }
];

const truckOneRoute = buildRoute(truckOneWaypoints);
const truckTwoRoute = buildRoute(truckTwoWaypoints);

function buildRoute(waypoints: RouteWaypoint[]) {
  const deliveryRouteIndexes: number[] = [];
  const route = waypoints.flatMap((start, index) => {
    const next = waypoints[index + 1];
    if (start.deliveryStop) {
      deliveryRouteIndexes.push(index * GPS_POINTS_PER_ROUTE_LEG);
    }

    if (!next) {
      return [toRoutePoint(start)];
    }

    return Array.from({ length: GPS_POINTS_PER_ROUTE_LEG }, (_, step) => {
      if (step === 0) {
        return toRoutePoint(start);
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

  return { route, deliveryRouteIndexes };
}

function toRoutePoint(waypoint: RouteWaypoint): RoutePoint {
  return {
    label: waypoint.label,
    city: waypoint.city,
    lat: waypoint.lat,
    lng: waypoint.lng
  };
}

function interpolateCoordinate(start: number, end: number, ratio: number) {
  return Number((start + (end - start) * ratio).toFixed(6));
}

export const truckDefinitions: TruckDefinition[] = [
  {
    id: "truck-docklands-01",
    name: "Docklands CBD Run",
    route: truckOneRoute.route,
    parcels: truckOneRoute.deliveryRouteIndexes.map((deliveryRouteIndex, index) => {
      return {
        trackingId: `APD-${String(index + 1).padStart(4, "0")}`,
        recipient: `CBD recipient ${index + 1}`,
        destination: truckOneRoute.route[deliveryRouteIndex],
        deliveryRouteIndex
      };
    })
  },
  {
    id: "truck-richmond-02",
    name: "Richmond South Run",
    route: truckTwoRoute.route,
    parcels: truckTwoRoute.deliveryRouteIndexes.map((deliveryRouteIndex, index) => {
      return {
        trackingId: `APR-${String(index + 1).padStart(4, "0")}`,
        recipient: `Richmond recipient ${index + 1}`,
        destination: truckTwoRoute.route[deliveryRouteIndex],
        deliveryRouteIndex
      };
    })
  }
];
