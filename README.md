# Jobstapel

Job-Finder für `jobs.micana.de`: Stellen der Bundesagentur für Arbeit als
Kartenstapel. Nach rechts wischen merkt eine Stelle, nach links verwirft sie.

## Berufsgruppen

Die Profile und ihre Suchbegriffe stehen oben im Script von `index.html`
(`PROFILES`): Erzieher & HEP, Social Media, Sachbearbeitung (Vertriebsinnendienst,
Verlag, Journalismus), Nebenjobs (Minijobs) und IT. Jeder Suchbegriff wird einzeln
abgefragt, die Treffer werden zusammengeführt und nach Datum sortiert.

Gemerkte und verworfene Stellen liegen nur im Browser (`localStorage`).

## Dateien

- `index.html` – die App
- `proxy/` – Cloudflare-Worker `jobs-ba-api.micana.workers.dev`, der die BA-API
  für den Browser erreichbar macht (CORS). Deploy per Workflow
  „Worker-Proxy deployen“ bei Änderungen in `proxy/`, braucht das Secret
  `CLOUDFLARE_API_TOKEN`.
- `jobsuche.py` – lokaler Proxy und Kommandozeile, nur Python-Standardbibliothek

## Lokal

```bash
python3 jobsuche.py serve        # http://localhost:8080, nutzt den lokalen Proxy
python3 jobsuche.py suche Erzieher --wo Dresden --umkreis 25
```

## Pages

Branch `main` / root, CNAME `jobs.micana.de`.
