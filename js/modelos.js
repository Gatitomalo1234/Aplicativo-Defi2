// modelos.js — los cinco modelos del semestre con la misma interfaz:
//   simularX(params, Z) -> arreglo de trayectorias (Float64Array de nPasos+1)
// Todos usan el esquema de las diapositivas del curso: Euler-Maruyama con dt = 1/252.
// Z son las normales comunes de ruido.js (mismo ruido para todos los modelos).

const DT = 1 / 252; // un día hábil, en años

// 1. Browniano geométrico (punto de partida)
//    dS = mu*S*dt + sigma*S*dW
function simularGBM({ s0, mu, sigma }, Z) {
  return Z.map((z) => {
    const n = z.length;
    const S = new Float64Array(n + 1);
    S[0] = s0;
    for (let j = 0; j < n; j++) {
      S[j + 1] = S[j] + mu * S[j] * DT + sigma * S[j] * Math.sqrt(DT) * z[j];
    }
    return S;
  });
}

// 2. Saltos de Merton (rompe la continuidad)
//    dS = mu*S*dt + sigma*S*dW + S*dJ
//    Con dt = 1 día aproximamos: a lo sumo un salto por día, con prob lambda*dt.
//    El tamaño del salto es lognormal: exp(muJ + sigmaJ*Z2) - 1.
//    Los saltos usan su propio generador (semilla aparte): el ruido difusivo
//    sigue siendo el mismo Z comun, y los eventos son independientes de el.
function simularMerton({ s0, mu, sigma, lambda, muJ, sigmaJ, semillaSaltos = 777 }, Z) {
  const u = crearGenerador(semillaSaltos);
  return Z.map((z) => {
    const n = z.length;
    const S = new Float64Array(n + 1);
    S[0] = s0;
    for (let j = 0; j < n; j++) {
      let salto = 0;
      if (u() < lambda * DT) salto = Math.exp(muJ + sigmaJ * normalDesde(u)) - 1;
      S[j + 1] =
        S[j] + mu * S[j] * DT + sigma * S[j] * Math.sqrt(DT) * z[j] + S[j] * salto;
    }
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

function simularFBM({ s0, mu, sigma, H }, Z) {
  const n = Z[0].length;
  const L = choleskyFGN(H, n);
  const escala = Math.pow(DT, H); // sd del incremento fraccional en dt
  return Z.map((z) => {
    // dB fraccional = L * z, escalado a dt^H
    const dB = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
      dB[i] = s * escala;
    }
    const S = new Float64Array(n + 1);
    S[0] = s0;
    for (let j = 0; j < n; j++) {
      S[j + 1] = S[j] + mu * S[j] * DT + sigma * S[j] * dB[j];
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
//    (Alternativa pendiente de decidir: modelo de umbral de imitacion.)
function simularManada(
  { s0, nAgentes, eps, delta, beta, sigma, semillaAgentes = 555 },
  Z
) {
  return Z.map((z, idx) => {
    const u = crearGenerador(semillaAgentes + idx);
    const n = z.length;
    const S = new Float64Array(n + 1);
    const M = new Float64Array(n + 1); // sentimiento, por si queremos graficarlo
    S[0] = s0;
    let k = Math.round(nAgentes / 2); // arranque neutral
    for (let j = 0; j < n; j++) {
      // nAgentes micro-actualizaciones por dia
      for (let a = 0; a < nAgentes; a++) {
        const optimista = u() < k / nAgentes;
        const pCambio = eps + delta * (optimista ? (nAgentes - k) / nAgentes : k / nAgentes);
        if (u() < pCambio) k += optimista ? -1 : 1;
      }
      const m = (2 * k) / nAgentes - 1;
      M[j + 1] = m;
      S[j + 1] = S[j] + beta * m * S[j] * DT + sigma * S[j] * Math.sqrt(DT) * z[j];
    }
    S.sentimiento = M;
    return S;
  });
}
