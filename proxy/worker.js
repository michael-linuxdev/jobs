/**
 * Jobsuche — Cloudflare Worker CORS proxy for Arbeitsagentur Jobsuche API.
 *
 * Endpoints:
 *   GET  /health
 *   GET  /search?was=&wo=&umkreis=&size=&page=&angebotsart=&arbeitszeit=
 *   GET  /?url=<encoded https://rest.arbeitsagentur.de/...>   (legacy)
 *   OPTIONS *  (CORS preflight)
 *
 * Deploy: see proxy/README.md
 * Env (optional): ALLOWED_ORIGINS=https://michael-linuxdev.github.io,http://127.0.0.1:8080
 */

const BA_ORIGIN = "https://rest.arbeitsagentur.de";
const BA_PATH_PREFIX = "/jobboerse/jobsuche-service/";
const BA_API_KEY = "jobboerse-jobsuche";
const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_BODY_BYTES = 2_500_000;

const SEARCH_PARAMS = new Set([
  "was",
  "wo",
  "umkreis",
  "size",
  "page",
  "angebotsart",
  "arbeitszeit",
  "befristung",
  "berufsfeld",
  "veroeffentlichtseit",
  "zeitarbeit",
  "pav",
]);

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

    if (url.pathname === "/health" || url.pathname === "/health/") {
      return json(
        { ok: true, service: "jobsuche-ba-proxy", ba: BA_ORIGIN },
        200,
        corsHeaders
      );
    }

    let dest;
    try {
      if (url.pathname === "/search" || url.pathname === "/search/") {
        dest = buildSearchUrl(url.searchParams);
      } else if (url.pathname === "/" || url.pathname === "") {
        dest = parseLegacyUrlParam(url.searchParams.get("url"));
      } else {
        return json(
          {
            error: "Not found",
            hint: "Use GET /search?... or GET /?url=...",
          },
          404,
          corsHeaders
        );
      }
    } catch (err) {
      return json(
        { error: err.message || "Bad request" },
        400,
        corsHeaders
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(dest.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-API-Key": BA_API_KEY,
          "User-Agent": "Jobsuche-BA-Proxy/1.0 (+https://github.com/michael-linuxdev/jobs)",
        },
      });

      const buf = await upstream.arrayBuffer();
      if (buf.byteLength > MAX_BODY_BYTES) {
        return json({ error: "Upstream response too large" }, 502, corsHeaders);
      }

      const headers = new Headers(corsHeaders);
      headers.set(
        "Content-Type",
        upstream.headers.get("Content-Type") || "application/json; charset=utf-8"
      );
      headers.set("Cache-Control", "public, max-age=120");
      headers.set("X-Proxy-Upstream-Status", String(upstream.status));

      return new Response(buf, {
        status: upstream.status,
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

function buildSearchUrl(params) {
  const out = new URL(`${BA_ORIGIN}${BA_PATH_PREFIX}pc/v4/jobs`);
  for (const [key, value] of params.entries()) {
    if (!SEARCH_PARAMS.has(key)) continue;
    if (value === "") continue;
    out.searchParams.append(key, value);
  }
  if (!out.searchParams.has("angebotsart")) {
    out.searchParams.set("angebotsart", "1");
  }
  if (!out.searchParams.has("size")) {
    out.searchParams.set("size", "25");
  }
  if (!out.searchParams.has("page")) {
    out.searchParams.set("page", "1");
  }
  return out;
}

function parseLegacyUrlParam(raw) {
  if (!raw) {
    throw new Error("Missing ?url= (or use /search?was=&wo=)");
  }
  let dest;
  try {
    dest = new URL(raw);
  } catch {
    throw new Error("Invalid url parameter");
  }
  if (dest.protocol !== "https:") {
    throw new Error("Only https upstream allowed");
  }
  if (dest.hostname !== "rest.arbeitsagentur.de") {
    throw new Error("Host not allowed");
  }
  if (!dest.pathname.startsWith(BA_PATH_PREFIX)) {
    throw new Error("Path not allowed");
  }
  // Disallow userinfo / credentials in URL
  if (dest.username || dest.password) {
    throw new Error("Credentials in url not allowed");
  }
  return dest;
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
      // non-browser / curl
      allowOrigin = allowed[0];
    } else {
      allowOrigin = "null";
    }
  }

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "false";
  }
  return headers;
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
