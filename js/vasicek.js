// vasicek.js — módulo 4: modelo de Vasicek (rompe la tasa constante).
// La tasa corta sigue la misma ecuación de OU (se simula con simularOU, la solución en
// distribución del primer taller). Con ella, el precio del bono cero cupón B(t,T) tiene
// fórmula cerrada (bonoVasicek, Hull ec. 30.6–30.8) y se comprueba con las trayectorias
// (bonoSimulado). La curva de tasas R(τ) muestra el efecto de mover r₀, θ, κ y σ.
// Con datos (p. ej. ^IRX, en %): regresión AR(1) de calibrarOU sobre la tasa en decimal.

const EJEMPLO_VASICEK = { r0: 0.03, theta: 0.05, kappa: 0.3, sigma: 0.01 };
let mercadoVasicek = null; // { datos, cal } cuando hay una serie cargada

const fmtTasa = (x) => `${(x * 100).toFixed(2)} %`;

function leerControlesVasicek() {
  actualizarRangos();
  const v = (id) => parseFloat($(`vasicek-${id}`).value);
  const c = { r0: v("r0"), theta: v("theta"), kappa: v("kappa"), sigma: v("sigma"), T: v("T"), n: v("n") };
  $("vasicek-r0-out").textContent = fmtTasa(c.r0);
  $("vasicek-theta-out").textContent = fmtTasa(c.theta);
  $("vasicek-kappa-out").textContent = `${c.kappa.toFixed(2)} /año`;
  $("vasicek-sigma-out").textContent = fmtTasa(c.sigma);
  $("vasicek-T-out").textContent = `${c.T} ${c.T === 1 ? "año" : "años"}`;
  $("vasicek-n-out").textContent = String(c.n);
  return c;
}

function simularYDibujarVasicek() {
  const p = leerControlesVasicek();
  const params = { r: p.r0, kappa: p.kappa, theta: p.theta, sigma: p.sigma };
  const Z = normalesComunes(semillaActual, p.n, Math.round(p.T * DIAS_HABILES));
  const ou = { x0: p.r0, kappa: p.kappa, theta: p.theta, sigma: p.sigma };
  const caminos = simularOU(ou, Z);
  const sinReversion = bandasDe(simularOU({ ...ou, kappa: 0 }, Z));
  const formato = (v) => `${(v * 100).toFixed(1)} %`;

  const opciones = {
    formato, minimoCero: false, nombreHistorico: "tasa real",
    referencia: { p5: sinReversion.p5, p95: sinReversion.p95, nombre: "sin reversión κ = 0 (90 %)", corto: "κ=0" },
    lineaH: { valor: p.theta, nombre: "equilibrio θ" },
  };
  if (mercadoVasicek) {
    const { precios, fechas } = mercadoVasicek.datos;
    opciones.historico = precios.slice(-252).map((x) => x / 100);
    opciones.fechasHistorico = fechas.slice(-252);
  }
  dibujarAbanico($("vasicek-canvas"), caminos, opciones);

  // bono: fórmula cerrada frente al promedio de las trayectorias (mismas Z)
  const f = bonoVasicek(params, p.T);
  const mc = bonoSimulado(caminos);
  const { m, v } = momentosOU(ou, p.T);
  const pNeg = v > 0 ? normalAcumulada(-m / Math.sqrt(v)) : (m < 0 ? 1 : 0);
  const fijo = Math.exp(-p.r0 * p.T);
  pintarFichas("vasicek", [
    { etiqueta: "B(0,T) fórmula", valor: f.B.toFixed(4), nota: "Hull, ec. 30.6" },
    { etiqueta: "B(0,T) simulado", valor: mc.B.toFixed(4), nota: `± ${(1.96 * mc.error).toFixed(4)} (95 %)` },
    { etiqueta: "rendimiento R(T)", valor: fmtTasa(f.R), nota: `bono a ${p.T} años` },
    { etiqueta: "P(r < 0) en T", valor: fmtProb(pNeg), nota: "ley de OU del taller" },
  ]);
  const finales = caminos.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  $("vasicek-lectura").textContent =
    `Partiendo de r₀ = ${fmtTasa(p.r0)}: en ${p.T} ${p.T === 1 ? "año" : "años"} el 90 % central de las ${p.n} ` +
    `trayectorias de la tasa termina entre ${fmtTasa(percentil(finales, 0.05))} y ${fmtTasa(percentil(finales, 0.95))}. ` +
    `El bono que paga 1 en ${p.T} años vale ${f.B.toFixed(4)} con la fórmula y ${mc.B.toFixed(4)} en promedio de las ` +
    `trayectorias (diferencia de ${Math.abs(f.B - mc.B).toFixed(4)}). Con tasa constante valdría e^(−r₀T) = ${fijo.toFixed(4)}. ` +
    textoSemilla();
  pintarKPI("vasicek", {
    titulo: `Bono a ${p.T} ${p.T === 1 ? "año" : "años"} · B(0,T)`, nota: "por cada 1 que paga en T", valor: f.B.toFixed(4),
    chips: [["R(T)", fmtTasa(f.R)], ["D(T)", f.D.toFixed(2)], ["r₀", fmtTasa(p.r0)]],
  });
  dibujarCurvaVasicek(params, p.T);
}

