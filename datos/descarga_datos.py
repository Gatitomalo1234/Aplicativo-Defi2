# descarga_datos.py — correr ANTES de la sustentación, con internet:
#   python datos/descarga_datos.py
# Deja en datos/cache/ las series que usa el aplicativo. Así, si en clase
# falla la conexión, servidor.py responde con estas copias.

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from servidor import historico  # noqa: E402

HOY = date.today().isoformat()

SERIES = [
    ("NVDA", "2023-01-01", HOY),           # GBM / Merton: saltos en earnings
    ("GME", "2020-06-01", "2021-06-30"),   # Manada: caso GameStop
    ("^GSPC", "2006-01-01", "2009-12-31"), # Manada / Merton: crisis subprime
    ("COP=X", "2020-01-01", HOY),          # OU: TRM, candidata a reversión
]

for ticker, desde, hasta in SERIES:
    codigo, cuerpo = historico(ticker, desde, hasta)
    if codigo == 200:
        print(f"{ticker}: {len(cuerpo['precios'])} precios ({cuerpo['fuente']})")
    else:
        print(f"{ticker}: ERROR — {cuerpo['error']}")
