/**
 * Bundesagentur für Arbeit Jobsuche (inoffizielle, öffentlich genutzte API).
 * Docs: https://github.com/bundesAPI/jobsuche-api
 *
 * Browser: prefer Cloudflare Worker via proxyOrigin → GET /search?...
 * Node / Actions: call BA directly with X-API-Key (no CORS).
 */

export const BA_BASE =
  "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs";
export const BA_APP_BASE =
  "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs";
export const BA_API_KEY = "jobboerse-jobsuche";
export const BA_APP_UA =
  "Jobsuche/2.9.2 (de.arbeitsagentur.jobboerse; build:1077; iOS 15.1.0) Alamofire/5.4.4";

/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.location
 * @param {number} opts.radiusKm
 * @param {boolean} [opts.includeRemote]
 * @param {string} [opts.proxyOrigin] Worker origin, e.g. https://….workers.dev
 * @param {string} [opts.proxyPrefix] Legacy: full prefix ending with ?url= or bare origin
 * @param {number} [opts.size]
 * @param {number} [opts.page]
 */
export async function searchArbeitsagentur(opts) {
  const {
    query,
    location,
    radiusKm,
    includeRemote = false,
    proxyOrigin = "",
    proxyPrefix = "",
    size = 25,
    page = 1,
  } = opts;

  const params = new URLSearchParams({
    was: query,
    wo: location,
    umkreis: String(radiusKm),
    page: String(page),
    size: String(size),
    angebotsart: "1",
  });

  if (includeRemote) {
    params.set("arbeitszeit", "ho");
  }

  const origin = normalizeProxyOrigin(proxyOrigin || proxyPrefix);
  let url;
  const headers = { Accept: "application/json" };

  if (origin) {
    // Worker injects API key. Use /health?ping=jobs&q=&loc= — agentic CF
    // previews only allow the /health path and may WAF "was"/"wo" query names.
    const proxyParams = new URLSearchParams({
      ping: "jobs",
      q: query,
      loc: location,
      r: String(radiusKm),
      n: String(size),
      p: String(page),
      angebotsart: "1",
    });
    if (includeRemote) proxyParams.set("arbeitszeit", "ho");
    url = `${origin}/health?${proxyParams}`;
  } else if (proxyPrefix && /[?&]url=$/.test(proxyPrefix)) {
    // Legacy url= proxy style
    url = `${proxyPrefix}${encodeURIComponent(`${BA_BASE}?${params}`)}`;
  } else {
    // Direct (Node / Actions): try app endpoint + documented Jobsuche UA first
    headers["X-API-Key"] = BA_API_KEY;
    headers["User-Agent"] = BA_APP_UA;
    headers["Accept-Language"] = "de-DE,de;q=0.9";
  }

  const tryUrls = url
    ? [url]
    : [`${BA_APP_BASE}?${params}`, `${BA_BASE}?${params}`];

  let lastErr = null;
  for (const tryUrl of tryUrls) {
    try {
      const res = await fetch(tryUrl, {
        headers,
        ...(typeof window !== "undefined" ? { mode: "cors" } : {}),
      });
      if (!res.ok) {
        lastErr = new Error(`Arbeitsagentur HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const payload =
        typeof data.contents === "string" ? JSON.parse(data.contents) : data;
      if (payload?.error && !payload?.stellenangebote && !payload?.jobs) {
        lastErr = new Error(payload.error);
        continue;
      }
      return normalizeBaResponse(payload, query);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Arbeitsagentur unreachable");
}

/** Strip trailing slash; accept legacy "?url=" prefixes by taking origin only. */
export function normalizeProxyOrigin(value) {
  if (!value) return "";
  let v = String(value).trim();
  if (!v) return "";
  // If user pasted https://host/?url= or https://host/search
  try {
    if (v.includes("://")) {
      const u = new URL(v.includes("?") ? v : v);
      return `${u.protocol}//${u.host}`;
    }
  } catch {
    /* fall through */
  }
  return v.replace(/\/+$/, "");
}

export function normalizeBaResponse(payload, query) {
  const list = payload?.stellenangebote || payload?.jobs || [];
  return list.map((item, i) => {
    const job = item.stellenangebot || item;
    const title =
      job.titel || job.beruf || job.jobTitel || query || "Stellenangebot";
    const company =
      job.arbeitgeber ||
      job.arbeitgeberName ||
      item.arbeitgeber ||
      "Arbeitgeber";
    const ort =
      job.arbeitsort?.ort ||
      job.arbeitsOrt?.ort ||
      job.ort ||
      item.arbeitsort?.ort ||
      "";
    const ref =
      job.refnr || job.referenznummer || job.refNr || item.refnr || "";
    const remoteHint = String(
      job.arbeitszeit || job.arbeitsZeit || ""
    ).toLowerCase();
    const isRemote =
      remoteHint.includes("ho") ||
      remoteHint.includes("home") ||
      remoteHint.includes("tele") ||
      /home|remote|homeoffice|telearbeit/i.test(
        `${title} ${job.stellenbeschreibung || ""}`
      );

    const externe =
      job.externeUrl || job.externeURL || item.externeUrl || null;
    const detailUrl = ref
      ? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`
      : typeof externe === "string" && /^https:\/\//i.test(externe)
        ? externe
        : null;

    if (!detailUrl) return null;

    return {
      id: `ba-${ref || i}-${title}`.slice(0, 120),
      title,
      company,
      location: ort,
      source: "arbeitsagentur",
      sourceLabel: "Arbeitsagentur",
      url: detailUrl,
      remote: isRemote,
      published: job.aktuelleVeroeffentlichungsdatum || job.datum || null,
      matchQuery: query,
    };
  }).filter(Boolean);
}

export function baPortalSearchUrl({ query, location, radiusKm }) {
  const u = new URL("https://www.arbeitsagentur.de/jobsuche/suche");
  u.searchParams.set("was", query);
  u.searchParams.set("wo", location);
  if (radiusKm) u.searchParams.set("umkreis", String(radiusKm));
  return u.toString();
}
