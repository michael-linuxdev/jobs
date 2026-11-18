# Jobstapel

Job-Finder für `jobs.micana.de`: Stellen der Bundesagentur für Arbeit als
Kartenstapel. Nach rechts wischen merkt eine Stelle, nach links verwirft sie.

## Berufsgruppen

Die Berufsgruppe wird im Filter gewählt. Unter „Berufe bearbeiten“ lassen sich Suchbegriffe und Ausschlusswörter ändern und eigene Berufe anlegen (gespeichert im Browser). Je Beruf gibt es Muss-Wörter (`include`: Titel oder Berufsbezeichnung muss eines enthalten) und Ausschlusswörter
(`exclude`: Titel, Beruf oder Arbeitgeber); im Detailblatt lassen sich Arbeitgeber und Beruf mit einem Tipp ausschließen.
Neue Berufe entstehen über einen Assistenten mit sechs Auswahlfragen
(`FIELDS`, `LIKES`, `LEVELS`, `TIMES`, `AVOID` im Script), ganz ohne Freitext. Die Profile und ihre Suchbegriffe stehen oben im Script von `index.html`
(`PROFILES`): Erzieher & HEP, Social Media, Sachbearbeitung (Vertriebsinnendienst,
Verlag, Journalismus), Nebenjobs (Minijobs), IT und „Neustart 50+“ (breites Profil für den Umstieg mit
handwerklicher oder sozialer Stärke: 34 Suchbegriffe quer durch die Branchen, Voll- und Teilzeit). Jeder Suchbegriff wird einzeln
abgefragt, die Treffer werden zusammengeführt und nach Datum sortiert.

Gemerkte und verworfene Stellen liegen nur im Browser (`localStorage`). Unter „Gemerkt“ → „Sichern“ lassen sie sich
als Datei oder Code exportieren und auf einem anderen Gerät übernehmen. Die Vergütung (Entgeltgruppe, Tarif, Euro-Beträge) wird per Mustersuche aus dem Anzeigentext gelesen
(`salaryInfo`) und im Detailblatt, auf der Karte und in der Merkliste gezeigt. Gemerkte Stellen, die bei der
Arbeitsagentur nicht mehr abrufbar sind (Fehler 404/410), werden als „Nicht mehr online“ markiert.

## Dateien

- `index.html` – die App
- `sw.js`, `manifest.webmanifest`, `icons/` – Installation als App und Updates
- `proxy/` – Cloudflare-Worker `jobs-ba-api.micana.workers.dev`, der die BA-API
  für den Browser erreichbar macht (CORS). Deploy per Workflow
  „Worker-Proxy deployen“ bei Änderungen in `proxy/`, braucht das Secret
  `CLOUDFLARE_API_TOKEN`.
- `jobsuche.py` – lokaler Proxy und Kommandozeile, nur Python-Standardbibliothek

## App-Installation und Updates

- `manifest.webmanifest`, `icons/` und `sw.js` machen die Seite installierbar. Handys sehen beim
  ersten Besuch einen Installationshinweis, danach einen Balken „App nicht installiert“.
- `sw.js` hält die App-Dateien im Cache. **Bei jeder Änderung an `index.html`, Manifest oder
  Icons die Konstante `CACHE` in `sw.js` hochzählen.** Geräte zeigen dann „Neue Version
  verfügbar“ mit dem Knopf „Jetzt aktualisieren“.

## Lokal

```bash
python3 jobsuche.py serve        # http://localhost:8080, nutzt den lokalen Proxy
python3 jobsuche.py suche Erzieher --wo Dresden --umkreis 25
```

## Pages

Branch `main` / root, CNAME `jobs.micana.de`.
