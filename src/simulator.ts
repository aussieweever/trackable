import { EventEmitter } from "node:events";
import { truckDefinitions } from "./routes.js";
import type {
  ParcelEvent,
  ParcelRuntime,
  RoutePoint,
  SimulatorState,
  TrackingResponse,
  TruckDefinition,
  TruckSnapshot
} from "./types.js";

type TruckRuntime = TruckDefinition & {
  currentRouteIndex: number;
};

const BASE_UPDATE_INTERVAL_MS = 10_000;
const DELIVERY_WINDOW_MS = 60 * 60 * 1000;
const OUT_FOR_DELIVERY_STEPS = 20;

export class DeliverySimulator extends EventEmitter {
  private trucks: TruckRuntime[] = [];
  private parcels = new Map<string, ParcelRuntime>();
  private startedAt = new Date();
  private timer?: NodeJS.Timeout;
  private speedMultiplier = 1;

  constructor(private readonly definitions = truckDefinitions) {
    super();
    this.restart();
  }

  restart() {
    this.stopTimer();
    this.startedAt = new Date();
    this.trucks = this.definitions.map((truck) => ({ ...truck, currentRouteIndex: 0 }));
    this.parcels = new Map();

    for (const truck of this.trucks) {
      for (const parcel of truck.parcels) {
        const runtime: ParcelRuntime = {
          ...parcel,
          truckId: truck.id,
          status: "loaded",
          history: [
            this.createEvent(
              "loaded",
              this.startedAt,
              truck.route[0],
              `Parcel loaded onto ${truck.name}.`
            )
          ]
        };
        this.parcels.set(parcel.trackingId, runtime);
      }
    }

    this.startTimer();
    this.emit("restart", this.getState());
    for (const parcelId of this.parcels.keys()) {
      this.emitTracking(parcelId);
    }
  }

  setSpeed(multiplier: number) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error("Speed multiplier must be a positive number.");
    }
    this.speedMultiplier = multiplier;
    this.startTimer();
    this.emit("speedChanged", this.getState());
  }

  getState(): SimulatorState {
    return {
      startedAt: this.startedAt.toISOString(),
      speedMultiplier: this.speedMultiplier,
      updateIntervalMs: this.getTickMs(),
      simulatedMinuteMs: this.getTickMs(),
      trucks: this.trucks.map((truck) => this.snapshotTruck(truck)),
      parcelIds: [...this.parcels.keys()]
    };
  }

  getTracking(trackingId: string): TrackingResponse | undefined {
    const parcel = this.parcels.get(trackingId);
    if (!parcel) {
      return undefined;
    }

    if (parcel.status === "delivered") {
      return {
        trackingId: parcel.trackingId,
        recipient: parcel.recipient,
        destination: parcel.destination,
        status: "delivered",
        deliveredAt: parcel.deliveredAt ?? parcel.history.at(-1)?.timestamp ?? this.startedAt.toISOString(),
        history: parcel.history
      };
    }

    const truck = this.requireTruck(parcel.truckId);
    const currentLocation = truck.route[truck.currentRouteIndex];
    const remainingRouteSteps = Math.max(parcel.deliveryRouteIndex - truck.currentRouteIndex, 0);
    const etaFrom = new Date(Date.now() + remainingRouteSteps * this.getTickMs());

    return {
      trackingId: parcel.trackingId,
      recipient: parcel.recipient,
      destination: parcel.destination,
      status: parcel.status,
      currentLocation,
      estimatedDeliveryWindow: {
        from: etaFrom.toISOString(),
        to: new Date(etaFrom.getTime() + DELIVERY_WINDOW_MS).toISOString()
      },
      scheduledDeliveriesBeforeYours: this.countPendingDeliveriesBefore(parcel, truck),
      truck: this.snapshotTruck(truck),
      history: parcel.history
    };
  }

  tick() {
    for (const truck of this.trucks) {
      if (truck.currentRouteIndex < truck.route.length - 1) {
        truck.currentRouteIndex += 1;
      }
      this.updateTruckParcels(truck);
    }
  }

  private updateTruckParcels(truck: TruckRuntime) {
    const now = new Date();

    for (const parcel of this.parcels.values()) {
      if (parcel.truckId !== truck.id || parcel.status === "delivered") {
        continue;
      }

      if (truck.currentRouteIndex >= parcel.deliveryRouteIndex) {
        parcel.status = "delivered";
        parcel.deliveredAt = now.toISOString();
        parcel.history.push(
          this.createEvent("delivered", now, parcel.destination, `Parcel delivered in ${parcel.destination.city}.`)
        );
        this.emitTracking(parcel.trackingId);
        continue;
      }

      const nextStatus = truck.currentRouteIndex >= Math.max(parcel.deliveryRouteIndex - OUT_FOR_DELIVERY_STEPS, 1)
        ? "out_for_delivery"
        : "in_transit";

      if (parcel.status !== nextStatus) {
        parcel.status = nextStatus;
        parcel.history.push(
          this.createEvent(
            nextStatus,
            now,
            truck.route[truck.currentRouteIndex],
            nextStatus === "out_for_delivery"
              ? "Your parcel is on its way to you."
              : `Parcel is moving through ${truck.route[truck.currentRouteIndex].city}.`
          )
        );
        this.emitTracking(parcel.trackingId);
      } else {
        this.emitTracking(parcel.trackingId);
      }
    }
  }

  private countPendingDeliveriesBefore(parcel: ParcelRuntime, truck: TruckRuntime) {
    return [...this.parcels.values()].filter((candidate) => {
      return candidate.truckId === truck.id
        && candidate.status !== "delivered"
        && candidate.deliveryRouteIndex < parcel.deliveryRouteIndex
        && candidate.deliveryRouteIndex >= truck.currentRouteIndex;
    }).length;
  }

  private snapshotTruck(truck: TruckRuntime): TruckSnapshot {
    return {
      id: truck.id,
      name: truck.name,
      currentRouteIndex: truck.currentRouteIndex,
      currentLocation: truck.route[truck.currentRouteIndex],
      routeLength: truck.route.length,
      parcelCount: truck.parcels.length
    };
  }

  private createEvent(
    status: ParcelEvent["status"],
    timestamp: Date,
    location: RoutePoint,
    description: string
  ): ParcelEvent {
    return {
      status,
      timestamp: timestamp.toISOString(),
      location,
      description
    };
  }

  private requireTruck(truckId: string) {
    const truck = this.trucks.find((candidate) => candidate.id === truckId);
    if (!truck) {
      throw new Error(`Truck ${truckId} not found.`);
    }
    return truck;
  }

  private emitTracking(trackingId: string) {
    this.emit("tracking", trackingId, this.getTracking(trackingId));
  }

  private startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), this.getTickMs());
    this.timer.unref();
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private getTickMs() {
    return Math.max(250, Math.round(BASE_UPDATE_INTERVAL_MS / this.speedMultiplier));
  }
}
