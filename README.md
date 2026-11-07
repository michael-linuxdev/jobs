# Jobsuche

Statische, installierbare PWA für die gemeinsame Jobsuche mit Rollen-Profilen
(IT / M365 / Security · Social Media Einstieg · Erzieher / HEP).

## Lokal starten

```bash
python3 -m http.server 8080
# → http://127.0.0.1:8080
```

Module + Service Worker brauchen `http(s)://` (nicht `file://`).

## Datenquellen (Priorität)

1. **Live Arbeitsagentur** — im Browser idealerweise über den Cloudflare-Worker (`proxy/`)
2. **Nacht-Cache** — `data/jobs-cache.json` (GitHub Action, täglich)
3. **Demo** — `data/sample-jobs.json`

## CORS-Proxy (Cloudflare Worker)

Siehe **[`proxy/README.md`](proxy/README.md)**. Kurz:

```bash
cd proxy && npx wrangler@4 login && npx wrangler@4 deploy
```

Danach Origin in `js/config.js` → `DEFAULT_PROXY_ORIGIN` setzen (oder im UI unter „Erweitert“).

## Nightly BA-Cache (GitHub Actions)

Workflow: `.github/workflows/nightly-ba-cache.yml`

- Cron 04:15 UTC + manuell (`Actions` → *Nightly BA job cache* → *Run workflow*)
- Schreibt `data/jobs-cache.json` mit öffentlichem Key `jobboerse-jobsuche` (**kein Secret**)
- Braucht **Actions aktiv** und Schreibrecht für `GITHUB_TOKEN` (`contents: write` ist im Workflow gesetzt)

Einmalig prüfen:

1. Repo → **Settings → Actions → General** → Actions erlaubt
2. Unter *Workflow permissions*: **Read and write** (oder der Workflow nutzt bereits `permissions: contents: write`)
3. Nach Merge: Workflow einmal manuell starten, bis der erste echte Cache da ist

## GitHub Pages

1. **Settings → Pages** → Deploy from branch → `main` / root  
2. URL: `https://<user>.github.io/jobs/`

`.nojekyll` ist gesetzt.

## Was funktioniert

- Profil-Umschalter (3 Tracks), Ort, 5 Entfernungsstufen, (teils)/nur Remote
- Live-Client + gehärteter Worker (`/search`) + Nightly-Cache + Demo
- Deep-Links: Karriere.sachsen.de, LinkedIn, Xing, Indeed, StepStone
- Manifest + Service Worker (offline Shell inkl. Cache-JSON)
