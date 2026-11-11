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

## Pendiente de decidir

- Esquema de simulación: hoy `modelos.js` usa Euler-Maruyama (diapositivas). El taller
  usa transición exacta para el GBM (garantiza precios positivos). Elegir uno y
  justificarlo; los demás modelos (Merton, OU, fBm, manada) usan Euler.
- Opciones reales: método (binomial CRR / Black-Scholes) y tipos de opción.
- Manada: Kirman (implementado) vs modelo de umbral.

## Revisión de los datos de Yahoo — reglas del taller vs estado actual

Cumple:
- auto_adjust=True para retornos.
- La fecha `end` es exclusiva (yfinance) — el servidor la pasa tal cual.
- Respaldo si falla la descarga (caché), y el aplicativo avisa cuando la usa.

Falta implementar en `servidor.py` / `js/datos.js`:
- Ordenar fechas y eliminar duplicados.
- Revisar precios no positivos y faltantes; **no inventar retornos cero**.
  Reportar cuántos datos se descartaron.
- Mostrar en el aplicativo un resumen de calidad (n precios, rango real de fechas,
  descartes, fuente, fecha y hora de la consulta).
- Cierre **sin ajustar** como S₀ cuando se valoren opciones (fase 6); ajustado para retornos.
- Opción de cargar un CSV propio si la descarga falla, registrando la procedencia.
- Guardar las versiones de las bibliotecas (yfinance, pandas) usadas.
- Verificar tickers especiales: índices (^GSPC), divisas (COP=X), y splits
  (NVDA 10:1 en jun. 2024 — con auto_adjust no debería verse un salto falso).
- Mínimo de observaciones: el taller pide ≥ 756 retornos para su rolling; para
  este aplicativo hoy exigimos ≥ 30. Decidir el mínimo razonable por módulo.

## Cómo correrlo

```
pip install -r requirements.txt
python servidor.py          # abre http://localhost:8000
python datos/descarga_datos.py   # antes de la sustentación: precarga la caché
```

## Estado (10 nov 2026)

Hechos: esqueleto, inicio con el mapa de supuestos, módulo GBM con datos reales y
calibración paso a paso. Probado con datos simulados; **falta la primera prueba con
Yahoo real**. Siguiente: revisión de datos (lista de arriba), luego fase 2 (Merton).
