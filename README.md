# Jobsuche-API Prototyp

Prototyp für `jobs.micana.de`: macht die Jobsuche-Schnittstelle der Bundesagentur
für Arbeit (`rest.arbeitsagentur.de`, Community-Doku: https://github.com/bundesAPI/jobsuche-api)
über eine Weboberfläche und die Kommandozeile nutzbar.

## Dateien

- `index.html` – Suchoberfläche (Suche, Filter, Details, Rohantwort, curl-Befehl)
- `jobsuche.py` – lokaler Proxy und Kommandozeile, nur Python-Standardbibliothek

## Lokal starten

```bash
python3 jobsuche.py serve        # http://localhost:8080
python3 jobsuche.py suche Fachinformatiker --wo Dresden --umkreis 25
python3 jobsuche.py details <Referenznummer>
```

## Hinweis zu GitHub Pages

Auf Pages läuft kein Proxy. Die Seite fragt die API dann direkt aus dem Browser ab.
Erlaubt die BA das fremden Webseiten nicht (CORS), zeigt die Seite einen Hinweis
und funktioniert nur lokal über `jobsuche.py serve`.

## Pages

Branch `main` / root, CNAME `jobs.micana.de`.
