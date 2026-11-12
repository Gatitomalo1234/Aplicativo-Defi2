// fbm.js — módulo 4: browniano fraccional (rompe la independencia de incrementos).
// Mismo patrón que GBM, Merton y OU:
// - H arranca en 0.5: el modelo ES el GBM, con las mismas Z (punteado = GBM).
// - Con σ fijo, la dispersión a un año no cambia con H: cambia la forma del camino
//   (memoria). H < 0.5: lo que sube tiende a corregirse; H > 0.5: tiende a seguir.
// - Con datos: Ĥ por escalamiento de la varianza (calibrarFBM en datos.js).

const EJEMPLO_FBM = { s0: 100, mu: 0.08, sigma: 0.25, H: 0.5 };
let mercadoFBM = null; // { datos, cal } cuando hay una serie cargada

// correlación entre el retorno de un día y el del día siguiente: ρ(1) = 2^(2H−1) − 1
const rhoUno = (H) => Math.pow(2, 2 * H - 1) - 1;

function leerControlesFBM() {
  actualizarRangos(); // relleno de los sliders, también si el valor se fijó desde el código
  const c = {
    mu: parseFloat($("fbm-mu").value), sigma: parseFloat($("fbm-sigma").value),
    H: parseFloat($("fbm-H").value),
    dias: parseInt($("fbm-dias").value, 10), n: parseInt($("fbm-n").value, 10),
  };
  $("fbm-mu-out").textContent = pct(c.mu);
  $("fbm-sigma-out").textContent = pct(c.sigma);
  $("fbm-H-out").textContent = c.H.toFixed(2);
  $("fbm-dias-out").textContent = c.dias + " días";
  $("fbm-n-out").textContent = String(c.n);
  return c;
}

function simularYDibujarFBM() {
  const p = leerControlesFBM();
  const s0 = mercadoFBM ? mercadoFBM.cal.s0 : EJEMPLO_FBM.s0;
  const Z = normalesComunes(semillaActual, p.n, p.dias);
  const caminos = simularFBM({ s0, mu: p.mu, sigma: p.sigma, H: p.H }, Z);
  const gbm = bandasDe(simularGBM({ s0, mu: p.mu, sigma: p.sigma }, Z)); // = fBm con H = 0.5

  const opciones = {
    formato: formatoPrecio,
    referencia: { p5: gbm.p5, p95: gbm.p95, nombre: "GBM H = 0.5 (90 %)", corto: "GBM" },
  };
  if (mercadoFBM) {
    const { precios, fechas } = mercadoFBM.datos;
    opciones.historico = precios.slice(-252);
    opciones.fechasHistorico = fechas.slice(-252);
  }
  dibujarAbanico($("fbm-canvas"), caminos, opciones);

  // lectura: memoria (ρ) y escala del riesgo (σ·T^H frente a σ·√T del GBM)
  const T = p.dias / DIAS_HABILES;
  const rho = rhoUno(p.H);
  const casiSinMemoria = Math.abs(p.H - 0.5) < 0.05; // |ρ| < 0.07
  let memoria;
  if (Math.abs(p.H - 0.5) < 0.005) {
    memoria = "Con H = 0.5 los retornos son independientes: el modelo es exactamente el GBM y las dos bandas coinciden.";
  } else {
    memoria =
      `Con H = ${p.H.toFixed(2)} la correlación entre el retorno de un día y el del siguiente es ` +
      `ρ = 2^(2H−1) − 1 = ${rho.toFixed(2)} (${casiSinMemoria ? "casi cero: muy cerca de un mercado sin memoria" : rho > 0 ? "lo que sube tiende a seguir subiendo" : "lo que sube tiende a corregirse"}). ` +
      `A ${p.dias} días la desviación del log-precio es σ·T^H = ${pct(p.sigma * Math.pow(T, p.H))}, ` +
      `frente a σ·√T = ${pct(p.sigma * Math.sqrt(T))} sin memoria.`;
  }
  const origen = mercadoFBM
    ? `Partiendo del último cierre de ${mercadoFBM.datos.ticker} (${formatoPrecio(s0)})`
    : `Partiendo de ${s0} (ejemplo)`;
  $("fbm-lectura").textContent =
    `${lecturaAbanico(caminos, s0, p.dias, p.n, origen)} ${memoria} ${textoSemilla()}`;
  pintarFichas("fbm", [
    ...fichasDe(caminos, s0).slice(0, 3),
    { etiqueta: "memoria ρ", valor: rho.toFixed(2), nota: Math.abs(p.H - 0.5) < 0.005 ? "sin memoria" : casiSinMemoria ? "casi sin memoria" : rho > 0 ? "momentum" : "sobre-reacción" },
  ]);
  if (!mercadoFBM) {
    pintarKPI("fbm", {
      titulo: "Precio inicial", nota: "parámetros de ejemplo", valor: formatoPrecio(s0),
      chips: [["H", p.H.toFixed(2)], ["μ", pct(p.mu)], ["σ", pct(p.sigma)]],
    });
  }
}

