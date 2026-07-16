import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { config } from "./config.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { startExpirySweep } from "./rooms/expiry.js";
import { startRosterSync } from "./data/rosterSync.js";
import { setIo, startTeamPlayersPreload } from "./data/teamPlayersCache.js";

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
startTeamPlayersPreload();

httpServer.listen(config.port, () => {
  console.log(`arena-realtime listening on http://localhost:${config.port}`);
});
