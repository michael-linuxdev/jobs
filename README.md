# Jobsuche

Statische, installierbare PWA für die gemeinsame Jobsuche zweier Profile
(Michael · IT / Partnerin · Social Media oder Erzieher/HEP).

## Lokal starten

Beliebigen Static-Server im Repo-Root:

```bash
python3 -m http.server 8080
# → http://127.0.0.1:8080
```

Module + Service Worker brauchen `http(s)://` (nicht `file://`).

## GitHub Pages

1. Repo-Settings → Pages → Source: **Deploy from a branch**
2. Branch `main` (oder diese Feature-Branch), Folder `/` (root)
3. Site: `https://<user>.github.io/jobs/`

`.nojekyll` ist gesetzt, damit GitHub die Dateien unverändert ausliefert.

## Was funktioniert

- Profil-Umschalter (3 Tracks), Ort, 5 Entfernungsstufen, (teils)/nur Remote
- Live-Client für die **Arbeitsagentur**-Jobsuche (+ optionaler CORS-Proxy)
- Demo-Fallback mit realistischen Treffern, wenn Live-API blockiert
- Deep-Links: Karriere.sachsen.de, LinkedIn, Xing, Indeed, StepStone
- Manifest + Service Worker (offline Shell)

Details und Blocker: siehe Produktnotiz im Cursor-Store (`docs/jobsuche-plan.md`)
bzw. den PR-Text.
