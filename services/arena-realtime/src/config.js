import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  roomExpiryMs: 2 * 60 * 60 * 1000,
  expirySweepIntervalMs: 5 * 60 * 1000,
};
