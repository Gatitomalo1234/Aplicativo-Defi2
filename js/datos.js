// datos.js — trae precios reales desde servidor.py (que los baja de Yahoo
// Finance o los lee de las copias guardadas), lee y exporta CSV, y calibra los
// parámetros de cada modelo con el método del taller de valoración.

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

// ---- conversación con servidor.py ----
// Todas las peticiones pasan por aquí: si el aplicativo se abrió sin el servidor
// (doble clic en index.html) o el servidor se cayó, el mensaje lo dice.
async function pedir(url, opciones) {
  if (location.protocol === "file:") {
    throw new Error(
      "Para traer o guardar datos hay que abrir el aplicativo con el servidor: " +
        "en la carpeta del aplicativo corre  python servidor.py"
    );
  }
  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch (e) {
    throw new Error("El servidor no responde. Revisa que  python servidor.py  siga corriendo.");
  }
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error);
  return datos;
}

// Baja una serie de Yahoo Finance (el servidor la guarda en datos/cache/).
const cargarHistorico = (ticker, desde, hasta) =>
  pedir(`/api/historico?ticker=${encodeURIComponent(ticker)}&desde=${desde}&hasta=${hasta}`);

// Series guardadas en el computador (datos/cache/): se abren sin internet.
const listarGuardados = () => pedir("/api/guardados").then((r) => r.series);
const cargarGuardado = (archivo) => pedir(`/api/guardado?archivo=${encodeURIComponent(archivo)}`);
const borrarGuardado = (archivo) => pedir("/api/borrar", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archivo }),
});

// ¿Nivel o precio? Solo para avisar en OU, que modela un nivel que vuelve a un
// equilibrio. Regla por ticker: índices de volatilidad, tasas y tipos de cambio son
// niveles; lo demás se toma como precio. Un CSV propio no trae ticker: "desconocido".
const NIVELES_CONOCIDOS = /^\^(VIX|VXN|VVIX|VXD|RVX|TNX|IRX|FVX|TYX)$|=X$/;
function tipoDeSerie(datos) {
  if (/CSV/.test(datos.fuente || "")) return "desconocido";
  return NIVELES_CONOCIDOS.test(datos.ticker) ? "nivel" : "precio";
}

// aviso para OU cuando la serie es (o puede ser) un precio; null si es un nivel
function avisoOU(datos) {
  const tipo = tipoDeSerie(datos);
  if (tipo === "nivel") return null;
  const base = "OU modela un nivel que vuelve a un equilibrio (el VIX, una tasa, un tipo de cambio). " +
    "Un precio no tiene un equilibrio al cual volver, así que κ̂, θ̂ y la vida media se deben leer con cuidado.";
  return tipo === "precio"
    ? `Ojo: ${datos.ticker} parece el precio de un activo. ${base}`
    : `Ojo: ${datos.ticker} es un CSV propio. Si es un precio y no un nivel: ${base}`;
}

// Mínimo de precios para calibrar un modelo (la vista rápida acepta menos).
const MINIMO_CALIBRAR = 30;

// ---- CSV propio (regla del taller: respaldo si la descarga falla) ----
// Acepta lo que exporta este aplicativo, Yahoo o Excel: separador "," o ";",
// líneas de comentario con "#", fechas AAAA-MM-DD o DD/MM/AAAA. Columna de precio:
// la primera que se llame Adj Close, Close, cierre, precio o price; si no, la segunda.
function leerCSV(texto) {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lineas.length < 3) throw new Error("El CSV debe tener un encabezado y al menos dos filas.");
  const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const celdas = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const cab = celdas(lineas[0]).map((c) => c.toLowerCase());
  const iFecha = cab.findIndex((c) => /fecha|date/.test(c));
  if (iFecha === -1) throw new Error("No encontré una columna de fecha (se llame «fecha» o «date»).");
  let iPrecio = -1;
  for (const nombre of ["adj close", "cierre_ajustado", "close", "cierre", "precio", "price", "valor"]) {
    iPrecio = cab.findIndex((c) => c === nombre || c.startsWith(nombre));
    if (iPrecio !== -1) break;
  }
  if (iPrecio === -1) iPrecio = iFecha === 0 ? 1 : 0;
  const fechas = [], precios = [];
  for (const l of lineas.slice(1)) {
    const c = celdas(l);
    let f = c[iFecha] || "";
    const dmy = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) f = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    f = f.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`Fecha que no entiendo: «${c[iFecha]}».`);
    let v = (c[iPrecio] || "").replace(/\s/g, "");
    if (sep === ";") v = v.replace(/\./g, "").replace(",", "."); // 1.234,56 -> 1234.56
    const x = parseFloat(v);
    fechas.push(f);
    precios.push(Number.isFinite(x) ? x : null); // faltante: el servidor lo descarta y lo reporta
  }
  return { fechas, precios, columna: cab[iPrecio] };
}

