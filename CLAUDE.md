# Contexto del proyecto — Aplicativo Defi 2

Archivo de contexto para seguir el trabajo en VS Code. Claude Code lo lee solo al
abrir la carpeta; con otro asistente, pídele que lea este archivo y `PLAN.md` primero.

## Qué es

Aplicativo final de Cálculo Estocástico (Defi 2, Universidad Externado, prof. Andrés
Martínez). Reúne los modelos del semestre en un HTML interactivo conectado a Yahoo
Finance. Equipo de Nicolás Cárdenas. Audiencia: estudiantes de Ciencia de Datos —
la teoría se entiende, el foco es la **interpretación económica y de mercado**.

## Lo que pide el profe (criterio para todo)

- Nada que no podamos explicar ni sustentar nosotros. Sin textos que afirmen cosas
  que no podamos demostrar.
- Le gusta ver **cómo cambia el modelo al mover sus parámetros**.
- Simple, con explicaciones sencillas pero claras.
- No está en contra de la IA, pero se nota cuando algo no tiene el toque del estudiante.
  Todo texto interpretativo lo escribe el equipo (marcadores `[completar]`).

## Modelos vistos en clase

GBM → saltos de Merton → Ornstein-Uhlenbeck → Vasicek (ningún compañero lo presentó; se
basa en la renta fija de las diapositivas y en Hull) → browniano fraccional → comportamiento
en manada (los compañeros presentaron CSAD, CSSD y LSV; usaron CSAD) → opciones reales (presentación
de Julián Duarte y Felipe Pulido: árbol binomial CRR, caso de abandono de Venegas págs. 811–813).
Machine learning: fuera del aplicativo por ahora.

## Documentos del profe (carpeta `contexto/`)

- `StochasticCalculus.pdf` (diapositivas, ya en `contexto/`): binomial, CRR, random walks, browniano, Itô,
  GBM, Black-Scholes, renta fija. GBM simulado con **Euler-Maruyama** (diap. 86).
  OU aparece en el ejercicio de liquidez y en dh = γ(α − h)dt + ω dW (diap. 134).
  No trae Merton, browniano fraccional ni manada. Copiado a `contexto/` el 11 nov (138 diap.).
  Renta fija en diap. 117–123: bono cero cupón B(t,T) = exp(−r(T−t)) (ec. 68), B(T,T) = 1,
  martingala bajo Q y ejemplo de arbitraje con bono a 2 años. La ec. 76 de reversión a la media
  (diap. 134) es de tasa de riesgo en educación superior, no de tasas de interés; la equivalencia
  γ = κ, α = θ, ω = σ que dice el módulo OU quedó verificada. No nombra a Vasicek.
- Hull, *Options, Futures and Other Derivatives* 8ª ed. (en Descargas del computador de Nicolás):
  Vasicek en cap. 30, págs. 684–685, ec. 30.6–30.8: P(t,T) = A(t,T)e^(−B(t,T) r(t)).
- `Taller_Valoracion_Plantilla_1.pdf`: taller adicional. Define las **reglas de datos**
  de Yahoo que debemos seguir (abajo) y la calibración. Simula el GBM con **transición
  exacta**: S(t+Δt) = S(t)·exp[(a − σ²/2)Δt + σ√Δt·Z].
- `Primer_Taller_defi2.pdf`: primer taller (binomial, browniano, Itô, OU de liquidez).

## Decisiones tomadas

- Producto final: HTML + CSS + JS propios, sin librerías de gráficos ni CDN.
- Datos: `servidor.py` (biblioteca estándar + yfinance) sirve el HTML y expone
  `GET /api/historico?ticker=&desde=&hasta=`. Caché en `datos/cache/` como respaldo
  sin internet. Se necesita servidor porque el navegador bloquea pedir datos a Yahoo (CORS).
- dt = 1/252. Mismas normales Z con semilla fija (2026 = modo sustentación) para que
  el cambio entre simulaciones se deba solo al parámetro.
- Calibración (taller): x = ln(P_t/P_{t−1}), s muestral con n − 1,
  σ̂ = s·√252, μ̂ = 252·x̄ + σ̂²/2.
- Primero que todo funcione; el diseño visual se pule al final (fase 8).
- Esquema de simulación (11 nov): modelos de PRECIO (GBM, Merton, fBm, manada) con
  transición exacta en logaritmos, como el taller (precios siempre positivos; con
  Euler el fBm con H bajo daba precios negativos). OU con su solución en distribución
  (primer taller, ej. 3). Ya no se usa Euler en ningún modelo. Merton compensado (μ − λk) y con azar de saltos fijo por
  día: subir λ solo agrega saltos. fBm geométrico: exp[μt − σ²t^(2H)/2 + σB_H(t)],
  la media no cambia con H. Revisar que el equipo pueda sustentarlo.
