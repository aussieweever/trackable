import { roadRouteData } from "./road-route-data.js";
import type { RoutePoint, TruckDefinition } from "./types.js";

type RoadRoute = {
  geometry: string;
  deliveryStops: readonly {
    label: string;
    city: string;
    routeIndex: number;
  }[];
};

function buildTruck(
  id: string,
  name: string,
  trackingPrefix: string,
  recipientPrefix: string,
  depotLabel: string,
  depotCity: string,
  routeData: RoadRoute
): TruckDefinition {
  const decodedRoute = decodePolyline6(routeData.geometry);
  const route = decodedRoute.map((point, index) => {
    if (index === 0 || index === decodedRoute.length - 1) {
      return {
        ...point,
        label: depotLabel,
        city: depotCity
      };
    }

    const deliveryStop = routeData.deliveryStops.find((stop) => stop.routeIndex === index);
    if (deliveryStop) {
      return {
        ...point,
        label: deliveryStop.label,
        city: deliveryStop.city
      };
    }

    const nextDeliveryStop = routeData.deliveryStops.find((stop) => stop.routeIndex > index);
    return {
      ...point,
      label: nextDeliveryStop ? `En route to ${nextDeliveryStop.label}` : "Returning to depot",
      city: nextDeliveryStop?.city ?? depotCity
    };
  });

  return {
    id,
    name,
    route,
    parcels: routeData.deliveryStops.map((deliveryStop, index) => ({
      trackingId: `${trackingPrefix}-${String(index + 1).padStart(4, "0")}`,
      recipient: `${recipientPrefix} recipient ${index + 1}`,
      destination: route[deliveryStop.routeIndex],
      deliveryRouteIndex: deliveryStop.routeIndex
    }))
  };
}

function decodePolyline6(encoded: string): RoutePoint[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: RoutePoint[] = [];

  while (index < encoded.length) {
    const latitudeResult = decodePolylineValue(encoded, index);
    index = latitudeResult.nextIndex;
    lat += latitudeResult.value;

    const longitudeResult = decodePolylineValue(encoded, index);
    index = longitudeResult.nextIndex;
    lng += longitudeResult.value;

    points.push({
      label: "GPS route point",
      city: "Melbourne",
      lat: roundCoordinate(lat / 1e6),
      lng: roundCoordinate(lng / 1e6)
    });
  }

  return points;
}

function decodePolylineValue(encoded: string, startIndex: number) {
  let index = startIndex;
  let result = 0;
  let shift = 0;
  let byte = 0;

  do {
    byte = encoded.charCodeAt(index) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    index += 1;
  } while (byte >= 0x20);

  return {
    nextIndex: index,
    value: result & 1 ? ~(result >> 1) : result >> 1
  };
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}

export const truckDefinitions: TruckDefinition[] = [
  buildTruck(
    "truck-docklands-01",
    "Docklands CBD Run",
    "APD",
    "CBD",
    "Docklands Parcel Facility",
    "Docklands",
    roadRouteData.docklands
  ),
  buildTruck(
    "truck-richmond-02",
    "Richmond South Run",
    "APR",
    "Richmond",
    "Richmond Parcel Facility",
    "Richmond",
    roadRouteData.richmond
  )
];
