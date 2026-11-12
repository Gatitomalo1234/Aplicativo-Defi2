// modelos.js — los cinco modelos del semestre con la misma interfaz:
//   simularX(params, Z) -> arreglo de trayectorias (Float64Array de nPasos+1)
// (manada no se simula: se mide sobre datos reales, ver manada.js)
// dt = 1/252. Z son las normales comunes de ruido.js (mismo ruido para todos).
//
// Esquema numérico:
// - Modelos de PRECIO (GBM, Merton, fBm): transición exacta en logaritmos,
//   como en el taller de valoración: S(t+dt) = S(t) · exp[(mu - sigma²/2)dt + sigma·√dt·Z].
//   Garantiza precios positivos con cualquier parámetro (Euler sobre S no: con
//   volatilidad alta puede dar precios negativos).
// - Ornstein-Uhlenbeck: es un NIVEL (tasa, spread), puede ser negativo; se usa
//   su solución en distribución, la del primer taller (también exacta).
// Notación de los talleres: el browniano es B(t).

const DT = 1 / 252; // un día hábil, en años

// 1. Browniano geométrico (punto de partida)
//    dS = mu*S*dt + sigma*S*dB   ->   ln S sube (mu - sigma²/2)dt + sigma*dB
function simularGBM({ s0, mu, sigma }, Z) {
  const deriva = (mu - (sigma * sigma) / 2) * DT;
  const difusion = sigma * Math.sqrt(DT);
  return Z.map((z) => {
    const n = z.length;
    const S = new Float64Array(n + 1);
    S[0] = s0;
    for (let j = 0; j < n; j++) S[j + 1] = S[j] * Math.exp(deriva + difusion * z[j]);
    return S;
  });
}

// Azar propio de los saltos: por cada trayectoria y cada día, una uniforme U
// (¿hay salto?) y una normal W (¿de qué tamaño?). Se sacan SIEMPRE, haya o no
// salto, para que al mover lambda los días de salto existentes se conserven y
// solo aparezcan días nuevos (salto si U < lambda*dt). Igual con muJ y sigmaJ:
// mismos días, solo cambia el tamaño.
function azarDeSaltos(semilla, nCaminos, nPasos) {
  const u = crearGenerador(semilla);
  const U = [], W = [];
  for (let i = 0; i < nCaminos; i++) {
    const ui = new Float64Array(nPasos), wi = new Float64Array(nPasos);
    for (let j = 0; j < nPasos; j++) {
      ui[j] = u();
      wi[j] = normalDesde(u);
    }
    U.push(ui);
    W.push(wi);
  }
  return { U, W };
}

// 2. Saltos de Merton (rompe la continuidad)
//    dS/S = (mu - lambda*k)dt + sigma*dB + dJ,   salto: S -> S·e^Y, Y ~ N(muJ, sigmaJ²)
//    k = E[e^Y - 1] = exp(muJ + sigmaJ²/2) - 1 es la compensación: con ella, mu sigue
//    siendo el retorno esperado total, y el retorno medio no cambia al mover lambda
//    (cambia el riesgo, no la tendencia).
//    Con dt = 1 día aproximamos: a lo sumo un salto por día, con prob lambda*dt.
function simularMerton({ s0, mu, sigma, lambda, muJ, sigmaJ, semillaSaltos = 777 }, Z) {
  const n = Z[0].length;
  const { U, W } = azarDeSaltos(semillaSaltos, Z.length, n);
  const k = Math.exp(muJ + (sigmaJ * sigmaJ) / 2) - 1;
  const deriva = (mu - lambda * k - (sigma * sigma) / 2) * DT;
  const difusion = sigma * Math.sqrt(DT);
  const pSalto = lambda * DT;
  return Z.map((z, i) => {
    const S = new Float64Array(n + 1);
    S[0] = s0;
    let nSaltos = 0;
    for (let j = 0; j < n; j++) {
      let Y = 0;
      if (U[i][j] < pSalto) { Y = muJ + sigmaJ * W[i][j]; nSaltos++; }
      S[j + 1] = S[j] * Math.exp(deriva + difusion * z[j] + Y);
    }
    S.nSaltos = nSaltos; // para la lectura: cuántos eventos tuvo esta trayectoria
    return S;
  });
}

