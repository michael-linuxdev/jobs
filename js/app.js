import {
  PROFILES,
  DISTANCE_STEPS,
  DEFAULT_LOCATION,
  PROFILE_ID_ALIASES,
  resolveProfileId,
} from "./profiles.js";
import { DEFAULT_PROXY_ORIGIN, JOBS_CACHE_URL } from "./config.js";
import {
  searchArbeitsagentur,
  baPortalSearchUrl,
  normalizeProxyOrigin,
} from "./sources/arbeitsagentur.js";

const STORAGE_KEY = "jobsuche-prefs-v2";

const state = {
  profileId: "it_m365",
  location: DEFAULT_LOCATION,
  distanceIndex: 2,
  includeRemote: true,
  remoteOnly: false,
  liveBa: true,
  proxyOrigin: DEFAULT_PROXY_ORIGIN,
  status: "idle",
  statusText: "",
  jobs: [],
  dataSource: null, // "live" | "cache" | null
  cacheMeta: null,
  emptyReason: null,
};

function loadPrefs() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("jobsuche-prefs-v1");
    if (!raw) return;
    const p = JSON.parse(raw);
    Object.assign(state, {
      profileId: resolveProfileId(p.profileId || state.profileId),
      location: p.location || state.location,
      distanceIndex:
        typeof p.distanceIndex === "number"
          ? p.distanceIndex
          : state.distanceIndex,
      includeRemote: p.includeRemote !== false,
      remoteOnly: !!p.remoteOnly,
      liveBa: p.liveBa !== false,
      proxyOrigin:
        typeof p.proxyOrigin === "string" && p.proxyOrigin.trim()
          ? p.proxyOrigin.trim()
          : typeof p.proxyPrefix === "string" && p.proxyPrefix.trim()
            ? p.proxyPrefix.trim()
            : DEFAULT_PROXY_ORIGIN,
    });
  } catch {
    /* ignore */
  }
}

function savePrefs() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      profileId: state.profileId,
      location: state.location,
      distanceIndex: state.distanceIndex,
      includeRemote: state.includeRemote,
      remoteOnly: state.remoteOnly,
      liveBa: state.liveBa,
      proxyOrigin: state.proxyOrigin,
    })
  );
}

function effectiveProxyOrigin() {
  return normalizeProxyOrigin(state.proxyOrigin || DEFAULT_PROXY_ORIGIN);
}

function $(sel) {
  return document.querySelector(sel);
}

function isRealJobUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    // Real BA detail pages — not invented demo search URLs
    if (
      u.hostname === "www.arbeitsagentur.de" &&
      u.pathname.includes("/jobsuche/jobdetail/")
    ) {
      return true;
    }
    // Some BA payloads may only expose portal search — reject those as list items
    return false;
  } catch {
    return false;
  }
}

function scoreJob(job, profile) {
  const hay = `${job.title} ${job.company} ${job.location}`.toLowerCase();
  let score = 0;
  for (const kw of profile.keywords) {
    if (hay.includes(kw.toLowerCase())) score += 2;
  }
  if (job.remote && state.includeRemote) score += 1;
  if (state.remoteOnly && !job.remote) score -= 50;
  return score;
}

