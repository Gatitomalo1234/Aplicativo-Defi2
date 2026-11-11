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

GBM → saltos de Merton → Ornstein-Uhlenbeck → browniano fraccional → comportamiento
en manada (casos GameStop 2021 y subprime 2007-09) → opciones reales (visto el
10 nov 2026; falta definir método y tipos de opción).
Machine learning: fuera del aplicativo por ahora.

## Documentos del profe (carpeta `contexto/`)

- `StochasticCalculus.pdf` (diapositivas): binomial, CRR, random walks, browniano, Itô,
  GBM, Black-Scholes, renta fija. GBM simulado con **Euler-Maruyama** (diap. 86).
  OU aparece en el ejercicio de liquidez y en dh = γ(α − h)dt + ω dW (diap. 134).
  No trae Merton, browniano fraccional ni manada. *Copiar el PDF a `contexto/` a mano.*
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

- Opciones reales: método (binomial CRR / Black-Scholes) y tipos de opción.
- Manada: Kirman (implementado) vs modelo de umbral.

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
- Verificado con Yahoo real (11 nov): ^GSPC y COP=X funcionan; el split de NVDA
  (jun. 2024) no produce salto falso (retorno máx. 5 % en esa ventana).

Falta:
- Cierre **sin ajustar** como S₀ cuando se valoren opciones (fase 6); ajustado para retornos.
- Opción de cargar un CSV propio si la descarga falla, registrando la procedencia.
- Mínimo de observaciones: el taller pide ≥ 756 retornos para su rolling; hoy
  exigimos ≥ 30, y el rango por defecto (3 años) da ~750. Decidir por módulo.
- Divisas cotizan ~260 días/año (COP=X), no 252: decidir cómo anualizar.

## Cómo correrlo

```
pip install -r requirements.txt
python servidor.py          # abre http://localhost:8000
python datos/descarga_datos.py   # antes de la sustentación: precarga la caché
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
F5 (manada) y F6 (opciones reales) EN PAUSA: deben basarse en lo que presentaron los
compañeros del curso; Nicolás trae ese material antes de construirlas.
Siguiente: rediseño visual (F8) a partir de páginas de ejemplo que trae Nicolás.