// El servidor limpia la serie con las reglas del taller y la guarda con su procedencia.
const importarSerie = (nombre, archivoOriginal, { fechas, precios }) =>
  pedir("/api/importar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, archivo_original: archivoOriginal, fechas, precios }),
  });

// Exporta la serie a un CSV en el computador, con la procedencia en el encabezado
// (líneas con #: pandas las ignora con read_csv(..., comment="#")).
function exportarCSV(datos) {
  const c = datos.calidad || {};
  const d = c.descartes;
  const cabecera = [
    "# Romper el mercado perfecto — serie exportada desde «Toma de datos»",
    `# serie: ${datos.ticker}`,
    `# fuente: ${datos.fuente}${/Yahoo/.test(datos.fuente) ? " (cierre ajustado por dividendos y splits, auto_adjust=True)" : ""}`,
    `# consultado: ${c.consultado || "sin dato"}`,
    c.versiones ? `# versiones: yfinance ${c.versiones.yfinance}, pandas ${c.versiones.pandas}` : null,
    c.n_validos !== undefined
      ? `# precios válidos: ${c.n_validos} de ${c.n_recibidos}; descartados: ${d.duplicados} fechas repetidas, ${d.faltantes} faltantes, ${d.no_positivos} no positivos`
      : null,
    "fecha,precio",
  ].filter(Boolean);
  const filas = datos.fechas.map((f, i) => `${f},${datos.precios[i]}`);
  const blob = new Blob([cabecera.concat(filas).join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${datos.ticker.replace(/^\^/, "").replace(/[^A-Za-z0-9_-]/g, "_")}_${datos.fechas[0]}_${datos.fechas[datos.fechas.length - 1]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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

// Calibración del browniano fraccional: exponente de Hurst por escalamiento de la varianza.
//   Si se suman los log-retornos en bloques de k días (sin traslape), la desviación
//   de esas sumas crece como k^H:   sd_k = c · k^H   →   ln sd_k = ln c + H · ln k.
//   Retornos independientes (GBM): H = 0.5, la volatilidad crece como √k.
//   Ĥ es la pendiente de la regresión de ln sd_k contra ln k.
//   σ̂ = c · 252^Ĥ: la volatilidad a un año que predice la recta (en el modelo,
//   la desviación del log-precio a t años es σ·t^H). μ̂ = 252·x̄ + σ̂²/2, como en el GBM.
//   Se usan bloques de hasta n/10 días, para tener al menos 10 sumas en cada uno.
const BLOQUES_HURST = [1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60];

function calibrarFBM(precios) {
  const r = logRetornos(precios);
  const n = r.length;
  const media = r.reduce((a, b) => a + b, 0) / n;
  const puntos = [];
  for (const k of BLOQUES_HURST) {
    const nb = Math.floor(n / k);
    if (nb < 10) break;
    const sumas = [];
    for (let b = 0; b < nb; b++) {
      let s = 0;
      for (let i = b * k; i < (b + 1) * k; i++) s += r[i];
      sumas.push(s);
    }
    const m = sumas.reduce((a, b) => a + b, 0) / nb;
    const sd = Math.sqrt(sumas.reduce((a, b) => a + (b - m) ** 2, 0) / (nb - 1));
    puntos.push({ k, bloques: nb, sd });
  }
  // regresión lineal de ln sd contra ln k
  const xs = puntos.map((p) => Math.log(p.k)), ys = puntos.map((p) => Math.log(p.sd));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2;
  }
  const H = sxy / sxx;
  const lnC = my - H * mx;
  const sigma = Math.exp(lnC) * Math.pow(DIAS_HABILES, H);
  const s = puntos[0].sd; // k = 1: la desviación diaria de siempre
  return {
    H, c: Math.exp(lnC), r2: (sxy * sxy) / (sxx * syy), puntos,
    sigma, mu: DIAS_HABILES * media + (sigma * sigma) / 2,
    sigmaGBM: s * Math.sqrt(DIAS_HABILES),
    s0: precios[precios.length - 1], nRetornos: n, media,
  };
}
