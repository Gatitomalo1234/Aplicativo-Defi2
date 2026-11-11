// ruido.js — fuente única de aleatoriedad del aplicativo.
// Con semilla fija, todos los modelos reciben exactamente las mismas normales Z.
// Así, al mover un parámetro, el cambio en las trayectorias se debe al parámetro
// y no a un azar distinto. Esa es la convención central del aplicativo.

// Generador congruencial Mulberry32: rápido, con semilla, suficiente para simulación.
function crearGenerador(semilla) {
  let a = semilla >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: convierte dos uniformes (0,1) en una normal estándar.
function normalDesde(u) {
  let u1 = u();
  while (u1 === 0) u1 = u();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u());
}

// Matriz de normales comunes: nCaminos filas x nPasos columnas.
function normalesComunes(semilla, nCaminos, nPasos) {
  const u = crearGenerador(semilla);
  const Z = [];
  for (let i = 0; i < nCaminos; i++) {
    const fila = new Float64Array(nPasos);
    for (let j = 0; j < nPasos; j++) fila[j] = normalDesde(u);
    Z.push(fila);
  }
  return Z;
}