// 3. Ornstein-Uhlenbeck (rompe el drift constante)
//    dX(t) = κ(θ − X(t))dt + σ dB(t)     (notación del primer taller, ejercicio 3)
//    X es un nivel (liquidez, una tasa, el VIX), no un precio: puede ser negativo.
//    Se simula con la solución en distribución del taller, aplicada paso a paso:
//      X(t+Δt) = θ + (X(t) − θ)·e^(−κΔt) + √[σ²/(2κ)·(1 − e^(−2κΔt))] · Z
//    Con κ = 0 no hay reversión: X(t+Δt) = X(t) + σ√Δt·Z (browniano sin deriva).
function simularOU({ x0, kappa, theta, sigma }, Z) {
  const sinReversion = kappa < 1e-9;
  const e = Math.exp(-kappa * DT);
  const sd = sinReversion
    ? sigma * Math.sqrt(DT)
    : Math.sqrt(((sigma * sigma) / (2 * kappa)) * (1 - Math.exp(-2 * kappa * DT)));
  return Z.map((z) => {
    const n = z.length;
    const X = new Float64Array(n + 1);
    X[0] = x0;
    for (let j = 0; j < n; j++) {
      X[j + 1] = sinReversion ? X[j] + sd * z[j] : theta + (X[j] - theta) * e + sd * z[j];
    }
    return X;
  });
}

// Ley de X(t) del taller: X(t) ~ N(m(t), v(t)),
//   m(t) = θ + (X(0) − θ)e^(−κt),   v(t) = σ²/(2κ)·(1 − e^(−2κt))   (t en años)
function momentosOU({ x0, kappa, theta, sigma }, t) {
  if (kappa < 1e-9) return { m: x0, v: sigma * sigma * t };
  return {
    m: theta + (x0 - theta) * Math.exp(-kappa * t),
    v: ((sigma * sigma) / (2 * kappa)) * (1 - Math.exp(-2 * kappa * t)),
  };
}

// Φ(x), la acumulada de la normal estándar (Abramowitz y Stegun 7.1.26, error < 1.5e-7)
function normalAcumulada(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poli = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poli * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// 4. Browniano fraccional (rompe la independencia de incrementos)
//    Correlacionamos las MISMAS normales Z con la matriz de covarianzas del
//    ruido gaussiano fraccional (fGn) via Cholesky. Con H = 0.5 la matriz es la
//    identidad y el modelo colapsa al GBM: eso se puede mostrar en vivo.
const _cacheCholesky = {};
function choleskyFGN(H, n) {
  const clave = H.toFixed(3) + "-" + n;
  if (_cacheCholesky[clave]) return _cacheCholesky[clave];
  // autocovarianza del fGn con paso unitario
  const g = (k) =>
    0.5 *
    (Math.pow(Math.abs(k + 1), 2 * H) -
      2 * Math.pow(Math.abs(k), 2 * H) +
      Math.pow(Math.abs(k - 1), 2 * H));
  const L = [];
  for (let i = 0; i < n; i++) L.push(new Float64Array(i + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let suma = g(i - j);
      for (let k = 0; k < j; k++) suma -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(suma, 1e-12)) : suma / L[j][j];
    }
  }
  // cada matriz ocupa ~1 MB con n = 504: se guardan solo las últimas 20
  const claves = Object.keys(_cacheCholesky);
  if (claves.length >= 20) delete _cacheCholesky[claves[0]];
  _cacheCholesky[clave] = L;
  return L;
}

