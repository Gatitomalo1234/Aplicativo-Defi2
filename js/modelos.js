// modelos.js — los cinco modelos del semestre con la misma interfaz:
//   simularX(params, Z) -> arreglo de trayectorias (Float64Array de nPasos+1)
// dt = 1/252. Z son las normales comunes de ruido.js (mismo ruido para todos).
//
// Esquema numérico:
// - Modelos de PRECIO (GBM, Merton, fBm, manada): transición exacta en logaritmos,
//   como en el taller de valoración: S(t+dt) = S(t) · exp[(mu - sigma²/2)dt + sigma·√dt·Z].
//   Garantiza precios positivos con cualquier parámetro (Euler sobre S no: con
//   volatilidad alta puede dar precios negativos).
// - Ornstein-Uhlenbeck: es un NIVEL (tasa, spread), puede ser negativo; se usa
//   Euler-Maruyama, el esquema de las diapositivas del curso.

const DT = 1 / 252; // un día hábil, en años

// 1. Browniano geométrico (punto de partida)
//    dS = mu*S*dt + sigma*S*dW   ->   ln S sube (mu - sigma²/2)dt + sigma*dW
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
//    dS/S = (mu - lambda*k)dt + sigma*dW + dJ,   salto: S -> S·e^Y, Y ~ N(muJ, sigmaJ²)
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
//    dX = kappa*(theta - X)*dt + sigma*dW
//    X es un nivel (una tasa, un spread), no un precio: puede simularse directo.
function simularOU({ x0, kappa, theta, sigma }, Z) {
  return Z.map((z) => {
    const n = z.length;
    const X = new Float64Array(n + 1);
    X[0] = x0;
    for (let j = 0; j < n; j++) {
      X[j + 1] = X[j] + kappa * (theta - X[j]) * DT + sigma * Math.sqrt(DT) * z[j];
    }
    return X;
  });
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

// 5. Comportamiento en manada — Kirman (1993) (rompe la independencia de agentes)
//    N agentes son optimistas (compran) o pesimistas (venden). Cada dia, cada
//    agente puede cambiar de opinion solo (prob eps) o por imitar a otro agente
//    elegido al azar (prob delta * fraccion del bando contrario).
//    El sentimiento m = 2k/N - 1 empuja el retorno: con delta alto aparecen
//    burbujas y caidas ENDOGENAS, sin ninguna noticia externa.
//    Precio con la misma transición exacta del GBM, con tendencia beta*m.
//    (Alternativa pendiente de decidir: modelo de umbral de imitacion.)
function simularManada(
  { s0, nAgentes, eps, delta, beta, sigma, semillaAgentes = 555 },
  Z
) {
  const difusion = sigma * Math.sqrt(DT);
  return Z.map((z, idx) => {
    const u = crearGenerador(semillaAgentes + idx);
    const n = z.length;
    const S = new Float64Array(n + 1);
    const M = new Float64Array(n + 1); // sentimiento, por si queremos graficarlo
    S[0] = s0;
    let k = Math.round(nAgentes / 2); // arranque neutral
    for (let j = 0; j < n; j++) {
      // nAgentes micro-actualizaciones por dia (siempre 2 uniformes por paso:
      // el azar consumido no depende de los parámetros)
      for (let a = 0; a < nAgentes; a++) {
        const optimista = u() < k / nAgentes;
        const pCambio = eps + delta * (optimista ? (nAgentes - k) / nAgentes : k / nAgentes);
        if (u() < pCambio) k += optimista ? -1 : 1;
      }
      const m = (2 * k) / nAgentes - 1;
      M[j + 1] = m;
      S[j + 1] = S[j] * Math.exp((beta * m - (sigma * sigma) / 2) * DT + difusion * z[j]);
    }
    S.sentimiento = M;
    return S;
  });
}