// R(τ) de 3 meses a 30 años, con la tasa constante r₀ (ec. 68) como referencia
function dibujarCurvaVasicek(params, T) {
  const taus = [], R = [];
  for (let tau = 0.25; tau <= 30.0001; tau += 0.25) { taus.push(tau); R.push(bonoVasicek(params, tau).R * 100); }
  const iT = taus.findIndex((t) => Math.abs(t - T) < 1e-9);
  dibujarLinea($("vasicek-curva"), taus.map((t) => `${t % 1 === 0 ? t : t.toFixed(2)} ${t === 1 ? "año" : "años"}`), R,
    (v) => `${v.toFixed(2)} %`, null,
    { marcas: new Set([iT]), horizontal: { valor: params.r * 100, nombre: "tasa constante r₀ (ec. 68)" } });

  const corto = R[0], largo = R[R.length - 1], maximo = Math.max(...R), minimo = Math.min(...R);
  const tol = 0.005; // medio punto básico
  let forma;
  if (Math.abs(largo - corto) < tol && maximo - minimo < tol) {
    forma = "<b>Curva plana:</b> sin incertidumbre ni reversión, todos los plazos pagan r₀ (la ec. 68 del curso).";
  } else if (maximo > Math.max(corto, largo) + tol) {
    forma = "<b>Curva con joroba:</b> sube en los plazos medios y luego baja, porque a plazos largos pesa más la incertidumbre de la tasa (σ).";
  } else if (largo > corto) {
    forma = "<b>Curva normal (sube):</b> la tasa de hoy está por debajo de su equilibrio θ, así que se espera que suba y los bonos largos pagan más.";
  } else {
    forma = "<b>Curva invertida (baja):</b> la tasa de hoy está por encima de su equilibrio θ, así que se espera que baje y los bonos largos pagan menos.";
  }
  $("vasicek-forma").innerHTML = forma;

  const f = bonoVasicek(params, T);
  const filas = [
    [`D(T) = (1 − e<sup>−κT</sup>)/κ`, f.D.toFixed(4)],
    ["A(T)", f.A.toFixed(4)],
    ["B(0,T) = A(T)·e<sup>−D(T)·r₀</sup>", f.B.toFixed(4)],
    ["R(T) = −ln B(0,T) / T", fmtTasa(f.R)],
    ["con tasa constante: e<sup>−r₀T</sup>", Math.exp(-params.r * T).toFixed(4)],
  ];
  if (params.kappa > 1e-9) filas.push(["tasa a plazo muy largo: θ − σ²/(2κ²)", fmtTasa(params.theta - (params.sigma * params.sigma) / (2 * params.kappa * params.kappa))]);
  $("vasicek-pasos").innerHTML = filasPasos(filas);
}