async function loadNightlyCache(profileId) {
  const res = await fetch(JOBS_CACHE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Cache HTTP ${res.status}`);
  const data = await res.json();

  // Only accept real BA cache runs — never seed/demo/empty filler
  if (data.source !== "arbeitsagentur") {
    return { jobs: [], meta: { source: data.source || "empty", rejected: true } };
  }

  const legacyId = Object.entries(PROFILE_ID_ALIASES).find(
    ([, current]) => current === profileId
  )?.[0];
  const block =
    data?.profiles?.[profileId] ||
    (legacyId ? data?.profiles?.[legacyId] : null);
  const jobs = (block?.jobs || []).filter((j) => isRealJobUrl(j.url));

  return {
    jobs,
    meta: {
      generatedAt: data.generatedAt || null,
      location: block?.location || null,
      radiusKm: block?.radiusKm || data?.defaults?.radiusKm || null,
      source: data.source,
      note: data.meta?.note || null,
    },
  };
}

function finalizeJobs(collected, profile) {
  const seen = new Set();
  let jobs = collected.filter((j) => {
    if (!isRealJobUrl(j.url)) return false;
    const key = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (state.remoteOnly) {
    jobs = jobs.filter((j) => j.remote);
  }

  jobs.sort((a, b) => scoreJob(b, profile) - scoreJob(a, profile));
  return jobs;
}

async function tryLiveSearch(profile, location, radiusKm) {
  const proxyOrigin = effectiveProxyOrigin();
  const queries = profile.queries.slice(0, 3);
  const results = await Promise.allSettled(
    queries.map((q) =>
      searchArbeitsagentur({
        query: q,
        location,
        radiusKm,
        includeRemote: state.remoteOnly,
        proxyOrigin,
        size: 20,
      })
    )
  );

  const jobs = [];
  let lastError = null;
  let anyAttempted = false;
  for (const r of results) {
    anyAttempted = true;
    if (r.status === "fulfilled") jobs.push(...r.value);
    else lastError = r.reason;
  }
  return { jobs, error: lastError, proxyOrigin, anyAttempted };
}

function emptyMessage({ liveError, proxyOrigin, triedLive, triedCache }) {
  const parts = [];
  if (!proxyOrigin && triedLive) {
    parts.push(
      "Kein CORS-Proxy konfiguriert — Live-Abfrage von GitHub Pages aus blockiert die BA-API."
    );
  } else if (liveError) {
    parts.push(`Live-Abfrage fehlgeschlagen: ${liveError.message || liveError}.`);
  }
  if (triedCache) {
    parts.push(
      "Kein gültiger Nightly-Cache (echte BA-Treffer) vorhanden — Action einmal ausführen oder auf den nächtlichen Lauf warten."
    );
  }
  parts.push("Es werden keine Demo- oder Platzhalterstellen angezeigt.");
  return parts.join(" ");
}

async function runSearch() {
  const profile = PROFILES[state.profileId];
  const radiusKm = DISTANCE_STEPS[state.distanceIndex].km;
  const location = state.location.trim() || DEFAULT_LOCATION;
  const proxyOrigin = effectiveProxyOrigin();

  state.status = "loading";
  state.statusText = "Suche läuft …";
  state.dataSource = null;
  state.cacheMeta = null;
  state.emptyReason = null;
  state.jobs = [];
  render();
  savePrefs();

  let collected = [];
  let liveError = null;
  let triedLive = false;
  let triedCache = false;

  if (state.liveBa) {
    triedLive = true;
    try {
      const live = await tryLiveSearch(profile, location, radiusKm);
      collected = live.jobs;
      liveError = live.error;
      if (collected.length) {
        state.dataSource = "live";
        state.statusText = proxyOrigin
          ? `${collected.length} Live-Treffer (Arbeitsagentur via Proxy)`
          : `${collected.length} Live-Treffer (Arbeitsagentur)`;
      }
    } catch (e) {
      liveError = e;
    }
  }

  if (!collected.length) {
    triedCache = true;
    try {
      const cache = await loadNightlyCache(profile.id);
      if (cache.jobs.length) {
        collected = cache.jobs;
        state.dataSource = "cache";
        state.cacheMeta = cache.meta;
        const when = cache.meta.generatedAt
          ? new Date(cache.meta.generatedAt).toLocaleString("de-DE")
          : "unbekannt";
        state.statusText = `${collected.length} Treffer aus Nightly-Cache (${when})`;
      }
    } catch (e) {
      if (!liveError) liveError = e;
    }
  }

  state.jobs = finalizeJobs(collected, profile);
  state.status = "ready";

  if (!state.jobs.length) {
    state.dataSource = null;
    state.emptyReason = emptyMessage({
      liveError,
      proxyOrigin,
      triedLive,
      triedCache,
    });
    state.statusText = "Keine echten Treffer";
  } else if (state.remoteOnly) {
    // already filtered
  }

  render();
}

function renderProfiles() {
  const root = $("#profile-switch");
  root.innerHTML = "";
  for (const p of Object.values(PROFILES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "profile-btn" + (p.id === state.profileId ? " is-active" : "");
    btn.setAttribute(
      "aria-pressed",
      p.id === state.profileId ? "true" : "false"
    );
    btn.innerHTML = `<span class="profile-btn__name">${escapeHtml(p.name)}</span><span class="profile-btn__short">${escapeHtml(p.short)}</span>`;
    btn.addEventListener("click", () => {
      const defaults = new Set(
        Object.values(PROFILES).map((x) => x.defaultLocation)
      );
      state.profileId = p.id;
      if (!state.location || defaults.has(state.location)) {
        state.location = p.defaultLocation;
        $("#location").value = state.location;
      }
      savePrefs();
      render();
    });
    root.appendChild(btn);
  }
}

function renderDistance() {
  const root = $("#distance-steps");
  root.innerHTML = "";
  DISTANCE_STEPS.forEach((step, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (i === state.distanceIndex ? " is-active" : "");
    btn.textContent = step.label;
    btn.setAttribute(
      "aria-pressed",
      i === state.distanceIndex ? "true" : "false"
    );
    btn.addEventListener("click", () => {
      state.distanceIndex = i;
      savePrefs();
      renderDistance();
      $("#distance-label").textContent = step.label;
    });
    root.appendChild(btn);
  });
  $("#distance-label").textContent = DISTANCE_STEPS[state.distanceIndex].label;
}

function renderJobs() {
  const list = $("#results");
  const empty = $("#empty");
  const count = $("#results-count");
  list.innerHTML = "";

  if (count) {
    count.textContent = state.jobs.length
      ? `${state.jobs.length} Stelle${state.jobs.length === 1 ? "" : "n"}`
      : "";
  }

  if (!state.jobs.length) {
    empty.hidden = state.status === "loading";
    empty.textContent =
      state.status === "loading"
        ? ""
        : state.emptyReason ||
          "Keine Treffer. Ort, Profil oder Remote-Filter anpassen.";
    return;
  }
  empty.hidden = true;

  for (const job of state.jobs) {
    const sourceLabel =
      state.dataSource === "cache"
        ? "Arbeitsagentur · Cache"
        : "Arbeitsagentur · Live";
    const li = document.createElement("li");
    li.className = "job-row";
    li.innerHTML = `
      <a class="job-row__link" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">
        <div class="job-row__top">
          <span class="job-row__source">${escapeHtml(sourceLabel)}</span>
          ${job.remote ? `<span class="badge">Remote / HO</span>` : ""}
        </div>
        <h3 class="job-row__title">${escapeHtml(job.title)}</h3>
        <p class="job-row__meta">${escapeHtml(job.company)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</p>
        ${job.published ? `<p class="job-row__date">${escapeHtml(job.published)}</p>` : ""}
        <span class="job-row__cta">Zur Stelle auf arbeitsagentur.de</span>
      </a>
    `;
    list.appendChild(li);
  }
}

function renderPortalLink() {
  const a = $("#ba-portal-link");
  if (!a) return;
  const profile = PROFILES[state.profileId];
  const radiusKm = DISTANCE_STEPS[state.distanceIndex].km;
  const location = state.location.trim() || DEFAULT_LOCATION;
  a.href = baPortalSearchUrl({
    query: profile.queries[0],
    location,
    radiusKm,
  });
}

function renderStatus() {
  const el = $("#status");
  el.dataset.state = state.status;
  el.textContent = state.statusText;

  const banner = $("#source-banner");
  if (state.dataSource === "cache") {
    banner.hidden = false;
    banner.textContent =
      "Anzeige aus dem Nightly-Cache (echte BA-Daten). Für frische Live-Treffer Proxy in js/config.js oder unter Erweitert setzen.";
  } else if (state.dataSource === "live") {
    banner.hidden = true;
  } else {
    banner.hidden = true;
  }

  $("#profile-summary").textContent = PROFILES[state.profileId].summary;

  const proxyHint = $("#proxy-default-hint");
  if (proxyHint) {
    const eff = effectiveProxyOrigin();
    proxyHint.textContent = eff
      ? `Aktiv: ${eff}`
      : "Noch nicht gesetzt — ohne Proxy keine Live-Treffer auf Pages.";
  }
}

function render() {
  renderProfiles();
  renderDistance();
  renderJobs();
  renderPortalLink();
  renderStatus();
  $("#live-ba").checked = state.liveBa;
  $("#include-remote").checked = state.includeRemote;
  $("#remote-only").checked = state.remoteOnly;
  $("#proxy").value = state.proxyOrigin || "";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function bind() {
  $("#location").value = state.location;
  $("#location").addEventListener("change", (e) => {
    state.location = e.target.value;
    savePrefs();
  });
  $("#location").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.location = e.target.value;
      runSearch();
    }
  });

  $("#include-remote").addEventListener("change", (e) => {
    state.includeRemote = e.target.checked;
    if (!state.includeRemote) state.remoteOnly = false;
    savePrefs();
    render();
  });
  $("#remote-only").addEventListener("change", (e) => {
    state.remoteOnly = e.target.checked;
    if (state.remoteOnly) state.includeRemote = true;
    savePrefs();
    render();
  });
  $("#live-ba").addEventListener("change", (e) => {
    state.liveBa = e.target.checked;
    savePrefs();
  });
  $("#proxy").addEventListener("change", (e) => {
    state.proxyOrigin = e.target.value.trim();
    savePrefs();
    renderStatus();
  });

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.location = $("#location").value;
    runSearch();
  });
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

loadPrefs();
bind();
render();
registerSW();
runSearch();