// Browniano fraccional geométrico:
//    S(t) = s0 · exp[ mu·t - (sigma²/2)·t^(2H) + sigma·B_H(t) ]
//    Var(B_H(t)) = t^(2H), así que E[S(t)] = s0·e^(mu·t) para cualquier H:
//    mover H no cambia la tendencia, solo la forma (memoria) de las trayectorias.
//    Con H = 0.5 es exactamente el GBM de arriba.
function simularFBM({ s0, mu, sigma, H }, Z) {
  const n = Z[0].length;
  const L = choleskyFGN(H, n);
  const escala = Math.pow(DT, H); // sd del incremento fraccional en dt
  return Z.map((z) => {
    const S = new Float64Array(n + 1);
    S[0] = s0;
    let B = 0; // B_H(t) acumulado
    for (let i = 0; i < n; i++) {
      // incremento fraccional dB_i = (L z)_i escalado a dt^H
      let s = 0;
      for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
      B += s * escala;
      const t = (i + 1) * DT;
      S[i + 1] = s0 * Math.exp(mu * t - ((sigma * sigma) / 2) * Math.pow(t, 2 * H) + sigma * B);
    }
    return S;
  });
}

// 5. Comportamiento en manada: no es un modelo de simulación en este aplicativo.
//    Se mide con CSSD y CSAD sobre datos reales (ver datos.js y manada.js).

// 6. Opciones reales — árbol binomial de Cox, Ross y Rubinstein (como lo presentaron
//    los compañeros, Venegas cap. 69). S es el valor presente de los flujos del proyecto.
//      Δt = T/n,  u = e^(σ√Δt),  d = 1/u,  q = (e^(rΔt) − d)/(u − d)
//    En cada nodo se compara ejercer la opción (E) con continuar:
//      C = máx( E(S),  e^(−rΔt)·[q·C_u + (1 − q)·C_d] )      y al final  C = máx(S, E(S))
//    Valor de ejercer, según el tipo de opción:
//      abandono:     E = V                 (se liquida y se recibe el rescate V)
//      expansión:    E = (1 + α)·S − K'    (se paga K' y se amplía la escala en α)
//      contracción:  E = (1 − γ)·S + A     (se reduce la escala en γ y se ahorra A)
//    VPN estático = S0 − I0;  VPN modificado = C0 − I0 = VPN estático + c,  c = C0 − S0.
const TIPOS_OPCION = {
  abandono:    { nombre: "Abandono",    accion: "ABANDONA", ejercer: (S, p) => p.V },
  expansion:   { nombre: "Expansión",   accion: "EXPANDE",  ejercer: (S, p) => (1 + p.alfa) * S - p.Kexp },
  contraccion: { nombre: "Contracción", accion: "CONTRAE",  ejercer: (S, p) => (1 - p.gamma) * S + p.A },
};

function arbolOpcionReal(p) {
  const { S0, I0, sigma, r, T, n, tipo } = p;
  const dt = T / n;
  const u = Math.exp(sigma * Math.sqrt(dt)), d = 1 / u;
  const crecimiento = Math.exp(r * dt), fd = 1 / crecimiento;
  const q = (crecimiento - d) / (u - d);
  if (!(q > 0 && q < 1)) {
    throw new Error(`Con estos parámetros q = ${q.toFixed(3)} queda fuera de (0, 1): habría arbitraje. Sube σ o baja r.`);
  }
  const E = (S) => TIPOS_OPCION[tipo].ejercer(S, p);
  // nodos[t][j]: j = número de bajadas
  const nodos = [];
  for (let t = 0; t <= n; t++) {
    nodos.push(Array.from({ length: t + 1 }, (_, j) => ({ S: S0 * Math.pow(u, t - j) * Math.pow(d, j) })));
  }
  for (const nodo of nodos[n]) {
    nodo.continuar = nodo.S;           // al final, sin opción el proyecto vale S
    nodo.E = E(nodo.S);
    nodo.ejerce = nodo.E > nodo.S;
    nodo.C = Math.max(nodo.S, nodo.E);
  }
  for (let t = n - 1; t >= 0; t--) {
    for (let j = 0; j <= t; j++) {
      const nodo = nodos[t][j];
      nodo.continuar = fd * (q * nodos[t + 1][j].C + (1 - q) * nodos[t + 1][j + 1].C);
      nodo.E = E(nodo.S);
      nodo.ejerce = nodo.E > nodo.continuar;
      nodo.C = Math.max(nodo.E, nodo.continuar);
    }
  }
  const C0 = nodos[0][0].C;
  return { nodos, dt, u, d, q, fd, C0, vpnEstatico: S0 - I0, vpnModificado: C0 - I0, c: C0 - S0 };
}
