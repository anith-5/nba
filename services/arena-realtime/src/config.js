import "dotenv/config";

// The production site's origins are always allowed, independent of CORS_ORIGIN.
//
// The site moved to a custom domain while CORS_ORIGIN on Render still listed the
// old address, so every browser was refused: the socket.io handshake came back
// 200 with no Access-Control-Allow-Origin, the browser discarded it, the socket
// never connected, and createRoom waited forever -- "stuck on creating room".
// Nothing server-side looked wrong, because only browsers enforce CORS.
//
// It was easy to get wrong because the two services read DIFFERENT variables
// (the API reads CORS_ORIGINS, plural; this reads CORS_ORIGIN) and DEPLOY.md
// only mentions the API's. Pinning the known domain here means a stale or
// misnamed dashboard variable can no longer take the Arena down. CORS_ORIGIN
// still adds to this list -- preview deploys, a staging domain, and so on.
const PRODUCTION_ORIGINS = ["https://hoopiq-nba.com", "https://www.hoopiq-nba.com"];
const LOCAL_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"];

// Browsers send an Origin with no trailing slash, and a CORS match is exact, so
// "https://site.com/" in the dashboard silently matches nothing. Strip it.
function parseOrigins(raw) {
  return (raw || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigins: [
    ...new Set([...PRODUCTION_ORIGINS, ...LOCAL_ORIGINS, ...parseOrigins(process.env.CORS_ORIGIN)]),
  ],
  roomExpiryMs: 2 * 60 * 60 * 1000,
  expirySweepIntervalMs: 5 * 60 * 1000,
};
