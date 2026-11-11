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
function logRetornos(precios) {
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