- Versión controlada con git (repo local, sin remoto). `datos/cache/` no se versiona.
- Notación de los talleres: browniano B(t) (dB, no dW). OU como en el primer taller:
  dX(t) = κ(θ − X(t))dt + σ dB(t). Equivalencia con diapositivas (γ, α, ω) puesta como
  nota — **verificar contra diap. 134 cuando esté el PDF de las diapositivas**.
- OU: series VIX (vida media ~7 días) y TRM (vida media ~160 días con 3 años de datos).
  Calibración AR(1) con b = e^(−κΔt). Se decidió NO incluir la prueba de Dickey-Fuller
  (no se vio en clase): ojo, con b̂ cercano a 1 el κ̂ es poco preciso.
- Orden de trabajo acordado (11 nov): terminar todos los modelos → diseño (F8) →
  revisar cada modelo en detalle y escribir los textos `[completar]`.

## Pendiente de decidir


## Revisión de los datos de Yahoo — reglas del taller vs estado actual

Cumple:
- auto_adjust=True para retornos.
- La fecha `end` es exclusiva (yfinance) — el servidor la pasa tal cual.
- Respaldo si falla la descarga (caché), y el aplicativo avisa cuando la usa.
- Ordena fechas, elimina duplicados, descarta faltantes y no positivos sin inventar
  retornos, y reporta los descartes (`limpiar_serie` en servidor.py).
- Resumen de calidad en el panel de calibración (n válidos/recibidos, rango, descartes,
  fuente, fecha y hora de consulta, versiones de yfinance y pandas).
- Versiones fijadas en requirements.txt (yfinance 1.7.0, pandas 3.0.2).
- CSV propio (sección Toma de datos): se lee en el navegador, el servidor lo limpia con
  las mismas reglas y lo guarda con su procedencia (`fuente: CSV propio (archivo)`).
- Exportar CSV con la procedencia en el encabezado (líneas `#`).
- Verificado con Yahoo real (11 nov): ^GSPC y COP=X funcionan; el split de NVDA
  (jun. 2024) no produce salto falso (retorno máx. 5 % en esa ventana).

Falta:
- Mínimo de observaciones: el taller pide ≥ 756 retornos para su rolling; hoy
  exigimos ≥ 30, y el rango por defecto (3 años) da ~750. Decidir por módulo.
- Divisas cotizan ~260 días/año (COP=X), no 252: se decidió dejarlo así (11 nov).
- Cierre sin ajustar como S₀: no aplica (en opciones reales S es el valor del proyecto).

Vasicek (11 nov, pendiente de revisión): módulo 4, después de OU (fBm, manada y opciones pasan a
5, 6 y 7). Misma ecuación de OU para la tasa corta (κ, θ, σ; browniano W para no confundirlo con
el bono B(t,T)). Bono con fórmula cerrada de Hull (bonoVasicek, ec. 30.6–30.8), verificado: con
κ = σ = 0 da e^(−rτ) (ec. 68), coincide con el promedio de trayectorias y con el ej. 30.1 de Hull
(D(4) = 3.29). Curva de tasas R(τ) con su forma explicada. Datos: ^IRX en % → decimal; la
calibración depende mucho de la ventana (5 años θ̂ ≈ 4.9 %, 20 años θ̂ ≈ 1.2 %). Aviso si la serie
no es una tasa (avisoVasicek). Comparación (F7) descartada.
Precarga (11 nov): `datos/descarga_datos.py` baja las 32 series recomendadas (mismas listas que
SERIES_MODELO y CANASTAS). Sin conexión, el servidor elige la copia guardada que más se cruza con
el rango pedido y, en empate, la que trae menos fechas de sobra (`_mejor_copia`).
Inicio (11 nov): al abrir en Inicio se ve solo la tarjeta principal; un clic, la rueda, deslizar o
el teclado muestran la barra y las demás tarjetas (`prepararEntrada` en app.js, `body.portada`).

## Cómo correrlo

```
pip install -r requirements.txt
python3 servidor.py               # abre http://localhost:8000
python3 datos/descarga_datos.py   # antes de la sustentación: precarga las 32 series
```

## Estado (11 nov 2026)

