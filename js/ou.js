// ou.js — módulo 3: Ornstein-Uhlenbeck (rompe el drift constante).
// Notación del primer taller (ejercicio 3): dX(t) = κ(θ − X(t))dt + σ dB(t).
// - Sin datos arranca en el ejercicio de liquidez del taller (κ = 0.30/mes,
//   θ = 2.5, σ = 0.40, X(0) = 1.2), pasado a años porque el aplicativo usa dt = 1/252.
// - La línea punteada es el mismo proceso sin reversión (κ = 0) con las mismas Z:
//   ahí se ve cómo κ frena el crecimiento de la banda.
// - Con datos (elegidos en «Toma de datos», p. ej. VIX o TRM): regresión AR(1), ver calibrarOU.

const EJEMPLO_OU = { x0: 1.2, kappa: 0.3 * 12, theta: 2.5, sigma: 0.4 * Math.sqrt(12) };
let mercadoOU = null; // { datos, cal } cuando hay una serie cargada

const fmtProb = (p) =>
  p === 0 ? "0 %" : p < 0.001 ? `${(p * 100).toPrecision(2)} %` : `${(p * 100).toFixed(1)} %`;

// cifras según la escala de la serie (liquidez ~2, VIX ~20, TRM ~4000)
function formatoNivelOU() {
  const base = mercadoOU ? mercadoOU.cal : EJEMPLO_OU;
  const escala = Math.max(Math.abs(base.x0), Math.abs(base.theta));
  return (v) => (escala >= 1000 ? v.toFixed(0) : escala >= 10 ? v.toFixed(1) : v.toFixed(2));
}

function configurarSlider(id, min, max, valor) {
  const el = $(id);
  el.min = min; el.max = max; el.step = "any"; // así θ, κ y σ quedan exactos (ejemplo o calibrados)
  el.value = valor;
}

// rangos de los sliders según la serie (o el ejemplo) y fija los valores base
function fijarParametrosOU(base, minimo = base.x0, maximo = base.x0) {
  const lo = Math.min(minimo, base.theta, base.x0), hi = Math.max(maximo, base.theta, base.x0);
  const span = hi - lo || Math.abs(hi) || 1;
  configurarSlider("ou-kappa", 0, Math.max(20, 3 * base.kappa), base.kappa);
  configurarSlider("ou-theta", lo - span, hi + span, base.theta);
  configurarSlider("ou-sigma", 0, 3 * base.sigma || 1, base.sigma);
}

function leerControlesOU() {
  actualizarRangos(); // relleno de los sliders, también si el valor se fijó desde el código
  const f = formatoNivelOU();
  const c = {
    kappa: parseFloat($("ou-kappa").value), theta: parseFloat($("ou-theta").value),
    sigma: parseFloat($("ou-sigma").value),
    dias: parseInt($("ou-dias").value, 10), n: parseInt($("ou-n").value, 10),
  };
  // en años y, entre paréntesis, en meses como en el taller (κ/12, σ/√12)
  $("ou-kappa-out").textContent = `${c.kappa.toFixed(2)} /año (${(c.kappa / 12).toFixed(3)} /mes)`;
  $("ou-theta-out").textContent = f(c.theta);
  $("ou-sigma-out").textContent = `${f(c.sigma)} (${f(c.sigma / Math.sqrt(12))} /√mes)`;
  $("ou-dias-out").textContent = `${c.dias} días (${(c.dias / 21).toFixed(0)} meses)`;
  $("ou-n-out").textContent = String(c.n);
  return c;
}

