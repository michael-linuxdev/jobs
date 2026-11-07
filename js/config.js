/**
 * Site-wide defaults for jobs.micana.de.
 *
 * DEFAULT_PROXY_ORIGIN is the Cloudflare Worker that injects the BA API key
 * and returns CORS headers. Deployed via `wrangler deploy` (see proxy/README.md).
 *
 * Current origin was provisioned with wrangler --temporary (account "Fog Sense").
 * Claim it to a permanent Cloudflare account so it does not expire:
 *   https://dash.cloudflare.com/claim-preview?claimToken=ZSSYBAvOOxfX3bADsGzVIx_E0rzCna6_cP51GbCK_yI
 * Or redeploy with CLOUDFLARE_API_TOKEN (GitHub Actions: deploy-proxy.yml).
 */
export const DEFAULT_PROXY_ORIGIN =
  "https://jobsuche-ba-proxy.fog-sense.workers.dev";

/** Relative path to the BA cache written by GitHub Actions. */
export const JOBS_CACHE_URL = "./data/jobs-cache.json";
