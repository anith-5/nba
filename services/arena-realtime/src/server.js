import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { config } from "./config.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { startExpirySweep } from "./rooms/expiry.js";
import { startRosterSync } from "./data/rosterSync.js";
import { setIo, startTeamPlayersPreload, loadDiskCacheOnStartup } from "./data/teamPlayersCache.js";

const app = express();
app.use(cors({ origin: config.corsOrigins }));
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "arena-realtime" });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.corsOrigins },
});

registerSocketHandlers(io);
startExpirySweep();
startRosterSync();

setIo(io);

// Load whatever team data is already on disk before we start accepting
// connections (fast, local, no network) -- then start listening right away
// and only kick off the (potentially slow, network-bound) 30-team preload
// once the server is actually up. The server must never block on the NBA
// API to become usable.
await loadDiskCacheOnStartup();

httpServer.listen(config.port, () => {
  console.log(`arena-realtime listening on http://localhost:${config.port}`);
  startTeamPlayersPreload();
});
