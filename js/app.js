// app.js — navegación entre módulos y el módulo GBM conectado a datos reales
// (patrón que repetiremos en Merton, OU, fBm, manada y opciones reales).

// ---- navegación por hash ----
const SECCIONES = ["inicio", "gbm", "merton", "ou", "fbm", "manada", "opciones", "comparacion"];

function mostrarSeccion() {
  const id = location.hash.replace("#", "") || "inicio";
  const actual = SECCIONES.includes(id) ? id : "inicio";
  for (const s of SECCIONES) document.getElementById(s).hidden = s !== actual;
  document.querySelectorAll("#navegacion a").forEach((a) => {
    a.classList.toggle("activa", a.dataset.seccion === actual);
  });
  if (actual === "gbm") simularYDibujarGBM();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", mostrarSeccion);

// ---- módulo GBM ----
const SEMILLA_BASE = 2026; // modo sustentación: todo reproducible con esta semilla
let semillaActual = SEMILLA_BASE;
const EJEMPLO_GBM = { s0: 100, mu: 0.08, sigma: 0.25 };
let mercadoGBM = null; // { datos, cal } cuando hay una serie cargada

const $ = (id) => document.getElementById(id);
const pct = (x) => (x * 100).toFixed(1) + " %";

function fijarSlider(id, valor) {
  // si el valor calibrado se sale del rango del slider, el rango se amplía
  const el = $(id);
  if (valor < +el.min) el.min = Math.floor(valor * 10) / 10;
  if (valor > +el.max) el.max = Math.ceil(valor * 10) / 10;
  el.value = valor;
}

function leerControlesGBM() {
  const mu = parseFloat($("gbm-mu").value);
  const sigma = parseFloat($("gbm-sigma").value);
  const dias = parseInt($("gbm-dias").value, 10);
  const n = parseInt($("gbm-n").value, 10);
  $("gbm-mu-out").textContent = (mu * 100).toFixed(0) + " %";
  $("gbm-sigma-out").textContent = (sigma * 100).toFixed(0) + " %";
  $("gbm-dias-out").textContent = dias + " días";
  $("gbm-n-out").textContent = String(n);
  return { mu, sigma, dias, n };
}

function simularYDibujarGBM() {
  const { mu, sigma, dias, n } = leerControlesGBM();
  const s0 = mercadoGBM ? mercadoGBM.cal.s0 : EJEMPLO_GBM.s0;
  const Z = normalesComunes(semillaActual, n, dias);
  const caminos = simularGBM({ s0, mu, sigma }, Z);

  // se muestra el último año de historia real antes del abanico
  const opciones = { formato: (v) => (v >= 1000 ? v.toFixed(0) : v.toFixed(2)) };
  if (mercadoGBM) {
    const { precios, fechas } = mercadoGBM.datos;
    opciones.historico = precios.slice(-252);
    opciones.fechasHistorico = fechas.slice(-252);
  }
  dibujarAbanico($("gbm-canvas"), caminos, opciones);

  // lectura: solo números que salen de la simulación misma
  const finales = caminos.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  const p = (q) => opciones.formato(finales[Math.floor((finales.length - 1) * q)]);
  const pPerdida = finales.filter((v) => v < s0).length / finales.length;
  const origen = mercadoGBM
    ? `Partiendo del último cierre de ${mercadoGBM.datos.ticker} (${opciones.formato(s0)})`
    : `Partiendo de ${s0} (ejemplo)`;
  $("gbm-lectura").textContent =
    `${origen}: a ${dias} días, el 90 % central de los ${n} escenarios termina entre ` +
    `${p(0.05)} y ${p(0.95)}, con mediana ${p(0.5)}. ` +
    `En el ${(pPerdida * 100).toFixed(0)} % de los escenarios el precio termina por debajo del inicial. ` +
    `Semilla ${semillaActual}${semillaActual === SEMILLA_BASE ? " (sustentación)" : ""}.`;
}

function mostrarCalibracion({ datos, cal }) {
  // el cálculo paso a paso, en texto plano, igual que en el taller
  $("gbm-calibracion").innerHTML = `
    <p><b>${datos.ticker}</b>, ${datos.fechas[0]} a ${datos.fechas[datos.fechas.length - 1]}
       · fuente: ${datos.fuente}</p>
    <ul>
      <li>n = ${cal.nRetornos} log-retornos diarios, r = ln(S<sub>t</sub> / S<sub>t−1</sub>)</li>
      <li>media diaria x̄ = ${cal.media.toFixed(5)} &nbsp;·&nbsp; desviación diaria s = ${cal.s.toFixed(5)}</li>
      <li>σ̂ = s · √252 = ${pct(cal.sigma)}</li>
      <li>μ̂ = 252 · x̄ + σ̂²/2 = ${pct(cal.mu)}</li>
      <li>S₀ = último cierre = ${cal.s0.toFixed(2)}</li>
    </ul>`;
  $("gbm-calibracion").hidden = false;
}

async function cargarGBM(ev) {
  ev.preventDefault();
  const ticker = $("gbm-ticker").value.trim();
  const estado = $("gbm-estado");
  estado.className = "estado";
  estado.textContent = `Descargando ${ticker.toUpperCase()} desde Yahoo Finance…`;
  $("gbm-cargar").disabled = true;
  try {
    const datos = await cargarHistorico(ticker, $("gbm-desde").value, $("gbm-hasta").value);
    const cal = calibrarGBM(datos.precios);
    mercadoGBM = { datos, cal };
    fijarSlider("gbm-mu", cal.mu);
    fijarSlider("gbm-sigma", cal.sigma);
    semillaActual = SEMILLA_BASE;
    estado.className = datos.aviso ? "estado aviso" : "estado";
    estado.textContent = datos.aviso
      ? datos.aviso
      : `${datos.precios.length} precios de cierre cargados. Los sliders quedaron en los ` +
        `valores calibrados; muévelos para ver qué cambia.`;
    mostrarCalibracion(mercadoGBM);
    simularYDibujarGBM();
  } catch (e) {
    estado.className = "estado error";
    estado.textContent = e.message;
  } finally {
    $("gbm-cargar").disabled = false;
  }
}

function modoSustentacionGBM() {
  semillaActual = SEMILLA_BASE;
  const base = mercadoGBM ? mercadoGBM.cal : EJEMPLO_GBM;
  fijarSlider("gbm-mu", base.mu);
  fijarSlider("gbm-sigma", base.sigma);
  $("gbm-dias").value = 252;
  $("gbm-n").value = 200;
  simularYDibujarGBM();
}

function conectarGBM() {
  $("gbm-desde").value = haceAnios(3);
  $("gbm-hasta").value = fechaISO(new Date());
  $("gbm-form").addEventListener("submit", cargarGBM);
  for (const id of ["gbm-mu", "gbm-sigma", "gbm-dias", "gbm-n"]) {
    $(id).addEventListener("input", simularYDibujarGBM);
  }
  $("gbm-semilla").addEventListener("click", () => {
    semillaActual = Math.floor(Math.random() * 100000);
    simularYDibujarGBM();
  });
  $("gbm-reiniciar").addEventListener("click", modoSustentacionGBM);
  window.addEventListener("resize", () => {
    if (!$("gbm").hidden) simularYDibujarGBM();
  });
}

conectarGBM();
mostrarSeccion();
