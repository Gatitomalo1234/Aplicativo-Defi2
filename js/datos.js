// datos.js — trae precios reales desde servidor.py (que los baja de Yahoo
// Finance) y calibra los parámetros con el mismo método del taller de valoración.

const DIAS_HABILES = 252;

function fechaISO(d) {
  // fecha local (Bogotá), no UTC: de noche toISOString ya daría el día siguiente
  const dos = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
function haceAnios(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return fechaISO(d);
}

async function cargarHistorico(ticker, desde, hasta) {
  if (location.protocol === "file:") {
    throw new Error(
      "Para traer datos de Yahoo Finance hay que abrir el aplicativo con el servidor: " +
        "en la carpeta del aplicativo corre  python servidor.py"
    );
  }
  const url =
    `/api/historico?ticker=${encodeURIComponent(ticker)}` +
    `&desde=${desde}&hasta=${hasta}`;
  let respuesta;
  try {
    respuesta = await fetch(url);
  } catch (e) {
    throw new Error("El servidor no responde. Revisa que  python servidor.py  siga corriendo.");
  }
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error);
  if (datos.precios.length < 30) {
    throw new Error(
      `Solo hay ${datos.precios.length} precios en ese rango; ` +
        `se necesitan al menos 30 para calibrar.`
    );
  }
  return datos;
}

// Log-retornos diarios: r_t = ln(S_t / S_{t-1})
// El servidor ya descarta precios no positivos; esta revisión es la última
// barrera para no calibrar en silencio con un NaN (p. ej. una copia vieja de la caché).
function logRetornos(precios) {
  const malo = precios.findIndex((p) => !(p > 0) || !Number.isFinite(p));
  if (malo !== -1) {
    throw new Error(`El precio número ${malo + 1} no es un número positivo (${precios[malo]}); no se puede calibrar.`);
  }
  const r = [];
  for (let i = 1; i < precios.length; i++) r.push(Math.log(precios[i] / precios[i - 1]));
  return r;
}

// Calibración del GBM (taller de valoración):
//   x̄ = media de los log-retornos diarios,  s = desviación muestral
//   σ̂ = s · √252
//   μ̂ = 252 · x̄ + σ̂² / 2      (el +σ²/2 corrige el sesgo de Itô)
function calibrarGBM(precios) {
  const r = logRetornos(precios);
  const n = r.length;
  const media = r.reduce((a, b) => a + b, 0) / n;
  const varianza = r.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1);
  const s = Math.sqrt(varianza);
  const sigma = s * Math.sqrt(DIAS_HABILES);
  const mu = DIAS_HABILES * media + (sigma * sigma) / 2;
  return { mu, sigma, s0: precios[precios.length - 1], nRetornos: n, media, s };
}

// Calibración de Merton por umbral (método simple, sustentable paso a paso):
//   1. Un día es "de salto" si su log-retorno se aleja de la media más de c
//      desviaciones: |r − x̄| > c·s. (c lo elige el usuario: es un slider.)
//   2. λ̂  = número de saltos / años de datos           (saltos por año)
//      μ̂J = media de los retornos de salto,  σ̂J = su desviación muestral
//      (aproximación: el retorno de un día de salto incluye también el ruido
//      difusivo de ese día; lo despreciamos porque es pequeño frente al salto)
//   3. σ̂  = desviación de los días SIN salto · √252     (solo riesgo difusivo)
//   4. μ̂ se despeja de la media de los log-retornos. En el modelo compensado
//      ln S crece en promedio (μ − λk − σ²/2 + λ·μJ) por año, con k = e^(μJ+σJ²/2) − 1:
//      μ̂ = 252·x̄ + σ̂²/2 + λ̂·(k̂ − μ̂J)
function calibrarMerton(precios, fechas, c = 3) {
  const r = logRetornos(precios);
  const n = r.length;
  const media = r.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(r.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1));
  const corte = c * s;

  const saltos = [], normales = [];
  r.forEach((x, i) => {
    if (Math.abs(x - media) > corte) saltos.push({ i: i + 1, fecha: fechas[i + 1], r: x });
    else normales.push(x);
  });

  const anios = n / DIAS_HABILES;
  const lambda = saltos.length / anios;
  const ys = saltos.map((o) => o.r);
  const muJ = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
  const sigmaJ = ys.length > 1
    ? Math.sqrt(ys.reduce((a, b) => a + (b - muJ) ** 2, 0) / (ys.length - 1))
    : 0;

  const mN = normales.reduce((a, b) => a + b, 0) / normales.length;
  const sN = Math.sqrt(normales.reduce((a, b) => a + (b - mN) ** 2, 0) / (normales.length - 1));
  const sigma = sN * Math.sqrt(DIAS_HABILES);
  const k = Math.exp(muJ + (sigmaJ * sigmaJ) / 2) - 1;
  const mu = DIAS_HABILES * media + (sigma * sigma) / 2 + lambda * (k - muJ);

  return {
    mu, sigma, lambda, muJ, sigmaJ, k, c, corte,
    s0: precios[precios.length - 1],
    nRetornos: n, media, s, anios, saltos, retornos: r,
    sigmaTotal: s * Math.sqrt(DIAS_HABILES), // la σ que vería el GBM, para comparar
  };
}

// Calibración de Ornstein-Uhlenbeck: regresión AR(1) por mínimos cuadrados.
//   La solución del taller, a un paso de Δt = 1 día, es una regresión lineal:
//     X(t+Δt) = a + b·X(t) + ε,   con  b = e^(−κΔt),  a = θ(1 − b),
//     Var(ε) = σ²/(2κ)·(1 − b²)
//   Se estiman â, b̂ y s_ε (desviación de los residuos, con n − 2) y se despeja:
//     κ̂ = −ln(b̂)/Δt,   θ̂ = â/(1 − b̂),   σ̂ = s_ε·√(2κ̂/(1 − b̂²))
//   Vida media: ln 2 / κ̂ — tiempo en que se cierra la mitad de la distancia a θ.
//   Si b̂ ≥ 1 no hay reversión que estimar: se reporta y κ̂ = 0.

function calibrarOU(valores) {
  const x = valores.slice(0, -1), y = valores.slice(1);
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - a - b * x[i]) ** 2;
  const sEps = Math.sqrt(sse / (n - 2));

  const x0 = valores[valores.length - 1];
  const base = { a, b, sEps, n, x0, minimo: Math.min(...valores), maximo: Math.max(...valores) };
  if (!(b > 0 && b < 1)) {
    // sin reversión: browniano sin deriva, σ̂ = s_ε/√Δt; θ no se puede estimar
    return { ...base, reversion: false, kappa: 0, theta: x0, sigma: sEps / Math.sqrt(DT), vidaMediaDias: Infinity };
  }
  const kappa = -Math.log(b) / DT;
  return {
    ...base, reversion: true, kappa,
    theta: a / (1 - b),
    sigma: sEps * Math.sqrt((2 * kappa) / (1 - b * b)),
    vidaMediaDias: (Math.LN2 / kappa) * DIAS_HABILES,
  };
}
