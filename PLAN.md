# Aplicativo Defi 2 — Romper el mercado perfecto

Cinco modelos estocásticos, un supuesto a la vez, y luego su uso para decidir
(opciones reales). Producto final: **un HTML conectado a Yahoo Finance**, servido
por un script de Python propio. El código es nuestro, sin librerías de gráficos,
y se puede sustentar línea por línea.

Prioridad acordada: **primero que todo funcione bien; el diseño se pule al final.**

## Cómo se abre

```
pip install -r requirements.txt     (una sola vez)
python servidor.py                  (abre http://localhost:8000)
```

Por qué un servidor: el navegador bloquea que una página pida datos directamente a
Yahoo (CORS). `servidor.py` descarga con yfinance y le entrega al HTML un JSON.
Cada descarga se guarda en `datos/cache/`; si en clase falla internet, se usa la
última copia guardada de ese ticker y el aplicativo lo avisa.
Antes de la sustentación: `python datos/descarga_datos.py` para precargar las series.

## El hilo conductor

| Módulo | Supuesto que rompe | Fenómeno que captura |
|---|---|---|
| GBM | (punto de partida) | mercado eficiente de base |
| Merton | trayectorias continuas | saltos: noticias, earnings, crashes |
| Ornstein-Uhlenbeck | drift constante | reversión a la media: tasas, spreads |
| Browniano fraccional | incrementos independientes | memoria: momentum / sobre-reacción |
| Manada (CSAD, CSSD) | agentes independientes | imitación: GameStop, subprime |
| Opciones reales | ninguno: usa los modelos para decidir | valor de la flexibilidad en proyectos |

## Convenciones (lo que nos hace defendibles)

1. **Esquema numérico**: modelos de precio con la transición exacta del taller,
   S(t+dt) = S(t)·exp[(μ − σ²/2)dt + σ√dt·Z] (precios siempre positivos); OU con
   Euler-Maruyama, el de las diapositivas. dt = 1/252.
2. **Mismo ruido**: semilla fija → las mismas normales Z en todas las simulaciones.
   Al mover un slider, el cambio es atribuible al parámetro, no al azar.
3. **Calibración con datos reales** en cada módulo, mostrando el cálculo paso a paso
   (para el GBM: σ̂ = s·√252, μ̂ = 252·x̄ + σ̂²/2, como en el taller de valoración).
4. **Cero dependencias en el navegador**: el gráfico, el ruido y los modelos son nuestros.
5. **"Qué explica / qué no"** escrito con nuestras palabras. Sin afirmaciones que no
   podamos sostener.

## Estructura de archivos

- `servidor.py` — servidor local + `/api/historico` (Yahoo + caché), `/api/guardados`,
  `/api/guardado`, `/api/importar` (CSV propio)
- `requirements.txt` — yfinance
- `index.html` — el aplicativo
- `css/estilos.css` — diseño (tokens de color, tablero de tarjetas, sliders propios)
- `fuentes/` — Geist, Geist Mono y STIX Two Text en woff2 + `fuentes.css`
- `js/ruido.js` — generador con semilla (Mulberry32) + Box-Muller → normales comunes
- `js/modelos.js` — los 5 simuladores con la interfaz `simular(params, Z)`
- `js/datos.js` — pide precios al servidor y calibra
- `js/grafico.js` — histórico real + abanico simulado (banda 5–95 %, mediana, hover)
- `js/app.js` — navegación, piezas comunes (formulario de datos, lectura) y módulo GBM
- `js/merton.js` — módulo de Merton (cada módulo se registra en `MODULOS`)
- `js/ou.js` — módulo de Ornstein-Uhlenbeck
- `js/vasicek.js` — módulo de Vasicek (tasa corta, bono, curva de tasas)
- `js/fbm.js` — módulo del browniano fraccional
- `js/opciones.js` — módulo de opciones reales (árbol binomial)
- `js/manada.js` — módulo de manada (CSAD/CSSD) y canastas recomendadas
- `js/tomadatos.js` — sección Toma de datos: series por modelo, guardadas, CSV propio, vista rápida
- `datos/descarga_datos.py` — precarga la caché antes de la sustentación
- `datos/cache/` — se crea solo al descargar

## Fases

- **F1 — hecho**: esqueleto + módulo GBM con simulador
- **F1b — hecho**: conexión a Yahoo Finance. El GBM carga cualquier ticker, calibra μ y σ,
  y simula desde el último cierre real. Probado con Yahoo real el 11 nov.
- **F1c — hecho (11 nov)**: revisión de datos (limpieza + resumen de calidad), esquema
  exacto para precios, Merton con ruido fijo, git.
- **F2 — hecho (11 nov), en revisión del equipo**: Merton en la interfaz. λ arranca en 0
  (= GBM); banda del GBM con las mismas Z en punteado (riesgo de evento); calibración
  por umbral |r − x̄| > c·s con slider de c; histograma de retornos reales y tabla de
  días de salto con columna `[completar]` para la noticia de cada día.
  Limitación documentada: el umbral subestima λ (prueba simulada: λ=4 → λ̂≈2.8).
- **F3 — hecho (11 nov), en revisión del equipo**: OU con la notación y la solución en
  distribución del primer taller (ej. 3 de liquidez como ejemplo inicial; responde sus
  preguntas a 3, 6 y 12 meses). Banda sin reversión (κ = 0) en punteado, θ como línea.
  Calibración AR(1); atajos VIX y TRM.
- **F3b — hecho (11 nov), en revisión**: Vasicek como módulo 4 (OU de la tasa corta + bono cero
  cupón con fórmula de Hull + curva de tasas), calibrado con ^IRX.
- **F4 — hecho (11 nov), en revisión del equipo**: fBm geométrico
  S(t) = S(0)exp[μt − σ²t^(2H)/2 + σB_H(t)]. H arranca en 0.5 (= GBM, punteado); ρ(1) =
  2^(2H−1) − 1 en la lectura. Ĥ por escalamiento de la varianza (bloques de k días,
  regresión log-log) con gráfico. Precisión documentada: sesgo −0.02/−0.03, ±0.05 con
  3 años. Resultados: NVDA 0.48, S&P 10 años 0.41, VIX 10 años 0.37.
- **F5 — hecho (11 nov), en revisión**: Manada con CSAD y CSSD (forma estándar) sobre canastas
  reales (meme 2020-21, bancos 2006-09, tecnológicas); ventana de fechas, cola de CSSD,
  errores Newey-West. Sin simulación.
- **F6 — hecho (11 nov), en revisión**: opciones reales con árbol CRR (abandono, expansión,
  contracción), caso de la presentación de los compañeros, σ de una empresa comparable y
  paradoja de la volatilidad. VPN modificado = VPN estático + c.
- **F7 — descartada (11 nov)**: la comparación entre modelos no se hace. Los modelos no producen
  lo mismo (precio, nivel, medida, decisión) y cada módulo ya se compara con el GBM en vivo.
- **F8 — hecho (11 nov), en revisión**: rediseño completo (ver CLAUDE.md). Fuentes en
  `fuentes/` sin internet; servidor entrega `/fuentes/`.
- **F9**: Textos "qué explica / qué no" con nuestras palabras + ensayo de sustentación

## Decisiones pendientes

