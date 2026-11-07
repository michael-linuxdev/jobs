# Arbeitsagentur CORS-Proxy (Cloudflare Worker)

GitHub Pages darf die BA-API im Browser meist nicht direkt aufrufen (`X-API-Key` → CORS-Preflight). Dieser Worker setzt den Key **serverseitig** und antwortet mit CORS.

## Aktuelle Default-Origin (PWA)

Eingetragen in `js/config.js` als `DEFAULT_PROXY_ORIGIN`:

```text
https://jobsuche-ba-proxy.fog-sense.workers.dev
```

Die App ruft: `GET {origin}/health?ping=jobs&q=…&loc=…&r=…&n=…`

(`/health` + Alias-Query, weil manche Preview-Accounts andere Pfade blocken.)

Der Worker scraped die **HTML-Jobsuche** (SSR-JSON), nicht die REST-API — die REST-API antwortet von vielen Cloud-IPs mit 403. HTML-Fetch kann auf Free-Workers an Zeitlimits scheitern; der **Committed Cache** (`data/jobs-cache.json`) ist dann die zuverlässige Quelle.

### Wichtig — Account claimen / dauerhaft machen

Der Worker liegt auf einem **Wrangler-Temporary-/Preview-Account** („Fog Sense“). Bitte **zeitnah claimen**, sonst läuft er ab:

[Claim Preview Account](https://dash.cloudflare.com/claim-preview?claimToken=ZSSYBAvOOxfX3bADsGzVIx_E0rzCna6_cP51GbCK_yI)

Oder dauerhaft:

1. Cloudflare-Account + API-Token anlegen  
2. GitHub Secrets: `CLOUDFLARE_API_TOKEN`, optional `CLOUDFLARE_ACCOUNT_ID`  
3. Workflow **Deploy BA CORS proxy** ausführen (oder `cd proxy && npx wrangler@4 deploy`)  
4. Neue Origin in `js/config.js` setzen, falls der Hostname wechselt

## Endpunkte

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/health?ping=jobs&q=&loc=&r=&n=` | Jobsuche (empfohlen) |
| `GET` | `/search?was=&wo=…` | Alias |
| `OPTIONS` | `*` | Preflight |

Öffentlicher Key: `jobboerse-jobsuche` (kein Secret).
