// Documentos legales que cada usuario acepta (términos de uso y contrato de compra de créditos).
// Cada aceptación guarda: quién, nombre completo, cédula, fecha, IP, navegador y la huella exacta del texto aceptado.
// La tabla no permite cambiar ni borrar nada (y además queda sellada en el registro de JARVIS).
// IMPORTANTE: esto es una base razonable, no reemplaza a un abogado. Conviene que un abogado dominicano lo revise.
import { createHash } from 'node:crypto';
import { nowIso, getSetting, activity } from './db.js';
import { seal } from './ledger.js';

export const LEGAL_VERSION = { terminos: '2026-11-01', contrato: '2026-11-01' };

function provider(db) {
  const admin = db.prepare("SELECT COALESCE(display_name, username) n FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const brand = getSetting(db, 'global', 'brand', {});
  return { name: brand.owner || admin?.n || 'el administrador', app: brand.name || 'JARVIS' };
}

export function termsText(db) {
  const p = provider(db);
  return `TÉRMINOS DE USO DE ${p.app.toUpperCase()} (versión ${LEGAL_VERSION.terminos})

1. Qué es. ${p.app} es una herramienta privada de investigación y aprendizaje creada y administrada por ${p.name} ("el Administrador"). Usa precios y resultados reales, pero todas sus operaciones son con DINERO VIRTUAL (simulación).

2. No es asesoría financiera. La información, recomendaciones, porcentajes y explicaciones de ${p.app} (incluidas las generadas por inteligencia artificial) son educativas y orientativas. No son asesoría financiera, legal ni de inversión, ni una garantía de resultados. El pasado no asegura el futuro. Toda decisión con dinero real la toma y ejecuta el Usuario por su cuenta y bajo su propio riesgo.

3. Loterías. ${p.app} no vende ni juega loterías. Si los sorteos son justos, ningún número es más probable que otro. El Usuario juega con dinero real, si lo hace, bajo su responsabilidad y solo si es mayor de edad.

4. Cuenta personal. El usuario y la contraseña son personales e intransferibles. El Usuario es responsable de lo que se haga con su cuenta. El Administrador puede desactivar cuentas que se usen mal.

5. Datos personales. El Usuario autoriza al Administrador a guardar los datos necesarios para dar el servicio (nombre, usuario, actividad, comprobantes de pago y aceptaciones de estos documentos), conforme a la Ley 172-13 sobre protección de datos personales de la República Dominicana. Estos datos no se venden ni se comparten con terceros, salvo que la ley lo exija.

6. Disponibilidad. El servicio se ofrece "tal como está". Puede tener fallas, pausas o cambios. El Administrador no responde por pérdidas derivadas del uso de la información.

7. Cambios. Si estos términos cambian, se pedirá aceptarlos de nuevo.

8. Aceptación electrónica. Al escribir su nombre completo y su cédula y marcar "Acepto", el Usuario firma electrónicamente estos términos, con la misma validez que una firma escrita, conforme a la Ley 126-02 sobre Comercio Electrónico, Documentos y Firmas Digitales. Se guarda la fecha, la hora, la dirección IP y el navegador usados.

9. Ley y tribunales. Se rige por las leyes de la República Dominicana.`;
}

export function contractText(db) {
  const p = provider(db);
  return `CONTRATO DE COMPRA DE CRÉDITOS DE IA ("POTENCIADOR") DE ${p.app.toUpperCase()} (versión ${LEGAL_VERSION.contrato})

PARTES: ${p.name} ("el Proveedor"), administrador de ${p.app}, y la persona que firma abajo ("el Comprador").

1. Objeto. El Comprador paga al Proveedor por créditos digitales que permiten usar funciones de inteligencia artificial dentro de ${p.app} (explicaciones, preguntas y análisis). Los créditos NO son dinero, no son una inversión, no generan intereses, no se pueden cambiar por efectivo ni transferir a otra persona.

2. Precio y forma de pago. El precio es el del paquete elegido en la pantalla Potenciador al momento de la compra. El pago se hace por transferencia o depósito a una de las cuentas bancarias que el Proveedor muestra en ${p.app}. El Comprador declara que verificó que la cuenta está a nombre del Proveedor antes de pagar, y que paga de forma libre y voluntaria.

3. Origen lícito del dinero. El Comprador declara bajo su responsabilidad que el dinero que envía es de origen lícito, que es titular de la cuenta desde la que paga o está autorizado a usarla, y que no usa este pago para fines ilegales (Ley 155-17 contra el lavado de activos). El Proveedor puede rechazar cualquier pago dudoso.

4. Comprobante y aprobación. El Comprador debe subir el comprobante y escribir la cantidad exacta enviada. El Proveedor confirma la llegada del dinero y aprueba o rechaza en un plazo de 24 a 48 horas. Los créditos se entregan solo después de que el Proveedor confirme el pago en su banco.

5. Pagos no confirmados o rechazados. Si el pago no llega, no coincide o no se puede verificar, la solicitud se rechaza y no se entregan créditos. Si el dinero sí llegó pero la solicitud se rechaza, el Proveedor devolverá ese monto a la misma cuenta de origen en un plazo de hasta 15 días hábiles.

6. Devoluciones. Los créditos ya usados no se devuelven. Los créditos no usados pueden devolverse, a criterio del Proveedor, si se piden dentro de los 7 días siguientes a la aprobación. Los planes mensuales cubren 30 días desde su aprobación y no se renuevan solos: renovar requiere un nuevo pago y un nuevo comprobante.

7. Sin garantía de resultados. Comprar créditos no garantiza ganancias. Todo lo dicho en los Términos de Uso de ${p.app} (no es asesoría financiera, dinero virtual, responsabilidad del Usuario) aplica también a este contrato.

8. Cambios de precio. El Proveedor puede cambiar precios y paquetes en el futuro; lo ya pagado y aprobado se respeta.

9. Registro. Este contrato, su versión exacta, la fecha, la IP, el navegador, el nombre y la cédula del Comprador, y cada comprobante quedan guardados y no se pueden borrar, como prueba para ambas partes.

10. Firma electrónica y ley aplicable. Al escribir su nombre completo y su cédula y marcar "Acepto", el Comprador firma electrónicamente este contrato con la misma validez que una firma escrita (Ley 126-02). Se rige por las leyes de la República Dominicana.`;
}

const hash = s => createHash('sha256').update(s).digest('hex');
const DOCS = { terminos: termsText, contrato: contractText };

export function legalDoc(db, doc) {
  if (!DOCS[doc]) throw new Error('Documento no válido.');
  const text = DOCS[doc](db), h = hash(text);
  db.prepare('INSERT OR IGNORE INTO legal_docs (hash, doc, version, text, created_at) VALUES (?, ?, ?, ?, ?)').run(h, doc, LEGAL_VERSION[doc], text, nowIso());
  return { doc, version: LEGAL_VERSION[doc], text, hash: h };
}

const ID_RE = /^(\d{11}|[A-Z0-9]{6,15})$/;
export function normId(v) { const s = String(v || '').toUpperCase().replace(/[\s-]/g, ''); return ID_RE.test(s) ? s : null; }

/** Guarda la firma. No se puede cambiar ni borrar. */
export function acceptLegal(db, user, { doc, fullName, cedula, agree, ip = null, ua = null }) {
  if (!agree) throw new Error('Para continuar tienes que marcar "Acepto".');
  const name = String(fullName || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (name.split(' ').length < 2) throw new Error('Escribe tu nombre completo (nombre y apellido).');
  const id = normId(cedula);
  if (!id) throw new Error('Escribe tu cédula (11 números) o tu pasaporte.');
  const d = legalDoc(db, doc), at = nowIso();
  const s = seal(db, { kind: 'firma_legal', ref: `user:${user.id}`, payload: { doc, version: d.version, hash: d.hash, name, id, at } });
  const info = db.prepare(`INSERT INTO legal_acceptances (user_id, doc, version, doc_hash, full_name, id_number, accepted_at, ip, user_agent, ledger_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(user.id, doc, d.version, d.hash, name, id, at, String(ip || '').slice(0, 64), String(ua || '').slice(0, 300), s.hash);
  activity(db, { type: 'legal', userId: user.id, text: `Firmaste ${doc === 'contrato' ? 'el contrato de compra de créditos' : 'los términos de uso'} (versión ${d.version}). Queda guardado.` });
  return { id: Number(info.lastInsertRowid), version: d.version, at };
}

/** La última firma vigente de esa persona para ese documento (de la versión actual), o null. */
export function currentAcceptance(db, userId, doc) {
  return db.prepare('SELECT id, version, accepted_at, full_name, id_number FROM legal_acceptances WHERE user_id = ? AND doc = ? AND version = ? ORDER BY id DESC LIMIT 1').get(userId, doc, LEGAL_VERSION[doc]) || null;
}

export function listAcceptances(db, { userId = null } = {}) {
  return db.prepare(`SELECT a.id, a.user_id, COALESCE(u.display_name, u.username) who, u.username, a.doc, a.version, a.doc_hash, a.full_name, a.id_number, a.accepted_at, a.ip, a.user_agent, a.ledger_hash
    FROM legal_acceptances a JOIN users u ON u.id = a.user_id ${userId != null ? 'WHERE a.user_id = ?' : ''} ORDER BY a.id DESC LIMIT 500`).all(...(userId != null ? [userId] : []));
}
export function signedText(db, docHash) { return db.prepare('SELECT doc, version, text FROM legal_docs WHERE hash = ?').get(docHash) || null; }
