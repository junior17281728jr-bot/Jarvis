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

  limpiarViejos(ahora) {
    if (this.registro.size < 1000) return;
    for (const [clave, valor] of this.registro) if (ahora - valor.desde > this.ventanaMs) this.registro.delete(clave);
  }
}