function simularYDibujarOU() {
  const p = leerControlesOU();
  const f = formatoNivelOU();
  const x0 = mercadoOU ? mercadoOU.cal.x0 : EJEMPLO_OU.x0;
  const params = { x0, kappa: p.kappa, theta: p.theta, sigma: p.sigma };
  const Z = normalesComunes(semillaActual, p.n, p.dias);
  const caminos = simularOU(params, Z);
  const sinReversion = bandasDe(simularOU({ ...params, kappa: 0 }, Z));

  const opciones = {
    formato: f, minimoCero: false, nombreHistorico: "valor real",
    referencia: { p5: sinReversion.p5, p95: sinReversion.p95, nombre: "sin reversión κ = 0 (90 %)", corto: "κ=0" },
    lineaH: { valor: p.theta, nombre: "equilibrio θ" },
  };
  if (mercadoOU) {
    const { precios, fechas } = mercadoOU.datos;
    opciones.historico = precios.slice(-252);
    opciones.fechasHistorico = fechas.slice(-252);
  }
  dibujarAbanico($("ou-canvas"), caminos, opciones);

  // lectura: simulación frente a la ley teórica del taller
  const T = p.dias / DIAS_HABILES;
  const { m, v } = momentosOU(params, T);
  const sd = Math.sqrt(v);
  const finales = caminos.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  const pNegSim = finales.filter((x) => x < 0).length / finales.length;
  const pNegTeo = normalAcumulada(-m / sd);
  const origen = mercadoOU
    ? `Partiendo del último dato de ${mercadoOU.datos.ticker} (${f(x0)})`
    : `Partiendo de X(0) = ${f(x0)} (ejercicio 3 del taller)`;
  let largoPlazo;
  if (p.kappa < 1e-9) {
    largoPlazo = "Con κ = 0 no hay reversión: X es un browniano sin deriva y la banda crece como √t, sin límite.";
  } else {
    const vidaMedia = (Math.LN2 / p.kappa) * DIAS_HABILES;
    const anchoLargo = 1.645 * p.sigma / Math.sqrt(2 * p.kappa);
    largoPlazo =
      `Vida media: ln 2 / κ = ${vidaMedia.toFixed(1)} días hábiles. A largo plazo la banda se ` +
      `estabiliza en θ ± 1.645·σ/√(2κ) = [${f(p.theta - anchoLargo)}, ${f(p.theta + anchoLargo)}]; ` +
      `sin reversión (punteado) seguiría abriéndose.`;
  }
  $("ou-lectura").textContent =
    `${origen}: a ${p.dias} días, el 90 % central de los ${p.n} escenarios termina entre ` +
    `${f(percentil(finales, 0.05))} y ${f(percentil(finales, 0.95))}, con mediana ${f(percentil(finales, 0.5))}. ` +
    `Ley del taller: X(T) ~ N(m, v) con m = ${f(m)} y √v = ${f(sd)}, es decir 90 % entre ` +
    `${f(m - 1.645 * sd)} y ${f(m + 1.645 * sd)}. P(X(T) < 0): teórica ${fmtProb(pNegTeo)}, ` +
    `simulada ${fmtProb(pNegSim)}. ${largoPlazo} ${textoSemilla()}`;

  const vida = p.kappa < 1e-9 ? "∞" : `${((Math.LN2 / p.kappa) * DIAS_HABILES).toFixed(1)} d`;
  pintarFichas("ou", [
    ...fichasDe(caminos, x0, f).slice(0, 3),
    { etiqueta: "vida media", valor: vida, nota: p.kappa < 1e-9 ? "sin reversión" : "días hábiles" },
  ]);
  if (!mercadoOU) {
    pintarKPI("ou", {
      titulo: "Liquidez inicial X(0)", nota: "ejercicio 3 del taller", valor: f(x0),
      chips: [["κ", `${(p.kappa / 12).toFixed(2)}/mes`], ["θ", f(p.theta)], ["σ", `${f(p.sigma / Math.sqrt(12))}/√mes`]],
    });
  }
}

