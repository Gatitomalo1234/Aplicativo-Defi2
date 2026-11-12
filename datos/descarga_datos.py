# descarga_datos.py — correr ANTES de la sustentación, con internet:
#   python3 datos/descarga_datos.py
# Deja en datos/cache/ todas las series que recomienda el aplicativo, con los mismos
# rangos de fechas que usa «Toma de datos». Si en clase falla la conexión, servidor.py
# responde con estas copias (elige la que más se cruza con el rango pedido).
#
# Las listas deben coincidir con las del aplicativo:
#   SERIES_MODELO en js/tomadatos.js  (series por modelo y comparables de opciones)
#   CANASTAS      en js/manada.js     (canastas de manada)

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from servidor import historico  # noqa: E402

HOY = date.today()


def hace_anios(n):
    """Misma fecha de hoy, n años atrás (como haceAnios en js/datos.js)."""
    try:
        return HOY.replace(year=HOY.year - n).isoformat()
    except ValueError:  # 29 de febrero
        return HOY.replace(year=HOY.year - n, day=28).isoformat()


def ultimos(n):
    return hace_anios(n), HOY.isoformat()


# (ticker, desde, hasta, para qué se usa)
SERIES = [
    # 1 · GBM
    ("NVDA", *ultimos(3), "GBM, Merton y fBm: NVIDIA 3 años"),
    ("^GSPC", *ultimos(5), "GBM: S&P 500 5 años"),
    ("AAPL", *ultimos(5), "GBM: Apple 5 años"),
    ("EC", *ultimos(5), "GBM y opciones: Ecopetrol 5 años"),
    # 2 · Merton
    ("META", *ultimos(5), "Merton: Meta 5 años"),
    ("TSLA", *ultimos(3), "Merton: Tesla 3 años"),
    ("^GSPC", "2006-01-01", "2009-12-31", "Merton: S&P 500 crisis subprime"),
    # 3 · Ornstein-Uhlenbeck
    ("^VIX", *ultimos(3), "OU: VIX 3 años"),
    ("^TNX", *ultimos(5), "OU: bono 10 años EE. UU."),
    ("^IRX", *ultimos(5), "OU: letra del Tesoro 13 semanas"),
    ("COP=X", *ultimos(3), "OU: TRM 3 años"),
    # 4 · Browniano fraccional
    ("^GSPC", *ultimos(10), "fBm: S&P 500 10 años"),
    ("GLD", *ultimos(10), "fBm: oro 10 años"),
    ("^VIX", *ultimos(10), "fBm: VIX 10 años"),
    # 6 · Opciones reales (σ de una empresa comparable)
    ("CIB", *ultimos(5), "opciones: Bancolombia 5 años"),
    ("XLE", *ultimos(5), "opciones: sector energía EE. UU."),
    ("GLD", *ultimos(5), "opciones: oro 5 años"),
]

# 5 · Manada: canastas (cada acción se guarda por separado)
CANASTAS = [
    ("Acciones meme 2020-21", ["GME", "AMC", "BB", "NOK", "KOSS"], "2020-06-01", "2021-06-30"),
    ("Bancos EE. UU. 2006-09", ["JPM", "BAC", "C", "WFC", "GS", "MS"], "2006-01-01", "2009-12-31"),
    ("Tecnológicas EE. UU. 5 años", ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META"], *ultimos(5)),
]
for nombre, tickers, desde, hasta in CANASTAS:
    SERIES += [(t, desde, hasta, f"manada: {nombre}") for t in tickers]

# sin repetir (una misma serie puede servir a varios modelos)
vistas, pendientes = set(), []
for t, d, h, uso in SERIES:
    if (t, d, h) not in vistas:
        vistas.add((t, d, h))
        pendientes.append((t, d, h, uso))

print(f"Precargando {len(pendientes)} series en datos/cache/ (hoy {HOY})\n")
fallas, sin_conexion = [], []
for t, d, h, uso in pendientes:
    codigo, cuerpo = historico(t, d, h)
    if codigo == 200 and "aviso" not in cuerpo:
        dsc = cuerpo.get("calidad", {}).get("descartes", {})
        n_dsc = sum(dsc.values()) if dsc else 0
        print(f"  ok   {t:7} {d} → {h}  {len(cuerpo['precios']):5} precios, {n_dsc} descartados  · {uso}")
    elif codigo == 200:
        sin_conexion.append(t)
        print(f"  !!   {t:7} sin conexión: quedó la copia vieja  · {uso}")
    else:
        fallas.append(t)
        print(f"  ERR  {t:7} {cuerpo['error']}")

print()
if fallas or sin_conexion:
    print(f"Revisar: {len(fallas)} con error {fallas}, {len(sin_conexion)} sin conexión {sin_conexion}.")
else:
    print(f"Listo: las {len(pendientes)} series quedaron guardadas. El aplicativo funciona sin internet.")
