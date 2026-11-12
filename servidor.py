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
from datetime import datetime
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


def limpiar_serie(fechas, precios):
    """Reglas de datos del taller: ordenar por fecha, quitar fechas repetidas y
    descartar precios faltantes o no positivos. No se inventa nada: un dato malo
    se descarta (no se rellena ni se convierte en retorno cero) y se reporta."""
    descartes = {"duplicados": 0, "faltantes": 0, "no_positivos": 0}
    por_fecha = {}
    for f, p in sorted(zip(fechas, precios), key=lambda par: par[0]):
        if f in por_fecha:
            descartes["duplicados"] += 1  # se conserva la primera aparición
            continue
        por_fecha[f] = p
    limpias, limpios = [], []
    for f, p in por_fecha.items():
        if p is None or p != p:  # p != p detecta NaN
            descartes["faltantes"] += 1
        elif p <= 0:
            descartes["no_positivos"] += 1
        else:
            limpias.append(f)
            limpios.append(p)
    return limpias, limpios, descartes


def obtener_de_yahoo(ticker, desde, hasta):
    """Precios de cierre ajustados (dividendos y splits) entre dos fechas.
    Ojo: en yfinance la fecha `hasta` es exclusiva."""
    import pandas as pd
    import yfinance as yf

    df = yf.Ticker(ticker).history(start=desde, end=hasta, auto_adjust=True)
    if df.empty:
        raise SinDatos(ticker)
    fechas = [d.strftime("%Y-%m-%d") for d in df.index]
    precios = [float(p) for p in df["Close"].values]
    fechas, precios, descartes = limpiar_serie(fechas, precios)
    if not precios:
        raise SinDatos(ticker)
    return {
        "fechas": fechas,
        "precios": [round(p, 4) for p in precios],
        "calidad": {
            "n_recibidos": len(df),
            "n_validos": len(precios),
            "descartes": descartes,
            "consultado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "versiones": {"yfinance": yf.__version__, "pandas": pd.__version__},
        },
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
            datos["archivo"] = os.path.basename(copia)
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
    return 200, _guardar(datos, _archivo_cache(ticker, desde, hasta))


def _guardar(datos, ruta):
    """Guarda la serie en datos/cache/ y devuelve los datos con el nombre del archivo."""
    os.makedirs(CACHE, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    return {**datos, "archivo": os.path.basename(ruta)}


# ---- series guardadas (sección "Toma de datos") ----
PATRON_ARCHIVO = re.compile(r"^[A-Za-z0-9_.\-]+__\d{4}-\d{2}-\d{2}__\d{4}-\d{2}-\d{2}\.json$")
PATRON_NOMBRE = re.compile(r"^[A-Za-z0-9_\-]{1,20}$")


def listar_guardados():
    """Resumen de cada serie guardada, la más reciente primero."""
    filas = []
    for ruta in sorted(glob.glob(os.path.join(CACHE, "*.json")), key=os.path.getmtime, reverse=True):
        try:
            with open(ruta, encoding="utf-8") as f:
                d = json.load(f)
            calidad = d.get("calidad", {})
            filas.append({
                "archivo": os.path.basename(ruta),
                "ticker": d["ticker"],
                "primera": d["fechas"][0],
                "ultima": d["fechas"][-1],
                "n": len(d["precios"]),
                "fuente": d.get("fuente", ""),
                "consultado": calidad.get("consultado")
                or datetime.fromtimestamp(os.path.getmtime(ruta)).strftime("%Y-%m-%d %H:%M"),
            })
        except (OSError, ValueError, KeyError, IndexError):
            continue  # un archivo dañado no impide listar los demás
    return filas


def leer_guardado(archivo):
    """Una serie guardada por su nombre de archivo (sin rutas: solo dentro de datos/cache/)."""
    if not PATRON_ARCHIVO.match(archivo):
        return 400, {"error": "Nombre de archivo no válido."}
    ruta = os.path.join(CACHE, archivo)
    if not os.path.isfile(ruta):
        return 404, {"error": f"No existe la copia guardada {archivo}."}
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    datos["fuente"] = f"{datos.get('fuente', '')} · copia guardada"
    datos["archivo"] = archivo
    return 200, datos


def borrar_guardado(archivo):
    """Borra una serie guardada (solo archivos de datos/cache/, por nombre exacto)."""
    if not PATRON_ARCHIVO.match(str(archivo)):
        return 400, {"error": "Nombre de archivo no válido."}
    ruta = os.path.join(CACHE, archivo)
    if not os.path.isfile(ruta):
        return 404, {"error": f"No existe la copia guardada {archivo}."}
    os.remove(ruta)
    return 200, {"borrado": archivo}


def importar_csv(cuerpo):
    """Serie propia leída de un CSV en el navegador. Se limpia con las mismas reglas
    del taller y se guarda como las demás, registrando su procedencia."""
    nombre = str(cuerpo.get("nombre", "")).strip().upper()
    fechas, precios = cuerpo.get("fechas"), cuerpo.get("precios")
    original = str(cuerpo.get("archivo_original", "archivo.csv"))[:80]
    if not PATRON_NOMBRE.match(nombre):
        return 400, {"error": "Ponle a la serie un nombre corto: letras, números, _ o - (máx. 20)."}
    if not isinstance(fechas, list) or not isinstance(precios, list) or len(fechas) != len(precios):
        return 400, {"error": "El CSV no trae columnas de fecha y precio del mismo largo."}
    if len(fechas) > 50000:
        return 400, {"error": "El CSV tiene demasiadas filas (máximo 50 000)."}
    if not all(isinstance(f, str) and PATRON_FECHA.match(f) for f in fechas):
        return 400, {"error": "Hay fechas que no tienen el formato AAAA-MM-DD."}
    numeros = [p if isinstance(p, (int, float)) else None for p in precios]
    fechas, numeros, descartes = limpiar_serie(fechas, numeros)
    if len(numeros) < 2:
        return 400, {"error": "Después de limpiar, el CSV no tiene suficientes precios válidos."}
    datos = {
        "fechas": fechas,
        "precios": numeros,
        "ticker": nombre,
        "desde": fechas[0],
        "hasta": fechas[-1],
        "fuente": f"CSV propio ({original})",
        "calidad": {
            "n_recibidos": len(precios),
            "n_validos": len(numeros),
            "descartes": descartes,
            "consultado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        },
    }
    return 200, _guardar(datos, _archivo_cache(nombre, fechas[0], fechas[-1]))


PUBLICOS = ("/", "/index.html", "/favicon.ico")
CARPETAS_PUBLICAS = ("/css/", "/js/", "/contexto/", "/fuentes/")


class Manejador(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".woff2": "font/woff2"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/historico":
            return self._api_historico(parse_qs(url.query))
        if url.path == "/api/guardados":
            return self._json(200, {"series": listar_guardados()})
        if url.path == "/api/guardado":
            return self._json(*leer_guardado(parse_qs(url.query).get("archivo", [""])[0]))
        # solo se sirve lo que usa el aplicativo (no el código Python, la caché, etc.)
        if url.path in PUBLICOS or (
            url.path.startswith(CARPETAS_PUBLICAS) and ".." not in url.path
        ):
            return super().do_GET()
        return self.send_error(404)

    def do_POST(self):
        ruta = urlparse(self.path).path
        if ruta not in ("/api/importar", "/api/borrar"):
            return self.send_error(404)
        largo = int(self.headers.get("Content-Length", 0))
        if largo > 5_000_000:
            return self._json(413, {"error": "El archivo es demasiado grande (máximo 5 MB)."})
        try:
            cuerpo = json.loads(self.rfile.read(largo).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"error": "No se pudo leer la serie enviada."})
        if ruta == "/api/borrar":
            codigo, respuesta = borrar_guardado(cuerpo.get("archivo", ""))
            print(f"  borrar {cuerpo.get('archivo', '')}: {respuesta.get('error', 'borrado')}")
            return self._json(codigo, respuesta)
        codigo, respuesta = importar_csv(cuerpo)
        print(f"  CSV propio {cuerpo.get('nombre', '')}: {respuesta.get('error', 'guardado')}")
        return self._json(codigo, respuesta)

    def end_headers(self):
        # que el navegador revalide siempre: si no, tras editar el CSS o el JS
        # puede seguir usando la versión vieja guardada en su caché
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

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
