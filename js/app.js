import {
  PROFILES,
  DISTANCE_STEPS,
  DEFAULT_LOCATION,
} from "./profiles.js";
import { DEFAULT_PROXY_ORIGIN, JOBS_CACHE_URL } from "./config.js";
import {
  searchArbeitsagentur,
  baPortalSearchUrl,
  normalizeProxyOrigin,
} from "./sources/arbeitsagentur.js";
import { EXTERNAL_SOURCES } from "./sources/deeplinks.js";

const STORAGE_KEY = "jobsuche-prefs-v1";

const state = {
  profileId: "michael",
  location: DEFAULT_LOCATION,
  distanceIndex: 2, // 50 km
  includeRemote: true,
  remoteOnly: false,
  liveBa: true,
  proxyOrigin: DEFAULT_PROXY_ORIGIN,
  status: "idle",
  statusText: "",
  jobs: [],
  dataSource: null, // "live" | "cache" | "demo"
  cacheMeta: null,
  externalLinks: [],
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    Object.assign(state, {
      profileId: p.profileId || state.profileId,
      location: p.location || state.location,
      distanceIndex:
        typeof p.distanceIndex === "number"
          ? p.distanceIndex
          : state.distanceIndex,
      includeRemote: p.includeRemote !== false,
      remoteOnly: !!p.remoteOnly,
      liveBa: p.liveBa !== false,
      // localStorage override only if user set a non-empty value
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
  const block = data?.profiles?.[profileId];
  const jobs = block?.jobs || [];
  return {
    jobs,
    meta: {
      generatedAt: data.generatedAt || null,
      location: block?.location || null,
      radiusKm: block?.radiusKm || data?.defaults?.radiusKm || null,
      source: data.source || "cache",
      note: data.meta?.note || null,
    },
  };
}

async function loadDemoJobs(profileId) {
  const res = await fetch("./data/sample-jobs.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Demo-Daten fehlen");
  const data = await res.json();
  return (data.jobs || []).filter(
    (j) => !j.profiles || j.profiles.includes(profileId)
  );
}

function buildExternalLinks(profile, location, radiusKm) {
  const primary = profile.queries[0];
  return EXTERNAL_SOURCES.map((src) => ({
    id: src.id,
    label: src.label,
    note: src.note,
    url: src.build({ query: primary, location, radiusKm }),
  }));
}

function finalizeJobs(collected, profile) {
  const seen = new Set();
  let jobs = collected.filter((j) => {
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
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
    else lastError = r.reason;
  }
  return { jobs, error: lastError, proxyOrigin };
}

async function runSearch() {
  const profile = PROFILES[state.profileId];
  const radiusKm = DISTANCE_STEPS[state.distanceIndex].km;
  const location = state.location.trim() || DEFAULT_LOCATION;

  state.status = "loading";
  state.statusText = "Suche läuft …";
  state.dataSource = null;
  state.cacheMeta = null;
  state.jobs = [];
  state.externalLinks = buildExternalLinks(profile, location, radiusKm);
  render();
  savePrefs();

  let collected = [];
  let liveError = null;
  let usedProxy = "";

  // 1) Live (optional) — needs proxy on GitHub Pages
  if (state.liveBa) {
    try {
      const live = await tryLiveSearch(profile, location, radiusKm);
      collected = live.jobs;
      liveError = live.error;
      usedProxy = live.proxyOrigin;
      if (collected.length) {
        state.dataSource = "live";
        state.statusText = usedProxy
          ? `${collected.length} Live-Treffer (via Proxy).`
          : `${collected.length} Live-Treffer (direkte BA-API).`;
      }
    } catch (e) {
      liveError = e;
    }
  }

  // 2) Nightly cache — primary offline-friendly path when live fails/empty
  if (!collected.length) {
    try {
      const cache = await loadNightlyCache(profile.id);
      if (cache.jobs.length) {
        collected = cache.jobs;
        state.dataSource = "cache";
        state.cacheMeta = cache.meta;
        const when = cache.meta.generatedAt
          ? new Date(cache.meta.generatedAt).toLocaleString("de-DE")
          : "unbekannt";
        const where = cache.meta.location
          ? `${cache.meta.location} / ${cache.meta.radiusKm || "?"} km`
          : "Default-Ort";
        state.statusText = liveError
          ? `Live fehlgeschlagen (${liveError.message || liveError}). Nacht-Cache (${when}, ${where}).`
          : `Nacht-Cache (${when}, ${where}) — ${collected.length} Treffer.`;
      }
    } catch (e) {
      if (!liveError) liveError = e;
    }
  }

  // 3) Demo seed
  if (!collected.length) {
    try {
      collected = await loadDemoJobs(profile.id);
      state.dataSource = "demo";
      state.statusText = liveError
        ? `Kein Live/Cache (${liveError.message || liveError}). Demo-Daten.`
        : "Demo-Daten (noch kein Cache).";
    } catch (e) {
      state.status = "error";
      state.statusText = `Keine Ergebnisse: ${e.message}`;
      render();
      return;
    }
  }

  state.jobs = finalizeJobs(collected, profile);
  state.status = "ready";
  if (!state.jobs.length && state.remoteOnly) {
    state.statusText += " — nach Remote-Filter keine Treffer.";
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
    btn.innerHTML = `<span class="profile-btn__name">${p.name}</span><span class="profile-btn__short">${p.short}</span>`;
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
  list.innerHTML = "";

  if (!state.jobs.length) {
    empty.hidden = state.status === "loading";
    return;
  }
  empty.hidden = true;

  for (const job of state.jobs) {
    const label =
      state.dataSource === "cache" && !String(job.sourceLabel || "").includes("Cache")
        ? `${job.sourceLabel || "Arbeitsagentur"} (Cache)`
        : job.sourceLabel || job.source;
    const li = document.createElement("li");
    li.className = "job-card";
    li.innerHTML = `
      <div class="job-card__top">
        <p class="job-card__source">${escapeHtml(label)}</p>
        ${job.remote ? `<span class="badge">Remote / HO</span>` : ""}
      </div>
      <h3 class="job-card__title"><a href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a></h3>
      <p class="job-card__meta">${escapeHtml(job.company)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</p>
      ${job.published ? `<p class="job-card__date">${escapeHtml(job.published)}</p>` : ""}
    `;
    list.appendChild(li);
  }
}

function renderExternal() {
  const root = $("#external-links");
  root.innerHTML = "";
  const profile = PROFILES[state.profileId];
  const radiusKm = DISTANCE_STEPS[state.distanceIndex].km;
  const location = state.location.trim() || DEFAULT_LOCATION;

  const baLi = document.createElement("a");
  baLi.className = "ext-link";
  baLi.href = baPortalSearchUrl({
    query: profile.queries[0],
    location,
    radiusKm,
  });
  baLi.target = "_blank";
  baLi.rel = "noopener noreferrer";
  baLi.innerHTML = `<strong>Arbeitsagentur Portal</strong><span>Offizielle Jobsuche im Browser</span>`;
  root.appendChild(baLi);

  const links = state.externalLinks.length
    ? state.externalLinks
    : buildExternalLinks(profile, location, radiusKm);

  for (const link of links) {
    const a = document.createElement("a");
    a.className = "ext-link";
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = `<strong>${escapeHtml(link.label)}</strong><span>${escapeHtml(link.note)}</span>`;
    root.appendChild(a);
  }
}

function renderStatus() {
  const el = $("#status");
  el.dataset.state = state.status;
  el.textContent = state.statusText;
  const banner = $("#source-banner");
  if (state.dataSource === "cache") {
    banner.hidden = false;
    banner.textContent =
      "Nacht-Cache aktiv (GitHub Action). Für Live-Treffer Cloudflare-Worker deployen und Proxy-Origin setzen — siehe proxy/README.md.";
  } else if (state.dataSource === "demo") {
    banner.hidden = false;
    banner.textContent =
      "Demo-Daten. Nightly Cache oder CORS-Proxy einrichten für echte BA-Treffer.";
  } else {
    banner.hidden = true;
  }
  const profile = PROFILES[state.profileId];
  $("#profile-summary").textContent = profile.summary;

  const proxyHint = $("#proxy-default-hint");
  if (proxyHint) {
    const eff = effectiveProxyOrigin();
    proxyHint.textContent = eff
      ? `Aktiv: ${eff} → GET /search`
      : "Kein Proxy gesetzt — Live nur ohne CORS (lokal ggf. ok); sonst Cache.";
  }
}

function render() {
  renderProfiles();
  renderDistance();
  renderJobs();
  renderExternal();
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

  $("#install-hint-dismiss")?.addEventListener("click", () => {
    $("#install-hint").hidden = true;
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
