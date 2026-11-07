/**
 * Bundesagentur für Arbeit Jobsuche (inoffizielle, öffentlich genutzte API).
 * Docs: https://github.com/bundesAPI/jobsuche-api
 *
 * Browser: prefer Cloudflare Worker via proxyOrigin → GET /search?...
 * Node / Actions: call BA directly with X-API-Key (no CORS).
 */

export const BA_BASE =
  "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs";
export const BA_API_KEY = "jobboerse-jobsuche";

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
    // Hardened worker: /search forwards params and injects API key
    url = `${origin}/search?${params}`;
  } else if (proxyPrefix && /[?&]url=$/.test(proxyPrefix)) {
    // Legacy url= proxy style
    url = `${proxyPrefix}${encodeURIComponent(`${BA_BASE}?${params}`)}`;
  } else {
    url = `${BA_BASE}?${params}`;
    headers["X-API-Key"] = BA_API_KEY;
    // Helps some BA edge nodes when called from CI / Node
    headers["User-Agent"] =
      "JobsucheCache/1.0 (+https://github.com/michael-linuxdev/jobs)";
    headers["Accept-Language"] = "de-DE,de;q=0.9";
  }

  const res = await fetch(url, {
    headers,
    // Node has no CORS; browsers ignore mode on same opaque rules
    ...(typeof window !== "undefined" ? { mode: "cors" } : {}),
  });
  if (!res.ok) {
    throw new Error(`Arbeitsagentur HTTP ${res.status}`);
  }

  const data = await res.json();
  const payload =
    typeof data.contents === "string" ? JSON.parse(data.contents) : data;

  if (payload?.error && !payload?.stellenangebote) {
    throw new Error(payload.error);
  }

  return normalizeBaResponse(payload, query);
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

    const detailUrl = ref
      ? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`
      : `https://www.arbeitsagentur.de/jobsuche/suche?was=${encodeURIComponent(query)}`;

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
  });
}

export function baPortalSearchUrl({ query, location, radiusKm }) {
  const u = new URL("https://www.arbeitsagentur.de/jobsuche/suche");
  u.searchParams.set("was", query);
  u.searchParams.set("wo", location);
  if (radiusKm) u.searchParams.set("umkreis", String(radiusKm));
  return u.toString();
}
