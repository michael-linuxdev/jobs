# Jobsuche-API Prototyp

Prototyp für `jobs.micana.de`: macht die Jobsuche-Schnittstelle der Bundesagentur
für Arbeit (`rest.arbeitsagentur.de`, Community-Doku: https://github.com/bundesAPI/jobsuche-api)
über eine Weboberfläche und die Kommandozeile nutzbar.

## Dateien

- `index.html` – Suchoberfläche (Suche, Filter, Details, Rohantwort, curl-Befehl)
- `jobsuche.py` – lokaler Proxy und Kommandozeile, nur Python-Standardbibliothek
- `proxy/` – Cloudflare-Worker mit denselben Pfaden für den Betrieb auf GitHub Pages

## Lokal starten

```bash
python3 jobsuche.py serve        # http://localhost:8080
python3 jobsuche.py suche Fachinformatiker --wo Dresden --umkreis 25
python3 jobsuche.py details <Referenznummer>
```

## Worker-Proxy für GitHub Pages

Die BA-API erlaubt keine Browser-Abfragen von fremden Webseiten (CORS). Für
`jobs.micana.de` übernimmt das der Cloudflare-Worker in `proxy/`:

1. Cloudflare-Konto anlegen, API-Token mit der Vorlage „Edit Cloudflare Workers“ erstellen.
2. Im Repo unter Settings → Secrets and variables → Actions die Secrets
   `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` anlegen.
3. Unter Actions den Workflow „Worker-Proxy deployen“ starten. Die Adresse
   (`https://jobs-ba-api.<name>.workers.dev`) steht am Ende des Deploy-Logs.
4. Adresse auf der Seite unter „Proxy-Adresse“ eintragen (gilt nur für diesen
   Browser) oder dauerhaft als `DEFAULT_PROXY` in `index.html` setzen.

Lehnt die BA die REST-Abfrage des Workers ab, liest er die Treffer ersatzweise
aus der HTML-Jobsuche. Die Seite zeigt dann einen Hinweis; Details können fehlen.

## Pages

Branch `main` / root, CNAME `jobs.micana.de`.