function mostrarCalibracionOU() {
  const { datos, cal } = mercadoOU;
  const f = formatoNivelOU();
  const filas = [
    ["pares de días consecutivos (X(t), X(t+Δt))", cal.n],
    ["regresión X(t+Δt) = a + b·X(t) + ε: intercepto â", cal.a.toPrecision(4)],
    ["pendiente b̂", cal.b.toFixed(4)],
    ["desviación de los residuos s<sub>ε</sub>", cal.sEps.toPrecision(4)],
  ];
  if (cal.reversion) {
    filas.push(
      ["κ̂ = −ln(b̂)/Δt", `${cal.kappa.toFixed(2)}/año (${(cal.kappa / 12).toFixed(3)}/mes)`],
      ["vida media = ln 2/κ̂", `${cal.vidaMediaDias.toFixed(1)} días hábiles`],
      ["θ̂ = â/(1 − b̂)", f(cal.theta)],
      ["σ̂ = s<sub>ε</sub>·√(2κ̂/(1 − b̂²))", f(cal.sigma)],
    );
  } else {
    filas.push(
      ["b̂ ≥ 1: no hay reversión que estimar (browniano sin deriva)", "κ = 0"],
      ["σ̂ = s<sub>ε</sub>/√Δt", f(cal.sigma)],
    );
  }
  filas.push(["X(0) = último dato", f(cal.x0)], ["rango de la serie", `${f(cal.minimo)} a ${f(cal.maximo)}`]);
  $("ou-calibracion").innerHTML = `
    <div class="tarjeta-cabeza"><h2>Calibración paso a paso</h2><span class="nota-cabeza">regresión AR(1) con b = e<sup>−κΔt</sup></span></div>
    ${encabezadoDatos(datos)}${filasPasos(filas)}`;
  pintarKPI("ou", {
    titulo: `Último dato · ${datos.ticker}`, nota: datos.fechas[datos.fechas.length - 1], valor: f(cal.x0),
    chips: [["κ̂", `${cal.kappa.toFixed(2)}/año`], ["θ̂", f(cal.theta)],
            ["vida media", cal.reversion ? `${cal.vidaMediaDias.toFixed(1)} d` : "∞"]],
  });
  $("ou-calibracion").hidden = false;
}

function modoSustentacionOU() {
  semillaActual = SEMILLA_BASE;
  if (mercadoOU) fijarParametrosOU(mercadoOU.cal, mercadoOU.cal.minimo, mercadoOU.cal.maximo);
  else fijarParametrosOU(EJEMPLO_OU);
  $("ou-dias").value = 252;
  $("ou-n").value = 200;
  simularYDibujarOU();
}

MODULOS.ou = {
  dibujar: simularYDibujarOU,
  conectar() {
    fijarParametrosOU(EJEMPLO_OU);
    registrarDatos("ou", (datos) => {
      const cal = calibrarOU(datos.precios);
      mercadoOU = { datos, cal };
      fijarParametrosOU(cal, cal.minimo, cal.maximo);
      mostrarCalibracionOU();
      simularYDibujarOU();
      const aviso = avisoOU(datos); // se puede usar cualquier serie, pero un precio lleva aviso
      $("ou-aviso").textContent = aviso || "";
      $("ou-aviso").hidden = !aviso;
    }, () => {
      mercadoOU = null;
      $("ou-aviso").hidden = true;
      $("ou-calibracion").hidden = true;
      modoSustentacionOU(); // vuelve al ejercicio 3 del taller
    });
    for (const id of ["ou-kappa", "ou-theta", "ou-sigma", "ou-dias", "ou-n"]) {
      $(id).addEventListener("input", simularYDibujarOU);
    }
    $("ou-sin-reversion").addEventListener("click", () => {
      $("ou-kappa").value = 0;
      simularYDibujarOU();
    });
    $("ou-semilla").addEventListener("click", () => {
      semillaActual = Math.floor(Math.random() * 100000);
      simularYDibujarOU();
    });
    $("ou-reiniciar").addEventListener("click", modoSustentacionOU);
  },
};
