/**
 * Site-wide defaults. After deploying the Cloudflare Worker, set
 * DEFAULT_PROXY_ORIGIN to the worker origin (no trailing slash), e.g.
 *   "https://jobsuche-ba-proxy.<account>.workers.dev"
 * Leave empty until then — the PWA still works via nightly cache / demo.
 */
export const DEFAULT_PROXY_ORIGIN = "";

/** Relative path to the nightly BA cache written by GitHub Actions. */
export const JOBS_CACHE_URL = "./data/jobs-cache.json";