Hechos: esqueleto, inicio con el mapa de supuestos, módulo GBM con datos reales y
calibración paso a paso, probado de punta a punta con Yahoo real. Revisión del 11 nov:
esquema exacto para precios, Merton con ruido fijo y compensado, validación de datos,
el servidor solo entrega index.html, css/, js/ y contexto/.
Fase 2 (Merton) hecha el 11 nov, pendiente de revisión del equipo. Cada módulo es un
archivo propio que se registra en `MODULOS` (app.js) y reutiliza `conectarFormularioDatos`.
Manada y opciones reales se deciden cuando toque esa fase.
F3 (OU) revisada. F4 (fBm) hecha el 11 nov, pendiente de revisión.
F5 (manada) hecha el 11 nov, pendiente de revisión: CSAD (Chang, Cheng y Khorana 2000) y CSSD
(Christie y Huang 1995) en forma estándar, como presentaron los compañeros (no se tiene su
material exacto). Solo datos reales + ventana de fechas + cola de CSSD; sin simulación (Kirman
eliminado). R_m = promedio simple de la canasta; log-retornos; errores Newey-West con
L = ⌊4(T/100)^(2/9)⌋ (verificado contra statsmodels: diferencia ~1e-13). LSV no se puede
(necesita operaciones de fondos). Resultado honesto: con las canastas recomendadas NO hay
evidencia significativa de manada (meme período completo p ≈ 0.06). Canastas en `CANASTAS`
(manada.js); en Toma de datos se bajan como canasta y se recuerdan.
F6 (opciones reales) hecha el 11 nov, pendiente de revisión: árbol CRR (arbolOpcionReal en
modelos.js) con abandono, expansión y contracción (Venegas ec. 69.7, sec. 69.5.2, ec. 69.17).
Arranca en el caso de la presentación (S0 = I0 = 90, V = 60, σ = ln 2, r = ln(4/3), 3 pasos) y lo
reproduce: C0 = 95.69, c = 5.69 (la diapositiva dice 95.70 por redondear 181.67 en un paso
intermedio). σ opcional de una empresa comparable (Toma de datos: EC, CIB, XLE, GLD). Gráfico
de la paradoja de la volatilidad (c vs σ, solo donde q ∈ (0,1), σ > r√Δt).
Textos «Qué explica / qué no» (5 modelos): borrador escrito con Claude el 11 nov a pedido de
Nicolás, en viñetas con cifras que muestra el aplicativo. Revisar y pasar a palabras del equipo.
Rediseño visual (F8) hecho el 11 nov, pendiente de revisión: ambiente de la app "Payno"
(cielo, titulares ligeros) + interfaz de tablero tipo "Spotbank" (tarjetas, pestañas píldora,
riel de iconos, cifra grande, fichas). Tipografías locales en `fuentes/` (OFL): Geist (interfaz),
Geist Mono (cifras pequeñas), STIX Two Text (matemáticas y griego; subconjunto a la medida).
Cada módulo es un `.tablero` con tarjetas marcadas con data-parte para el riel.
Toma de datos (11 nov, pendiente de revisión): pestaña nueva y único lugar donde se bajan
series. Los módulos ya no tienen formulario: muestran la "serie en uso" y reciben datos con
`usarSerieEn` (app.js). La elección se recuerda en localStorage y al reabrir se restaura desde
`datos/cache/` (sin internet). Servidor: `GET /api/guardados`, `GET /api/guardado?archivo=`,
`POST /api/importar` (CSV), `POST /api/borrar`. Una serie se puede quitar de un módulo (botón
«Quitar serie», «quitar» en la tarjeta del modelo o el interruptor «✓ Usar en»): el módulo
vuelve a los parámetros de ejemplo (`registrarDatos(prefijo, alCargar, alSoltar)`). Las series
guardadas se pueden borrar desde la lista (con confirmación).
Cualquier serie se puede usar en cualquier modelo (decisión del 11 nov). OU muestra un aviso si
la serie parece un precio (`avisoOU` en datos.js: ^VIX, tasas y tipos de cambio `=X` son niveles;
lo demás, precio; CSV propio, aviso condicional).
Series por modelo: menú desplegable con 3-4 recomendaciones por modelo + «Otro ticker…»
(`SERIES_MODELO` en tomadatos.js). Cada «por qué» sale de correr el aplicativo con esa serie
el 11 nov 2026 (σ, saltos, vida media, Ĥ): si cambian mucho con datos nuevos, actualizarlos.
