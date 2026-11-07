/**
 * Parse Arbeitsagentur Jobsuche HTML SSR payload (works where the REST API is
 * IP-blocked). Used by the Cloudflare Worker and the Actions cache script.
 */

export const BA_HTML_SEARCH =
  "https://www.arbeitsagentur.de/jobsuche/suche";

/**
 * @param {string} html
 * @param {string} [query]
 */
export function jobsFromBaHtml(html, query = "") {
  const match = html.match(
    /<script[^>]*>\s*(\{"correlation-id":[\s\S]*?)\s*<\/script>/
  );
  if (!match) {
    throw new Error("BA HTML: SSR JSON not found");
  }
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error("BA HTML: SSR JSON parse failed");
  }
  const list = data?.suchergebnis?.ergebnisliste || [];
  return list
    .map((job, i) => normalizeHtmlJob(job, query, i))
    .filter(Boolean);
}

function normalizeHtmlJob(job, query, i) {
  const title =
    job.stellenangebotsTitel || job.hauptberuf || query || "Stellenangebot";
  const company = job.firma || "Arbeitgeber";
  const loc =
    job.stellenlokationen?.[0]?.adresse?.ort ||
    job.arbeitsort?.ort ||
    "";
  const ref = job.referenznummer || job.refnr || "";
  if (!ref) return null;

  const remoteHint = JSON.stringify(job).toLowerCase();
  const isRemote = /homeoffice|telearbeit|remote|heimarbeit/.test(remoteHint);

  return {
    id: `ba-${ref}`.slice(0, 120),
    title,
    company,
    location: loc,
    source: "arbeitsagentur",
    sourceLabel: "Arbeitsagentur",
    url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`,
    remote: isRemote,
    published:
      job.veroeffentlichungszeitraum?.von ||
      job.datumErsteVeroeffentlichung ||
      null,
    matchQuery: query,
  };
}

/**
 * Build the BA HTML search URL (no API key).
 */
export function baHtmlSearchUrl({
  query,
  location,
  radiusKm = 50,
  page = 1,
  size = 25,
}) {
  const u = new URL(BA_HTML_SEARCH);
  u.searchParams.set("was", query);
  u.searchParams.set("wo", location);
  u.searchParams.set("umkreis", String(radiusKm));
  u.searchParams.set("page", String(page));
  u.searchParams.set("size", String(Math.min(size, 50)));
  u.searchParams.set("angebotsart", "1");
  return u.toString();
}
