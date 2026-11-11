"""
servidor.py — conecta el aplicativo con Yahoo Finance.

Uso (desde la carpeta del aplicativo):
    pip install -r requirements.txt
    python servidor.py
El aplicativo se abre solo en http://localhost:8000

Por qué un servidor: el navegador no deja que una página web pida datos
directamente a Yahoo Finance (política CORS). Este script hace la descarga
con yfinance y le entrega al aplicativo un JSON simple con fechas y precios.

Cada serie descargada se guarda en datos/cache/. Si en la sustentación falla
internet, el aplicativo usa la última copia guardada de ese ticker y lo dice.
"""

import glob
import json
import os
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PUERTO = 8000
RAIZ = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RAIZ, "datos", "cache")
PATRON_TICKER = re.compile(r"^[A-Za-z0-9.^=\-]{1,15}$")
PATRON_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SinDatos(Exception):
    """Yahoo respondió, pero no tiene precios para ese ticker y rango."""


def obtener_de_yahoo(ticker, desde, hasta):
    """Precios de cierre ajustados (dividendos y splits) entre dos fechas."""
    import yfinance as yf

    df = yf.Ticker(ticker).history(start=desde, end=hasta, auto_adjust=True)
    if df.empty:
        raise SinDatos(ticker)
    cierre = df["Close"].dropna()
    return {
        "fechas": [d.strftime("%Y-%m-%d") for d in cierre.index],
        "precios": [round(float(p), 4) for p in cierre.values],
    }


def _archivo_cache(ticker, desde, hasta):
    seguro = ticker.upper().replace("^", "IDX_").replace("=", "_")
    return os.path.join(CACHE, f"{seguro}__{desde}__{hasta}.json")


def _ultima_copia(ticker):
    """La copia guardada más reciente de un ticker, para cualquier rango."""
    seguro = ticker.upper().replace("^", "IDX_").replace("=", "_")
    archivos = glob.glob(os.path.join(CACHE, f"{seguro}__*.json"))
    return max(archivos, key=os.path.getmtime) if archivos else None


def historico(ticker, desde, hasta):
    """Devuelve (codigo_http, cuerpo). Intenta Yahoo; si falla, usa la caché."""
    try:
        datos = obtener_de_yahoo(ticker, desde, hasta)
    except SinDatos:
        return 404, {
            "error": f"Yahoo Finance no tiene precios para {ticker.upper()} "
            f"entre {desde} y {hasta}. Revisa el ticker o el rango de fechas."
        }
    except Exception as e:  # sin internet, Yahoo caído, yfinance no instalado...
        copia = _ultima_copia(ticker)
        if copia:
            with open(copia, encoding="utf-8") as f:
                datos = json.load(f)
            datos["fuente"] = "copia guardada"
            datos["aviso"] = (
                f"No hubo conexión con Yahoo Finance ({type(e).__name__}). "
                f"Se usa la copia guardada de {datos['ticker']}, "
                f"del {datos['desde']} al {datos['hasta']}."
            )
            return 200, datos
        return 502, {
            "error": f"No hubo conexión con Yahoo Finance ({type(e).__name__}) "
            f"y no hay copia guardada de {ticker.upper()}."
        }

    datos.update(ticker=ticker.upper(), desde=desde, hasta=hasta, fuente="Yahoo Finance")
    os.makedirs(CACHE, exist_ok=True)
    with open(_archivo_cache(ticker, desde, hasta), "w", encoding="utf-8") as f:
        json.dump(datos, f)
    return 200, datos


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/historico":
            return self._api_historico(parse_qs(url.query))
        return super().do_GET()

    def _api_historico(self, q):
        ticker = q.get("ticker", [""])[0].strip()
        desde = q.get("desde", [""])[0]
        hasta = q.get("hasta", [""])[0]
        if not PATRON_TICKER.match(ticker):
            return self._json(400, {"error": "Escribe un ticker válido, por ejemplo NVDA o ^GSPC."})
        if not (PATRON_FECHA.match(desde) and PATRON_FECHA.match(hasta)) or desde >= hasta:
            return self._json(400, {"error": "La fecha inicial debe ser anterior a la final."})
        codigo, cuerpo = historico(ticker, desde, hasta)
        print(f"  {ticker.upper()} {desde} a {hasta}: {cuerpo.get('fuente', cuerpo.get('error'))}")
        return self._json(codigo, cuerpo)

    def _json(self, codigo, cuerpo):
        datos = json.dumps(cuerpo).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)

    def log_message(self, formato, *args):
        pass  # solo imprimimos las consultas a Yahoo, no cada archivo servido


def main():
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    url = f"http://localhost:{PUERTO}"
    print(f"Aplicativo en {url}  (Ctrl+C para detener)")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