function mostrarCalibracionFBM() {
  const { datos, cal } = mercadoFBM;
  const tabla = cal.puntos.map((q) =>
    `<tr><td>${q.k}</td><td>${q.bloques}</td><td>${pct(q.sd)}</td></tr>`).join("");
  const kMax = cal.puntos[cal.puntos.length - 1].k;
  $("fbm-calibracion").innerHTML = `
    ${encabezadoDatos(datos)}
    <div class="hurst">
      <div>
        <p class="etiqueta">Se suman los ${cal.nRetornos} log-retornos en bloques de k días sin traslape
        y se mide la desviación de esas sumas (sd<sub>k</sub>):</p>
        <table class="tabla-hurst">
          <thead><tr><th>k días</th><th>bloques</th><th>sd<sub>k</sub></th></tr></thead>
          <tbody>${tabla}</tbody>
        </table>
      </div>
      ${filasPasos([
        ["regresión ln sd<sub>k</sub> = ln c + H · ln k: pendiente Ĥ", cal.H.toFixed(3)],
        ["intercepto c · ajuste R²", `${cal.c.toFixed(5)} · ${cal.r2.toFixed(3)}`],
        ["memoria ρ = 2^(2Ĥ−1) − 1, entre un día y el siguiente", rhoUno(cal.H).toFixed(3)],
        [`σ̂ = c · 252^Ĥ (a un año, extrapolada: bloques hasta ${kMax} días)`, pct(cal.sigma)],
        ["σ que usa el GBM, que supone H = 0.5 = s · √252", pct(cal.sigmaGBM)],
        ["μ̂ = 252 · x̄ + σ̂²/2", pct(cal.mu)],
        ["S₀ = último cierre", cal.s0.toFixed(2)],
      ])}
    </div>`;
  $("fbm-calibracion").hidden = false;
  $("fbm-calib-tarjeta").hidden = false;
  $("fbm-loglog-caja").hidden = false;
  dibujarLogLog($("fbm-loglog"), cal.puntos, { H: cal.H, c: cal.c });
  pintarKPI("fbm", {
    titulo: `Exponente de Hurst · ${datos.ticker}`, nota: "Ĥ por escalamiento de la varianza",
    valor: cal.H.toFixed(2),
    chips: [["ρ", rhoUno(cal.H).toFixed(3)], ["σ̂", pct(cal.sigma)], ["μ̂", pct(cal.mu)]],
  });
}

function modoSustentacionFBM() {
  semillaActual = SEMILLA_BASE;
  const base = mercadoFBM ? mercadoFBM.cal : EJEMPLO_FBM;
  for (const id of ["mu", "sigma", "H"]) fijarSlider(`fbm-${id}`, base[id]);
  $("fbm-dias").value = 252;
  $("fbm-n").value = 200;
  simularYDibujarFBM();
}

MODULOS.fbm = {
  dibujar() {
    simularYDibujarFBM();
    if (mercadoFBM) dibujarLogLog($("fbm-loglog"), mercadoFBM.cal.puntos, mercadoFBM.cal);
  },
  conectar() {
    registrarDatos("fbm", (datos) => {
      const cal = calibrarFBM(datos.precios);
      mercadoFBM = { datos, cal };
      for (const id of ["mu", "sigma", "H"]) fijarSlider(`fbm-${id}`, cal[id]);
      mostrarCalibracionFBM();
      simularYDibujarFBM();
    }, () => {
      mercadoFBM = null;
      $("fbm-calib-tarjeta").hidden = true;
      modoSustentacionFBM(); // parámetros de ejemplo (H = 0.5) y semilla 2026
    });
    for (const id of ["fbm-mu", "fbm-sigma", "fbm-H", "fbm-dias", "fbm-n"]) {
      $(id).addEventListener("input", simularYDibujarFBM);
    }
    $("fbm-sin-memoria").addEventListener("click", () => {
      $("fbm-H").value = 0.5;
      simularYDibujarFBM();
    });
    $("fbm-semilla").addEventListener("click", () => {
      semillaActual = Math.floor(Math.random() * 100000);
      simularYDibujarFBM();
    });
    $("fbm-reiniciar").addEventListener("click", modoSustentacionFBM);
  },
};
