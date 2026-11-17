#!/usr/bin/env python3
"""Prototyp: Jobsuche-API der Bundesagentur fuer Arbeit nutzbar machen.

Nur Standardbibliothek, keine Installation noetig.

  python3 jobsuche.py serve                 Weboberflaeche + lokaler Proxy (http://localhost:8080)
  python3 jobsuche.py suche Fachinformatiker --wo Dresden --umkreis 25
  python3 jobsuche.py details 10001-1002716922-S

Der Proxy haengt den oeffentlichen API-Key an und umgeht damit
moegliche CORS-Sperren des Browsers.
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("JOBSUCHE_UPSTREAM", "https://rest.arbeitsagentur.de").rstrip("/")
API_KEY = "jobboerse-jobsuche"
SEARCH = "/jobboerse/jobsuche-service/pc/v4/jobs"
DETAILS = "/jobboerse/jobsuche-service/pc/v4/jobdetails/"
LOGO = "/vermittlung/ag-darstellung-service/ct/v1/arbeitgeberlogo/"
HERE = os.path.dirname(os.path.abspath(__file__))

# Nur diese Suchparameter werden an die API durchgereicht.
ALLOWED = {
    "was", "wo", "berufsfeld", "page", "size", "arbeitgeber", "zeitarbeit",
    "veroeffentlichtseit", "pav", "angebotsart", "befristung", "behinderung",
    "corona", "umkreis", "arbeitszeit",
}


def upstream_get(path, timeout=30):
    """GET gegen die BA-API. Liefert (status, content_type, body)."""
    req = urllib.request.Request(
        UPSTREAM + path,
        headers={"X-API-Key": API_KEY, "Accept": "*/*", "User-Agent": "jobsuche-prototyp/0.1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.headers.get("Content-Type", "application/json"), resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.headers.get("Content-Type", "text/plain"), err.read()


def search_path(params):
    clean = {k: v for k, v in params.items() if k in ALLOWED and v not in ("", None)}
    return SEARCH + "?" + urllib.parse.urlencode(clean)


def details_path(refnr):
    code = base64.b64encode(refnr.encode("utf-8")).decode("ascii")
    return DETAILS + urllib.parse.quote(code, safe="")


def logo_path(kundennummer_hash):
    return LOGO + urllib.parse.quote(kundennummer_hash, safe="")


class Handler(BaseHTTPRequestHandler):
    server_version = "jobsuche-prototyp/0.1"

    def _send(self, status, ctype, body):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, "application/json; charset=utf-8", json.dumps(obj).encode("utf-8"))

    def do_GET(self):  # noqa: N802 (Name von http.server vorgegeben)
        url = urllib.parse.urlsplit(self.path)
        path = url.path
        try:
            if path in ("/", "/index.html"):
                with open(os.path.join(HERE, "index.html"), "rb") as fh:
                    return self._send(200, "text/html; charset=utf-8", fh.read())
            if path == "/api/ping":
                return self._json(200, {"ok": True, "upstream": UPSTREAM})
            if path == "/api/jobs":
                params = dict(urllib.parse.parse_qsl(url.query))
                return self._send(*upstream_get(search_path(params)))
            if path.startswith("/api/jobdetails/"):
                refnr = urllib.parse.unquote(path[len("/api/jobdetails/"):])
                return self._send(*upstream_get(details_path(refnr)))
            if path.startswith("/api/logo/"):
                khash = urllib.parse.unquote(path[len("/api/logo/"):])
                return self._send(*upstream_get(logo_path(khash)))
            return self._json(404, {"fehler": "Unbekannter Pfad"})
        except FileNotFoundError:
            return self._json(500, {"fehler": "index.html muss neben jobsuche.py liegen"})
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            return self._json(502, {"fehler": "BA-API nicht erreichbar: %s" % err})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))


def cmd_serve(args):
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print("Jobsuche-Prototyp laeuft: http://%s:%d  (Strg+C beendet)" % (args.host, args.port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print()


def cmd_suche(args):
    params = {
        "was": args.was, "wo": args.wo, "umkreis": args.umkreis if args.wo else None,
        "angebotsart": args.angebotsart, "arbeitszeit": args.arbeitszeit,
        "veroeffentlichtseit": args.seit, "page": args.seite, "size": args.anzahl,
    }
    status, _, body = upstream_get(search_path(params))
    if status != 200:
        sys.exit("Fehler %s: %s" % (status, body[:300].decode("utf-8", "replace")))
    data = json.loads(body)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    jobs = data.get("stellenangebote") or []
    print("%s Treffer, Seite %s, %d angezeigt\n" % (data.get("maxErgebnisse", "?"), args.seite, len(jobs)))
    for job in jobs:
        ort = job.get("arbeitsort") or {}
        print(job.get("titel") or job.get("beruf") or "(ohne Titel)")
        print("  %s | %s %s | seit %s" % (
            job.get("arbeitgeber", "?"), ort.get("plz", ""), ort.get("ort", ""),
            job.get("aktuelleVeroeffentlichungsdatum", "?")))
        print("  %s\n" % job.get("refnr", ""))


def cmd_details(args):
    status, _, body = upstream_get(details_path(args.refnr))
    if status != 200:
        sys.exit("Fehler %s: %s" % (status, body[:300].decode("utf-8", "replace")))
    print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Prototyp fuer die Jobsuche-API der Bundesagentur fuer Arbeit")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("serve", help="Weboberflaeche mit lokalem Proxy starten")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8080)
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("suche", help="Stellen suchen")
    p.add_argument("was", nargs="?", default="")
    p.add_argument("--wo", default="")
    p.add_argument("--umkreis", type=int, default=25)
    p.add_argument("--angebotsart", default="1", help="1 Arbeit, 2 Selbstaendigkeit, 4 Ausbildung, 34 Praktikum")
    p.add_argument("--arbeitszeit", default="", help="vz;tz;snw;ho;mj (mit Semikolon kombinierbar)")
    p.add_argument("--seit", default="", help="Tage seit Veroeffentlichung, 0-100")
    p.add_argument("--seite", type=int, default=1)
    p.add_argument("--anzahl", type=int, default=25)
    p.add_argument("--json", action="store_true", help="Rohantwort ausgeben")
    p.set_defaults(func=cmd_suche)

    p = sub.add_parser("details", help="Details zu einer Referenznummer")
    p.add_argument("refnr")
    p.set_defaults(func=cmd_details)

    args = parser.parse_args()
    try:
        args.func(args)
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        sys.exit("BA-API nicht erreichbar: %s" % err)


if __name__ == "__main__":
    main()