function mostrarCalibracionVasicek() {
  const { datos, cal } = mercadoVasicek;
  const filas = [
    ["pares de días consecutivos (r(t), r(t+Δt)), en decimal", cal.n],
    ["regresión r(t+Δt) = a + b·r(t) + ε: intercepto â", cal.a.toPrecision(4)],
    ["pendiente b̂", cal.b.toFixed(4)],
  ];
  if (cal.reversion) {
    filas.push(
      ["κ̂ = −ln(b̂)/Δt", `${cal.kappa.toFixed(3)} /año`],
      ["θ̂ = â/(1 − b̂)", fmtTasa(cal.theta)],
      ["σ̂ = s<sub>ε</sub>·√(2κ̂/(1 − b̂²))", fmtTasa(cal.sigma)],
      ["vida media = ln 2/κ̂", `${(cal.vidaMediaDias / DIAS_HABILES).toFixed(1)} años`],
    );
  } else {
    filas.push(["b̂ ≥ 1: no hay reversión que estimar", "κ = 0"], ["σ̂ = s<sub>ε</sub>/√Δt", fmtTasa(cal.sigma)]);
  }
  filas.push(["r₀ = último dato", fmtTasa(cal.x0)]);
  $("vasicek-calibracion").innerHTML = `
    <div class="tarjeta-cabeza"><h2>Calibración paso a paso</h2><span class="nota-cabeza">la misma regresión AR(1) de OU</span></div>
    ${encabezadoDatos(datos)}${filasPasos(filas)}
    <p class="aclaracion">Los parámetros salen de datos históricos (medida real). Para valorar bonos se asume
    que el riesgo de tasa no tiene prima, así que se usan tal cual en la fórmula.</p>`;
  $("vasicek-calibracion").hidden = false;
}

function fijarParametrosVasicek(base) {
  for (const id of ["r0", "theta", "kappa", "sigma"]) fijarSlider(`vasicek-${id}`, base[id]);
}

function modoSustentacionVasicek() {
  semillaActual = SEMILLA_BASE;
  const c = mercadoVasicek && mercadoVasicek.cal;
  fijarParametrosVasicek(c ? { r0: c.x0, theta: c.theta, kappa: c.kappa, sigma: c.sigma } : EJEMPLO_VASICEK);
  $("vasicek-T").value = 10;
  $("vasicek-n").value = 200;
  simularYDibujarVasicek();
}

MODULOS.vasicek = {
  dibujar: simularYDibujarVasicek,
  conectar() {
    registrarDatos("vasicek", (datos) => {
      const cal = calibrarOU(datos.precios.map((x) => x / 100)); // la tasa viene en %
      mercadoVasicek = { datos, cal };
      fijarParametrosVasicek({ r0: cal.x0, theta: cal.theta, kappa: cal.kappa, sigma: cal.sigma });
      mostrarCalibracionVasicek();
      const aviso = avisoVasicek(datos);
      $("vasicek-aviso").textContent = aviso || "";
      $("vasicek-aviso").hidden = !aviso;
      simularYDibujarVasicek();
    }, () => {
      mercadoVasicek = null;
      $("vasicek-calibracion").hidden = true;
      $("vasicek-aviso").hidden = true;
      modoSustentacionVasicek();
    });
    for (const id of ["r0", "theta", "kappa", "sigma", "T", "n"]) $(`vasicek-${id}`).addEventListener("input", simularYDibujarVasicek);
    $("vasicek-constante").addEventListener("click", () => {
      $("vasicek-kappa").value = 0;
      $("vasicek-sigma").value = 0;
      simularYDibujarVasicek();
    });
    $("vasicek-semilla").addEventListener("click", () => {
      semillaActual = Math.floor(Math.random() * 100000);
      simularYDibujarVasicek();
    });
    $("vasicek-reiniciar").addEventListener("click", modoSustentacionVasicek);
  },
};
