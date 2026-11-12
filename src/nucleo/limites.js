// Límites contra abusos (por ejemplo, alguien probando contraseñas). Se guardan en memoria:
// si el servidor se reinicia, empiezan de cero, lo cual es aceptable para estos límites.
export class Limitador {
  constructor({ maximo, ventanaMs }) {
    this.maximo = maximo;
    this.ventanaMs = ventanaMs;
    this.registro = new Map();
  }

  // Cuenta un intento y dice si todavía está permitido.
  permitir(clave, ahora = Date.now()) {
    this.limpiarViejos(ahora);
    const actual = this.registro.get(clave);
    if (!actual || ahora - actual.desde > this.ventanaMs) {
      this.registro.set(clave, { cuenta: 1, desde: ahora });
      return this.maximo >= 1;
    }
    actual.cuenta++;
    return actual.cuenta <= this.maximo;
  }

  // ¿Ya llegó al máximo dentro de la ventana? (no cuenta un intento nuevo)
  bloqueado(clave, ahora = Date.now()) {
    const actual = this.registro.get(clave);
    return Boolean(actual && ahora - actual.desde <= this.ventanaMs && actual.cuenta >= this.maximo);
  }

  olvidar(clave) {
    this.registro.delete(clave);
  }

  // Devuelve un intento que se había apartado (por ejemplo, cuando la contraseña resultó correcta).
  descontar(clave) {
    const actual = this.registro.get(clave);
    if (actual && actual.cuenta > 0) actual.cuenta--;
  }

  limpiarViejos(ahora) {
    if (this.registro.size < 1000) return;
    for (const [clave, valor] of this.registro) if (ahora - valor.desde > this.ventanaMs) this.registro.delete(clave);
  }
}

// 0.12.6 (pedido del dueño: «puede intentarlo aunque falle las veces que quiera»): las contraseñas malas NUNCA bloquean.
// En su lugar, el servidor tarda un poco más en contestar cada vez (por cuenta y lugar): los primeros `libres` fallos sin
// espera, después 1 s, 2 s, 4 s… hasta `topeMs`. Una persona apenas lo nota; un programa que prueba miles de contraseñas
// queda frenado. El turno se aparta ANTES de calcular la contraseña (muchos pedidos a la vez se escalonan y ninguno espera
// más de topeMs) y la espera es un temporizador: nunca frena los demás pedidos. Al acertar se olvida.
// Memoria acotada: cada clave se olvida `ventanaMs` después de su último fallo y nunca hay más de `maximoClaves`.
export class Freno {
  constructor({ libres = 5, baseMs = 1000, topeMs = 8000, ventanaMs = 15 * 60 * 1000, maximoClaves = 10_000,
    dormir = ms => new Promise(listo => setTimeout(listo, ms)), reloj = Date.now } = {}) {
    Object.assign(this, { libres, baseMs, topeMs, ventanaMs, maximoClaves, dormir, reloj });
    this.registro = new Map();
  }

  // La espera que le toca al fallo número `fallos` (contando desde 0).
  retraso(fallos) {
    return fallos < this.libres ? 0 : Math.min(this.topeMs, this.baseMs * 2 ** (fallos - this.libres));
  }

  // Aparta el turno de este intento (cuenta como fallo hasta que acierte) y espera lo que le toca. → los ms que esperó.
  async esperarTurno(clave) {
    const ahora = this.reloj();
    this.limpiarViejos(ahora);
    let e = this.registro.get(clave);
    if (e && ahora - e.ultimo > this.ventanaMs) e = null;
    if (!e) e = { fallos: 0, libreEn: 0, ultimo: ahora };
    // Nunca más de topeMs desde ahora: muchos pedidos a la vez se reparten las primeras esperas y después comparten la de
    // 8 s (sin tope, una ráfaga haría esperar horas también a la contraseña buena: eso sería un bloqueo).
    const inicio = Math.min(Math.max(ahora, e.libreEn) + this.retraso(e.fallos), ahora + this.topeMs);
    e.libreEn = inicio;
    e.fallos++;
    e.ultimo = ahora;
    this.registro.delete(clave); // al final del Map: lo más viejo queda primero
    this.registro.set(clave, e);
    const espera = inicio - ahora;
    if (espera > 0) await this.dormir(espera);
    return espera;
  }

  olvidar(clave) {
    this.registro.delete(clave);
  }

  limpiarViejos(ahora) {
    if (this.registro.size >= 1000) for (const [clave, e] of this.registro) if (ahora - e.ultimo > this.ventanaMs && e.libreEn <= ahora) this.registro.delete(clave);
    while (this.registro.size >= this.maximoClaves) this.registro.delete(this.registro.keys().next().value);
  }
}
