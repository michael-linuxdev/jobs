import {
  PROFILES,
  DISTANCE_STEPS,
  DEFAULT_LOCATION,
} from "./profiles.js";
import {
  searchArbeitsagentur,
  baPortalSearchUrl,
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
  proxyPrefix: "",
  status: "idle",
  statusText: "",
  jobs: [],
  usedDemo: false,
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
      proxyPrefix: p.proxyPrefix || "",
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
      proxyPrefix: state.proxyPrefix,
    })
  );
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

async function runSearch() {
  const profile = PROFILES[state.profileId];
  const radiusKm = DISTANCE_STEPS[state.distanceIndex].km;
  const location = state.location.trim() || DEFAULT_LOCATION;

  state.status = "loading";
  state.statusText = "Suche läuft …";
  state.usedDemo = false;
  state.jobs = [];
  state.externalLinks = buildExternalLinks(profile, location, radiusKm);
  render();
  savePrefs();

  let collected = [];
  let liveError = null;

  if (state.liveBa) {
    const queries = profile.queries.slice(0, 3);
    const results = await Promise.allSettled(
      queries.map((q) =>
        searchArbeitsagentur({
          query: q,
          location,
          radiusKm,
          // BA `arbeitszeit=ho` is exclusive — only use for „nur Remote“
          includeRemote: state.remoteOnly,
          proxyPrefix: state.proxyPrefix.trim(),
          size: 20,
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") collected.push(...r.value);
      else liveError = r.reason;
    }
  }

  if (!collected.length) {
    try {
      collected = await loadDemoJobs(profile.id);
      state.usedDemo = true;
      state.statusText = liveError
        ? `Live-API nicht erreichbar (${liveError.message || liveError}). Demo-Ergebnisse geladen.`
        : "Demo-Ergebnisse (Live-Suche aus oder leer).";
    } catch (e) {
      state.status = "error";
      state.statusText = `Keine Ergebnisse: ${e.message}`;
      render();
      return;
    }
  } else {
    state.statusText = `${collected.length} Treffer von der Arbeitsagentur.`;
  }

  const seen = new Set();
  collected = collected.filter((j) => {
    const key = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (state.remoteOnly) {
    collected = collected.filter((j) => j.remote);
  }

  collected.sort((a, b) => scoreJob(b, profile) - scoreJob(a, profile));
  state.jobs = collected;
  state.status = "ready";
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
    const li = document.createElement("li");
    li.className = "job-card";
    li.innerHTML = `
      <div class="job-card__top">
        <p class="job-card__source">${escapeHtml(job.sourceLabel || job.source)}</p>
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
  $("#demo-banner").hidden = !state.usedDemo;
  const profile = PROFILES[state.profileId];
  $("#profile-summary").textContent = profile.summary;
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
  $("#proxy").value = state.proxyPrefix;
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
    state.proxyPrefix = e.target.value.trim();
    savePrefs();
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
