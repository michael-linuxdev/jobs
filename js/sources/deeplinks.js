/**
 * Deep-link builders for portals without usable public browser APIs.
 * These open pre-filled searches; they do not scrape or authenticate.
 */

export function linkedInSearchUrl({ query, location }) {
  const u = new URL("https://www.linkedin.com/jobs/search/");
  u.searchParams.set("keywords", query);
  u.searchParams.set("location", `${location}, Germany`);
  return u.toString();
}

export function xingSearchUrl({ query, location }) {
  const u = new URL("https://www.xing.com/jobs/search");
  u.searchParams.set("keywords", query);
  u.searchParams.set("location", location);
  return u.toString();
}

export function indeedSearchUrl({ query, location, radiusKm }) {
  const u = new URL("https://de.indeed.com/jobs");
  u.searchParams.set("q", query);
  u.searchParams.set("l", location);
  if (radiusKm) u.searchParams.set("radius", String(radiusKm));
  return u.toString();
}

export function stepStoneSearchUrl({ query, location, radiusKm }) {
  // StepStone public search; radius via w parameter when supported
  const u = new URL("https://www.stepstone.de/jobs");
  // Path-style fallback works more reliably than query alone
  const pathQuery = encodeURIComponent(query).replace(/%20/g, "-");
  const pathLoc = encodeURIComponent(location).replace(/%20/g, "-");
  return `https://www.stepstone.de/jobs/${pathQuery}/in-${pathLoc}?radius=${radiusKm || 30}`;
}

export function karriereSachsenSearchUrl({ query, location, radiusKm }) {
  const u = new URL("https://www.karriere.sachsen.de/karriere/job-offers.html");
  u.searchParams.set("searchText", query);
  u.searchParams.set("searchLocation", location || "Sachsen");
  u.searchParams.set("searchRadius", String(radiusKm || 50));
  u.searchParams.set("limit", "20");
  u.searchParams.set("page", "1");
  u.searchParams.set("sortBy", "ReleaseDate");
  u.searchParams.set("sortOrder", "DESC");
  return u.toString();
}

export const EXTERNAL_SOURCES = [
  {
    id: "karriere_sachsen",
    label: "Karriere.sachsen.de",
    build: karriereSachsenSearchUrl,
    note: "Landesportal Sachsen — keine öffentliche JSON-API; Deep-Link.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    build: linkedInSearchUrl,
    note: "Offiziell nur Partner-API (kostenpflichtig, OAuth). Deep-Link.",
  },
  {
    id: "xing",
    label: "Xing",
    build: xingSearchUrl,
    note: "Kein öffentlicher Browser-Endpunkt. Deep-Link.",
  },
  {
    id: "indeed",
    label: "Indeed",
    build: indeedSearchUrl,
    note: "Publisher API abgekündigt / Partnerzugang. Deep-Link.",
  },
  {
    id: "stepstone",
    label: "StepStone",
    build: stepStoneSearchUrl,
    note: "Partner-API, kein CORS für Browser. Deep-Link.",
  },
];
