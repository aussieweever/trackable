import cors from "cors";
import express from "express";
import { DeliverySimulator } from "./simulator.js";

const app = express();
const simulator = new DeliverySimulator();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.use("/vendor/leaflet", express.static("node_modules/leaflet/dist"));
app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/simulation", (_req, res) => {
  res.json(simulator.getState());
});

app.get("/api/map-tiles/:z/:y/:x", async (req, res) => {
  const { z, y, x } = req.params;
  if (![z, y, x].every((value) => /^\d+$/.test(value))) {
    res.status(400).json({ error: "Invalid tile coordinates." });
    return;
  }

  const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  try {
    const tileResponse = await fetch(tileUrl, {
      headers: {
        "User-Agent": "auspost-trackable-local-simulator/1.0"
      }
    });

    if (!tileResponse.ok || !tileResponse.body) {
      res.status(502).json({ error: "Map tile could not be loaded." });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", tileResponse.headers.get("content-type") ?? "image/png");
    res.send(Buffer.from(await tileResponse.arrayBuffer()));
  } catch {
    res.status(502).json({ error: "Map tile could not be loaded." });
  }
});

app.post("/api/simulation/speed", (req, res) => {
  try {
    simulator.setSpeed(Number(req.body?.multiplier));
    res.json(simulator.getState());
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid speed multiplier." });
  }
});

app.post("/api/simulation/restart", (_req, res) => {
  simulator.restart();
  res.json(simulator.getState());
});

app.post("/api/simulation/tick", (_req, res) => {
  simulator.tick();
  res.json(simulator.getState());
});

app.get("/api/parcels/:trackingId", (req, res) => {
  const tracking = simulator.getTracking(req.params.trackingId);
  if (!tracking) {
    res.status(404).json({ error: "Tracking ID not found." });
    return;
  }
  res.json(tracking);
});

app.get("/api/parcels/:trackingId/events", (req, res) => {
  const trackingId = req.params.trackingId;
  const initialTracking = simulator.getTracking(trackingId);

  if (!initialTracking) {
    res.status(404).json({ error: "Tracking ID not found." });
    return;
  }

  res.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onTracking = (updatedTrackingId: string, data: unknown) => {
    if (updatedTrackingId === trackingId) {
      send("tracking", data);
    }
  };

  send("tracking", initialTracking);
  simulator.on("tracking", onTracking);

  const heartbeat = setInterval(() => send("heartbeat", { timestamp: new Date().toISOString() }), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    simulator.off("tracking", onTracking);
    res.end();
  });
});

app.listen(port, () => {
  console.log(`AusPost delivery simulator listening on http://localhost:${port}`);
});
