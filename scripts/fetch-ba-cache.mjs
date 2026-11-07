#!/usr/bin/env node
/**
 * Fetch Arbeitsagentur jobs via the public HTML Jobsuche (SSR JSON) and write
 * data/jobs-cache.json. Prefer this over the REST API which is often IP-blocked
 * from cloud runners. No secrets required.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILES, DISTANCE_STEPS } from "../js/profiles.js";
import {
  baHtmlSearchUrl,
  jobsFromBaHtml,
} from "../js/sources/ba-html.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "jobs-cache.json");

const DEFAULT_RADIUS_KM = DISTANCE_STEPS[2].km;
const QUERIES_PER_PROFILE = 3;
const SIZE_PER_QUERY = 25;
const SLEEP_MS = 500;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter((j) => {
    const key = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHtmlJobs(query, location, radiusKm) {
  const url = baHtmlSearchUrl({
    query,
    location,
    radiusKm,
    size: SIZE_PER_QUERY,
  });
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "de-DE,de;q=0.9",
      "User-Agent": UA,
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`BA HTML HTTP ${res.status}`);
  const html = await res.text();
  return jobsFromBaHtml(html, query);
}

async function fetchProfile(profile) {
  const location = profile.defaultLocation;
  const radiusKm = DEFAULT_RADIUS_KM;
  const queries = profile.queries.slice(0, QUERIES_PER_PROFILE);
  const jobs = [];
  const errors = [];

  for (const query of queries) {
    try {
      const batch = await fetchHtmlJobs(query, location, radiusKm);
      for (const job of batch) {
        jobs.push({ ...job, profiles: [profile.id] });
      }
      console.log(
        `  ✓ ${profile.id} / "${query}" → ${batch.length} @ ${location}`
      );
    } catch (err) {
      const msg = err?.message || String(err);
      errors.push({ query, error: msg });
      console.warn(`  ✗ ${profile.id} / "${query}": ${msg}`);
    }
    await sleep(SLEEP_MS);
  }

  const unique = dedupe(jobs);
  return {
    profileId: profile.id,
    location,
    radiusKm,
    queries,
    jobCount: unique.length,
    jobs: unique,
    errors,
  };
}

async function main() {
  console.log("Fetching BA HTML cache for profiles…");
  const profiles = {};
  let total = 0;
  let anyOk = false;

  for (const profile of Object.values(PROFILES)) {
    console.log(`Profile ${profile.id}…`);
    const result = await fetchProfile(profile);
    profiles[profile.id] = result;
    total += result.jobCount;
    if (result.jobCount > 0) anyOk = true;
  }

  if (!anyOk) {
    console.error(
      "All BA HTML fetches failed — leaving existing data/jobs-cache.json untouched."
    );
    process.exit(1);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "arbeitsagentur",
    api: "html-ssr/jobsuche/suche",
    defaults: { radiusKm: DEFAULT_RADIUS_KM },
    profiles,
    meta: {
      totalJobs: total,
      partial: Object.values(profiles).some((p) => p.errors?.length),
      allFailed: false,
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUT} (${total} jobs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
