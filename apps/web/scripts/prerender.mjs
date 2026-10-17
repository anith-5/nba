/*
 * Post-build prerenderer.
 *
 * Vite produces one index.html and Vercel rewrites every path to it, so all
 * twenty-five routes shipped the same <title> and — worse — the same canonical
 * pointing at the homepage. Every page was telling Google it was a duplicate
 * of "/". This writes a real HTML file per route with that route's own title,
 * description, canonical, social tags and structured data.
 *
 * WHY NOT A HEADLESS BROWSER
 * --------------------------
 * The usual approach boots Chrome, loads each route and snapshots the DOM.
 * That needs a browser in the build image, which means adding puppeteer and
 * its ~300MB Chromium download to every Vercel build. For a site whose pages
 * are tools rather than articles, almost all of the SEO value is in the head
 * plus a real <h1> and description, so this writes those directly and lets
 * React replace the body on mount. No browser, no new dependency, and the
 * build stays fast.
 *
 * The skeleton lives inside #root, which React clears on its first render, so
 * there is nothing to hydrate and no mismatch to reconcile.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const dist = path.join(webRoot, "dist");

// The metadata module is plain ESM with no JSX, so it imports directly.
const seo = await import(
  "file://" + path.join(webRoot, "src", "lib", "seo.js").replace(/\\/g, "/")
);
const { ROUTES, SITE, canonicalFor, jsonLdFor, TITLE_MAX, DESC_MAX } = seo;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

/** Replace a tag that already exists in the built HTML, or append to <head>. */
function setTag(html, matcher, replacement) {
  return matcher.test(html)
    ? html.replace(matcher, replacement)
    : html.replace("</head>", `    ${replacement}\n  </head>`);
}

function buildPage(route, meta) {
  const canonical = canonicalFor(route);
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`);
  html = setTag(
    html,
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc(meta.description)}" />`,
  );
  html = setTag(
    html,
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${canonical}" />`,
  );
  html = setTag(
    html,
    /<meta property="og:url"[^>]*>/,
    `<meta property="og:url" content="${canonical}" />`,
  );
  html = setTag(
    html,
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
  );
  html = setTag(
    html,
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
  );
  html = setTag(
    html,
    /<meta name="twitter:title"[^>]*>/,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
  );
  html = setTag(
    html,
    /<meta\s+name="twitter:description"[\s\S]*?\/>/,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
  );

  const ld = jsonLdFor(route);
  if (ld) {
    html = html.replace(
      "</head>",
      `    <script type="application/ld+json" data-seo="route">${JSON.stringify(ld)}</script>\n  </head>`,
    );
  }

  // Real content for the first crawl. React clears #root on mount, so this is
  // never visible for more than a moment and never conflicts with the app.
  const skeleton =
    `<div id="root">` +
    `<main><h1>${esc(meta.h1)}</h1><p>${esc(meta.blurb)}</p></main>` +
    `</div>`;
  html = html.replace('<div id="root"></div>', skeleton);

  return html;
}

const problems = [];
let written = 0;

for (const [route, meta] of Object.entries(ROUTES)) {
  if (meta.title.length > TITLE_MAX)
    problems.push(`${route}: title ${meta.title.length} chars (max ${TITLE_MAX}) — Google will truncate`);
  if (meta.description.length > DESC_MAX)
    problems.push(`${route}: description ${meta.description.length} chars (max ${DESC_MAX})`);
  if (!meta.h1 || !meta.blurb) problems.push(`${route}: missing h1 or blurb`);

  const html = buildPage(route, meta);
  const outDir = route === "/" ? dist : path.join(dist, route.replace(/^\//, ""));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  written += 1;
}

// Regenerate the sitemap from the same table, so it can never list a route
// that does not exist. It previously carried /standings, which is an anchor on
// the homepage rather than a page — Google was crawling it and getting a 404.
const today = new Date().toISOString().slice(0, 10);
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  Object.keys(ROUTES)
    .map(
      (r) =>
        `  <url>\n    <loc>${canonicalFor(r)}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${r === "/" || r === "/games" ? "daily" : "weekly"}</changefreq>\n` +
        `    <priority>${r === "/" ? "1.0" : "0.8"}</priority>\n  </url>`,
    )
    .join("\n") +
  `\n</urlset>\n`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");

// Fallback shell for paths with no page of their own: 404s and the arena's
// ephemeral rooms. Vercel rewrites unmatched paths here rather than to the
// homepage, because the homepage's HTML carries the homepage's canonical —
// which would tell Google every dead URL and every expired room was "/".
const fallback = template
  .replace(/<title>[\s\S]*?<\/title>/, "<title>HoopIQ</title>")
  // Drop the canonical outright: this shell is not a page, so it must not
  // claim to be one. Replace the robots tag rather than adding a second,
  // conflicting one.
  .replace(/<link rel="canonical"[^>]*>\s*/, "")
  .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow" />');
fs.writeFileSync(path.join(dist, "app.html"), fallback, "utf8");

console.log(`[prerender] ${written} routes written + noindex fallback, sitemap regenerated (${Object.keys(ROUTES).length} URLs)`);
if (problems.length) {
  console.error(`[prerender] ${problems.length} metadata problems:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
