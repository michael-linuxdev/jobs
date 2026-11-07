/**
 * Minimal Cloudflare Worker CORS proxy for the Arbeitsagentur Jobsuche API.
 *
 * Deploy, then set the PWA proxy field to:
 *   https://<your-worker>.workers.dev/?url=
 *
 * Only allows rest.arbeitsagentur.de hosts.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("Missing ?url=", { status: 400, headers: cors() });
    }

    let dest;
    try {
      dest = new URL(target);
    } catch {
      return new Response("Bad url", { status: 400, headers: cors() });
    }

    if (dest.hostname !== "rest.arbeitsagentur.de") {
      return new Response("Host not allowed", { status: 403, headers: cors() });
    }

    const upstream = await fetch(dest.toString(), {
      headers: {
        Accept: "application/json",
        "X-API-Key": "jobboerse-jobsuche",
      },
    });

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors(),
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
      },
    });
  },
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}
