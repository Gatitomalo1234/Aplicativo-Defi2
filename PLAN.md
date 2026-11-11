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
| Manada (Kirman) | agentes independientes | imitación: GameStop, subprime |
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

- `servidor.py` — servidor local + endpoint `/api/historico` (Yahoo Finance + caché)
- `requirements.txt` — yfinance
- `index.html` — el aplicativo
- `css/estilos.css` — diseño
- `js/ruido.js` — generador con semilla (Mulberry32) + Box-Muller → normales comunes
- `js/modelos.js` — los 5 simuladores con la interfaz `simular(params, Z)`
- `js/datos.js` — pide precios al servidor y calibra
- `js/grafico.js` — histórico real + abanico simulado (banda 5–95 %, mediana, hover)
- `js/app.js` — navegación, piezas comunes (formulario de datos, lectura) y módulo GBM
- `js/merton.js` — módulo de Merton (cada módulo se registra en `MODULOS`)
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
- **F3**: OU (subir κ → la banda deja de crecer como √t; calibración sobre TRM o una tasa)
- **F4**: fBm (slider H con las mismas Z; Hurst estimado sobre la serie cargada)
- **F5**: Manada (Kirman: ε cambio propio, δ imitación; GameStop 2021 y S&P 2007-09)
- **F6**: Opciones reales (propuesta, por confirmar con lo visto en clase):
  - árbol binomial CRR del curso aplicado al valor del proyecto
  - σ del proyecto tomada de una empresa comparable en Yahoo Finance
  - opciones de expandir, abandonar y esperar
  - VPN tradicional frente a VPN expandido = VPN + valor de la flexibilidad
- **F7**: Comparación honesta de los modelos contra datos reales (RMSE rolling, QQ-plot de colas)
- **F8**: Diseño y pulida visual (después de que todo funcione)
- **F9**: Textos "qué explica / qué no" con nuestras palabras + ensayo de sustentación

## Decisiones pendientes

- Opciones reales: qué método y qué tipos de opción vio el profe en clase.
- Manada: Kirman (paper 1993, citable) vs umbral de imitación (más intuitivo).
  El simulador en `modelos.js` ya trae Kirman; es intercambiable.
