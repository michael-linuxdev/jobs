# Arbeitsagentur CORS-Proxy (Cloudflare Worker)

GitHub Pages darf die BA-API im Browser meist nicht direkt aufrufen (`X-API-Key` → CORS-Preflight). Dieser Worker setzt den Key **serverseitig** und antwortet mit CORS.

## Endpunkte

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/search?was=&wo=&umkreis=&size=` | Empfohlen — Parameter wie BA |
| `GET` | `/?url=<encoded BA-URL>` | Legacy-Durchreichung (nur `rest.arbeitsagentur.de`) |
| `OPTIONS` | `*` | Preflight |

Öffentlicher Key (kein Secret nötig): `jobboerse-jobsuche`.

## Deploy (einmalig)

Voraussetzung: Cloudflare-Account + [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

```bash
cd proxy
npx --yes wrangler@4 login          # Browser-Login, einmalig
npx --yes wrangler@4 deploy         # → https://jobsuche-ba-proxy.<account>.workers.dev
curl https://jobsuche-ba-proxy.<account>.workers.dev/health
```

Optional Origins einschränken (Dashboard → Worker → Settings → Variables, oder in `wrangler.toml` `[vars]`):

```toml
ALLOWED_ORIGINS = "https://michael-linuxdev.github.io,http://127.0.0.1:8080"
```

Erneut `wrangler deploy`.

## In der PWA eintragen

1. **Repo-Default (empfohlen):** in `js/config.js` setzen:

   ```js
   export const DEFAULT_PROXY_ORIGIN = "https://jobsuche-ba-proxy.<account>.workers.dev";
   ```

   Dann Commit/Push — alle Nutzer der Pages-Site nutzen den Proxy ohne Extra-Klick.

2. **Nur lokal im Browser:** unter „Erweitert: CORS-Proxy“ die Worker-Origin eintragen (ohne Slash am Ende), z. B. `https://jobsuche-ba-proxy.….workers.dev`. Wird in `localStorage` gespeichert und überschreibt den Default.

Die App ruft dann `GET {origin}/search?was=…&wo=…` auf (kein API-Key im Browser).

## Sicherheit (kurz)

- Nur `GET`/`OPTIONS`
- Upstream nur `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/…`
- Query-Whitelist auf `/search`
- Timeout ~25 s, Größenlimit
- Optional `ALLOWED_ORIGINS`

Kein Cloudflare-Secret für den BA-Key nötig (öffentlich dokumentiert).
