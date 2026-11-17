/**
 * jobs-ba-api: Cloudflare Worker als CORS-Proxy fuer jobs.micana.de.
 *
 * Gleiche Pfade wie der lokale Proxy in jobsuche.py:
 *   GET /api/ping
 *   GET /api/jobs?was=&wo=&umkreis=...     Suche
 *   GET /api/jobdetails/<refnr>            Details
 *   GET /api/logo/<kundennummerHash>       Arbeitgeberlogo
 *
 * Die Suche fragt zuerst die REST-API ab. Lehnt die BA die Anfrage ab
 * (z. B. 403 fuer Cloud-IPs), liest der Worker ersatzweise die Trefferliste
 * aus der oeffentlichen HTML-Jobsuche und kennzeichnet das mit quelle: "html".
 */
const REST = "https://rest.arbeitsagentur.de";
const SEARCH = "/jobboerse/jobsuche-service/pc/v4/jobs";
const DETAILS = "/jobboerse/jobsuche-service/pc/v4/jobdetails/";
const LOGO = "/vermittlung/ag-darstellung-service/ct/v1/arbeitgeberlogo/";
const HTML_SEARCH = "https://www.arbeitsagentur.de/jobsuche/suche";
const API_KEY = "jobboerse-jobsuche";
const TIMEOUT_MS = 20000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ALLOWED = new Set([
  "was", "wo", "berufsfeld", "page", "size", "arbeitgeber", "zeitarbeit",
  "veroeffentlichtseit", "pav", "angebotsart", "befristung", "behinderung",
  "corona", "umkreis", "arbeitszeit",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = buildCors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ fehler: "Nur GET erlaubt" }, 405, cors);

    const path = url.pathname.replace(/\/+$/, "");
    try {
      if (path === "" || path === "/api/ping") {
        return json({ ok: true, service: "jobs-ba-api" }, 200, cors);
      }
      if (path === "/api/jobs") return await search(url, cors);
      if (path.startsWith("/api/jobdetails/")) {
        const refnr = decodeURIComponent(path.slice("/api/jobdetails/".length));
        if (!/^[\w.\-]{3,80}$/.test(refnr)) return json({ fehler: "Ungueltige Referenznummer" }, 400, cors);
        return await pass(REST + DETAILS + encodeURIComponent(btoa(refnr)), cors, 300);
      }
      if (path.startsWith("/api/logo/")) {
        const hash = decodeURIComponent(path.slice("/api/logo/".length));
        if (!/^[\w\-=+/]{3,200}$/.test(hash)) return json({ fehler: "Ungueltiger Logo-Hash" }, 400, cors);
        return await pass(REST + LOGO + encodeURIComponent(hash), cors, 86400);
      }
      return json({ fehler: "Unbekannter Pfad" }, 404, cors);
    } catch (err) {
      const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      return json(
        { fehler: timeout ? "BA antwortet nicht rechtzeitig" : "BA nicht erreichbar", detail: String(err?.message || err) },
        timeout ? 504 : 502,
        cors
      );
    }
  },
};

function rest(target) {
  return fetch(target, {
    headers: { "X-API-Key": API_KEY, Accept: "*/*", "Accept-Language": "de-DE,de;q=0.9", "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function pass(target, cors, maxAge) {
  const up = await rest(target);
  const headers = new Headers(cors);
  headers.set("Content-Type", up.headers.get("Content-Type") || "application/json; charset=utf-8");
  headers.set("Cache-Control", up.ok ? `public, max-age=${maxAge}` : "no-store");
  return new Response(up.body, { status: up.status, headers });
}

async function search(url, cors) {
  const qs = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (ALLOWED.has(k) && v !== "") qs.set(k, v);

  let restStatus = 0;
  try {
    const up = await rest(`${REST}${SEARCH}?${qs}`);
    restStatus = up.status;
    if (up.ok) {
      const headers = new Headers(cors);
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=120");
      headers.set("X-Quelle", "rest");
      return new Response(up.body, { status: 200, headers });
    }
    if (up.status === 400) return json({ fehler: "Die BA lehnt die Suchangaben ab" }, 400, cors);
  } catch (err) {
    restStatus = -1;
  }

  // Ersatzweg: HTML-Jobsuche (im Seitenquelltext eingebettetes JSON)
  const html = await fetch(`${HTML_SEARCH}?${qs}`, {
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9", "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!html.ok) {
    return json({ fehler: "BA lehnt beide Wege ab", restStatus, htmlStatus: html.status }, 502, cors);
  }
  const parsed = parseHtml(await html.text());
  if (!parsed) return json({ fehler: "HTML-Jobsuche hat ein unbekanntes Format", restStatus }, 502, cors);
  return json({ ...parsed, quelle: "html", restStatus }, 200, cors);
}

function parseHtml(html) {
  const match = html.match(/<script[^>]*>\s*(\{"correlation-id":[\s\S]*?)\s*<\/script>/);
  if (!match) return null;
  let data;
  try { data = JSON.parse(match[1]); } catch (err) { return null; }
  const erg = data?.suchergebnis || {};
  const list = Array.isArray(erg.ergebnisliste) ? erg.ergebnisliste : [];
  const stellenangebote = list.map((job) => {
    const adr = job.stellenlokationen?.[0]?.adresse || {};
    return {
      titel: job.stellenangebotsTitel || job.hauptberuf || "",
      beruf: job.hauptberuf || "",
      arbeitgeber: job.firma || "",
      arbeitsort: { plz: adr.plz || "", ort: adr.ort || "" },
      refnr: job.referenznummer || "",
      aktuelleVeroeffentlichungsdatum: job.veroeffentlichungszeitraum?.von || job.datumErsteVeroeffentlichung || null,
      eintrittsdatum: job.eintrittszeitraum?.von || null,
      externeUrl: job.externeUrl || job.allianzpartnerUrl || undefined,
    };
  });
  const max = Number(erg.maxErgebnisse ?? erg.anzahlErgebnisse ?? erg.gesamtanzahl);
  return { stellenangebote, maxErgebnisse: Number.isFinite(max) && max > 0 ? max : stellenangebote.length };
}

function buildCors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env?.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let allow = "*";
  if (allowed.length) allow = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
