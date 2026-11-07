# Jobsuche

Installierbare PWA für `jobs.micana.de`: echte Stellen der **Arbeitsagentur**
nach Rollen-Profil, Ort und Entfernung.

## Rollen

- IT / M365 / Security
- Social Media (Einstieg)
- Erzieher / HEP

## Datenquellen (ehrlich)

1. **Live** über Cloudflare-Worker-Proxy (`proxy/`) — wenn `DEFAULT_PROXY_ORIGIN` gesetzt
2. **Nightly-Cache** `data/jobs-cache.json` — nur wenn `source === "arbeitsagentur"` und Detail-URLs echt sind
3. Sonst **leerer Zustand** — keine Demo-/Platzhalterstellen, keine Fake-Portal-Buttons

Einziger Zusatz-Link: offizielle Suche auf **arbeitsagentur.de** (funktioniert immer).

## Lokal

```bash
python3 -m http.server 8080
```

## Proxy & Nightly-Cache

- Proxy: [`proxy/README.md`](proxy/README.md)
- Action: `.github/workflows/nightly-ba-cache.yml` (öffentlicher BA-Key, kein Secret)

## Pages

Branch `main` / root, CNAME `jobs.micana.de`.
