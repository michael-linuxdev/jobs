/**
 * Jobsuche — Cloudflare Worker CORS proxy for Arbeitsagentur Jobsuche.
 *
 * Fetches the public HTML Jobsuche (SSR JSON) — more reliable than the REST
 * API from cloud IPs — and returns a stellenangebote-shaped JSON payload.
 *
 * Preferred URL (PWA):
 *   GET /health?ping=jobs&q=Erzieherin&loc=Dresden&r=50&n=25
 */

const BA_HTML = "https://www.arbeitsagentur.de/jobsuche/suche";
const UPSTREAM_TIMEOUT_MS = 28000;
const MAX_BODY_BYTES = 3_000_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = buildCors(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    const onHealth =
      url.pathname === "/health" ||
      url.pathname === "/health/" ||
      url.pathname === "/" ||
      url.pathname === "";

    // Alias query keys from the PWA
    const aliases = { q: "was", loc: "wo", r: "umkreis", n: "size", p: "page" };
    for (const [from, to] of Object.entries(aliases)) {
      if (url.searchParams.has(from) && !url.searchParams.has(to)) {
        url.searchParams.set(to, url.searchParams.get(from));
      }
    }

    const wantsSearch =
      url.searchParams.has("was") ||
      url.searchParams.has("wo") ||
      url.searchParams.has("q") ||
      url.searchParams.has("loc") ||
      url.searchParams.get("ping") === "jobs";

    if (onHealth && !wantsSearch) {
      return json(
        {
          ok: true,
          service: "jobsuche-ba-proxy",
          mode: "html-ssr",
          ba: BA_HTML,
        },
        200,
        corsHeaders
      );
    }

    if (
      !(
        (onHealth && wantsSearch) ||
        url.pathname === "/search" ||
        url.pathname === "/search/"
      )
    ) {
      return json(
        { error: "Not found", hint: "GET /health?ping=jobs&q=&loc=&r=&n=" },
        404,
        corsHeaders
      );
    }

    const was = url.searchParams.get("was") || "";
    const wo = url.searchParams.get("wo") || "";
    const umkreis = url.searchParams.get("umkreis") || "50";
    const size = url.searchParams.get("size") || "25";
    const page = url.searchParams.get("page") || "1";

    const dest = new URL(BA_HTML);
    dest.searchParams.set("was", was);
    dest.searchParams.set("wo", wo);
    dest.searchParams.set("umkreis", umkreis);
    dest.searchParams.set("size", size);
    dest.searchParams.set("page", page);
    dest.searchParams.set("angebotsart", "1");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(dest.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de-DE,de;q=0.9",
          "User-Agent": UA,
        },
      });

      const html = await upstream.text();
      if (html.length > MAX_BODY_BYTES) {
        return json({ error: "Upstream HTML too large" }, 502, corsHeaders);
      }
      if (!upstream.ok) {
        return json(
          { error: `BA HTML HTTP ${upstream.status}` },
          502,
          {
            ...corsHeaders,
            "X-Proxy-Upstream-Status": String(upstream.status),
          }
        );
      }

      const stellenangebote = parseSsrToStellenangebote(html);
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=120");
      headers.set("X-Proxy-Upstream-Status", String(upstream.status));
      headers.set("X-Proxy-Mode", "html-ssr");
      headers.set("X-Proxy-Job-Count", String(stellenangebote.length));

      return new Response(JSON.stringify({ stellenangebote }), {
        status: 200,
        headers,
      });
    } catch (err) {
      const aborted = err?.name === "AbortError";
      return json(
        {
          error: aborted ? "Upstream timeout" : "Upstream fetch failed",
          detail: String(err?.message || err),
        },
        aborted ? 504 : 502,
        corsHeaders
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

function parseSsrToStellenangebote(html) {
  const match = html.match(
    /<script[^>]*>\s*(\{"correlation-id":[\s\S]*?)\s*<\/script>/
  );
  if (!match) throw new Error("BA HTML: SSR JSON not found");
  const data = JSON.parse(match[1]);
  const list = data?.suchergebnis?.ergebnisliste || [];
  return list.map((job) => {
    const ort = job.stellenlokationen?.[0]?.adresse?.ort || "";
    return {
      stellenangebot: {
        titel: job.stellenangebotsTitel || job.hauptberuf || "",
        arbeitgeber: job.firma || "",
        arbeitsort: { ort },
        refnr: job.referenznummer || "",
        aktuelleVeroeffentlichungsdatum:
          job.veroeffentlichungszeitraum?.von ||
          job.datumErsteVeroeffentlichung ||
          null,
        arbeitszeit: "",
      },
    };
  });
}

function buildCors(request, env) {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowed = String(env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let allowOrigin = "*";
  if (allowed.length) {
    if (requestOrigin && allowed.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else if (!requestOrigin) {
      allowOrigin = allowed[0];
    } else {
      allowOrigin = "null";
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
