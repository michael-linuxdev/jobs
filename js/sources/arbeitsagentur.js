/**
 * Bundesagentur für Arbeit Jobsuche (inoffizielle, aber öffentlich genutzte API).
 * Docs: https://github.com/bundesAPI/jobsuche-api
 *
 * GitHub Pages: Direct browser calls often fail (CORS + custom X-API-Key).
 * Optional proxyPrefix rewrites the request, e.g. Cloudflare Worker that
 * forwards to rest.arbeitsagentur.de and adds CORS + API key.
 */

const BA_BASE =
  "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs";
const BA_API_KEY = "jobboerse-jobsuche";

/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.location
 * @param {number} opts.radiusKm
 * @param {boolean} opts.includeRemote
 * @param {string} [opts.proxyPrefix] e.g. "https://my-worker.example/ba?"
 * @param {number} [opts.size]
 */
export async function searchArbeitsagentur(opts) {
  const {
    query,
    location,
    radiusKm,
    includeRemote,
    proxyPrefix = "",
    size = 25,
  } = opts;

  const params = new URLSearchParams({
    was: query,
    wo: location,
    umkreis: String(radiusKm),
    page: "1",
    size: String(size),
    angebotsart: "1",
  });

  // Heim-/Telearbeit as additional Arbeitszeit filter when remote desired
  if (includeRemote) {
    params.set("arbeitszeit", "ho");
  }

  let url;
  const headers = { Accept: "application/json" };

  if (proxyPrefix) {
    // Proxy is expected to inject X-API-Key and CORS headers.
    url = `${proxyPrefix}${encodeURIComponent(`${BA_BASE}?${params}`)}`;
  } else {
    url = `${BA_BASE}?${params}`;
    headers["X-API-Key"] = BA_API_KEY;
  }

  const res = await fetch(url, { headers, mode: "cors" });
  if (!res.ok) {
    throw new Error(`Arbeitsagentur HTTP ${res.status}`);
  }

  const data = await res.json();
  // Proxy wrappers like allorigins return { contents: "..." }
  const payload =
    typeof data.contents === "string" ? JSON.parse(data.contents) : data;

  return normalizeBaResponse(payload, query);
}

function normalizeBaResponse(payload, query) {
  const list = payload?.stellenangebote || payload?.jobs || [];
  return list.map((item, i) => {
    const job = item.stellenangebot || item;
    const title =
      job.titel || job.beruf || job.jobTitel || query || "Stellenangebot";
    const company =
      job.arbeitgeber || job.arbeitgeberName || item.arbeitgeber || "Arbeitgeber";
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
      id: `ba-${ref || i}-${title}`.slice(0, 80),
      title,
      company,
      location: ort,
      source: "arbeitsagentur",
      sourceLabel: "Arbeitsagentur",
      url: detailUrl,
      remote: isRemote,
      published: job.aktuelleVeroeffentlichungsdatum || job.datum || null,
      matchQuery: query,
      raw: undefined,
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
