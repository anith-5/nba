import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE, metaFor, canonicalFor, jsonLdFor } from "../lib/seo.js";

/*
 * Keeps the document head correct as you navigate.
 *
 * The prerenderer writes the right tags into each route's static HTML, which is
 * what a crawler reads. This handles the other half: once React takes over,
 * navigation is client-side and the head would otherwise keep whatever the
 * first-loaded page had. That matters for anything that reads the live DOM —
 * a crawler that executes JavaScript, a social preview fetcher, and the
 * browser tab itself.
 *
 * Tags are updated in place rather than appended, so repeated navigation never
 * leaves two canonicals or a stack of stale descriptions behind.
 */

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function SeoHead() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaFor(pathname);
    const canonical = canonicalFor(pathname);

    // A route with no entry is either a 404 or an ephemeral arena room. Telling
    // search engines not to index those is correct: the room is gone within
    // hours, and an indexed 404 is a dead result.
    if (!meta) {
      document.title = `Not found — ${SITE.name}`;
      upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex, follow" });
      // Drop the canonical rather than leaving the previous page's. A noindex
      // page that also claims to be "/" is contradictory, and a crawler that
      // reads the rendered DOM would see both.
      document.head.querySelector('link[rel="canonical"]')?.remove();
      document.head.querySelector('script[data-seo="route"]')?.remove();
      return;
    }

    document.title = meta.title;
    upsertMeta('meta[name="robots"]', { name: "robots", content: "index, follow" });
    upsertMeta('meta[name="description"]', { name: "description", content: meta.description });
    upsertLink("canonical", canonical);

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: meta.title });
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: meta.description,
    });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: meta.title });
    upsertMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: meta.description,
    });

    const ld = jsonLdFor(pathname);
    let script = document.head.querySelector('script[data-seo="route"]');
    if (ld) {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo", "route");
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(ld);
    } else if (script) {
      script.remove();
    }
  }, [pathname]);

  return null;
}
