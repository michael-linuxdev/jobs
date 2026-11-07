#!/usr/bin/env node
/**
 * Fetch Arbeitsagentur jobs for all profiles and write data/jobs-cache.json.
 * Runs in GitHub Actions (no CORS). Uses the public BA API key — no secrets.
 *
 * Usage: node scripts/fetch-ba-cache.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROFILES,
  DISTANCE_STEPS,
} from "../js/profiles.js";
import {
  searchArbeitsagentur,
} from "../js/sources/arbeitsagentur.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "jobs-cache.json");

const DEFAULT_RADIUS_KM = DISTANCE_STEPS[2].km; // 50
const QUERIES_PER_PROFILE = 3;
const SIZE_PER_QUERY = 20;
const SLEEP_MS = 400;

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

async function fetchProfile(profile) {
  const location = profile.defaultLocation;
  const radiusKm = DEFAULT_RADIUS_KM;
  const queries = profile.queries.slice(0, QUERIES_PER_PROFILE);
  const jobs = [];
  const errors = [];

  for (const query of queries) {
    try {
      const batch = await searchArbeitsagentur({
        query,
        location,
        radiusKm,
        includeRemote: false,
        size: SIZE_PER_QUERY,
      });
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

  return {
    profileId: profile.id,
    location,
    radiusKm,
    queries,
    jobCount: dedupe(jobs).length,
    jobs: dedupe(jobs),
    errors,
  };
}

async function main() {
  console.log("Fetching BA cache for profiles…");
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

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "arbeitsagentur",
    api: "pc/v4/jobs",
    defaults: { radiusKm: DEFAULT_RADIUS_KM },
    profiles,
    meta: {
      totalJobs: total,
      partial: !anyOk
        ? false
        : Object.values(profiles).some((p) => p.errors?.length),
      allFailed: !anyOk,
    },
  };

  if (!anyOk) {
    console.error(
      "All BA fetches failed — leaving existing data/jobs-cache.json untouched."
    );
    process.exit(1);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUT} (${total} jobs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
