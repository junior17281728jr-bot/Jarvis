# JARVIS 3.0 — Guía

JARVIS investiga la bolsa y las loterías dominicanas las 24 horas, practica con **dinero virtual** y precios/resultados reales, aprende de sus errores y te muestra con estadística qué funciona y qué no. **Nunca usa dinero real.**

## Qué hay en esta versión (fase 1)

| Parte | Estado |
|---|---|
| Base: base de datos con migraciones, registro sellado (no se puede alterar sin que se note), usuarios con datos privados, copias verificadas | Implementado y probado |
| Loterías: resultados con doble verificación, pagos configurables, valor esperado exacto, vigilancia de trampas, métodos contra el azar, jugadas automáticas selladas, "su número" con advertencia | Implementado y probado. **Lectores de páginas por validar** contra premios.do y nacionalloteria.com desde el servidor. Horarios de sorteos por verificar |
| Bolsa: cuenta virtual de US$100 (operaciones de US$5 a 10), costes, límites de riesgo, 5 familias de estrategias, prueba histórica sin ver el futuro, ranking con razones, proyección, "¿cuánto invertir?" | Implementado y probado con datos de prueba. **Datos reales dependen de Alpaca/Yahoo/SEC** desde el servidor |
| Motor autónomo: agenda inteligente, hipótesis pre-registradas, examen con datos bajo llave, corrección por pruebas múltiples, prueba en vivo, monedas, auditor de trampas, liga de agentes | Implementado y probado |
| IA: ChatGPT principal, Claude opcional, modelo gratis local, topes de gasto, debate en rondas, noticias en inglés con polémicas | Implementado. **Depende de tus claves**; probado con respuestas simuladas |
| Pantallas: Inicio, Recomendaciones, Empresa, Debate, Mi cuenta, Loterías, Aprendizaje, Estado, Ajustes, **Modo TV**; modo claro y oscuro; app instalable en el celular | Implementado |
| Fase 2 | Avisos al celular (app ntfy), copia cifrada fuera del servidor (rclone + Google Drive), preguntas y respuestas por voz, exportar a Excel (CSV) e imprimir/PDF, glosario, "¿y si hubieras seguido a JARVIS?", boletín mensual A–D, pausa por emoción, valores en RD$, tú vs JARVIS vs mercado, calendario oficial de la bolsa (Alpaca) | Implementado y probado (32 pruebas) |

## Instalar desde el celular (sin computadora)

1. **GitHub**: crea un repositorio público llamado `jarvis` (vacío). Claude sube el programa ahí. No lleva claves ni datos.
2. **Tailscale** (red privada, gratis): crea la cuenta, instala la app en el celular y genera una clave en *Settings → Keys → Generate auth key*.
3. **Oracle Cloud** (gratis): crea la cuenta y una instancia *Ubuntu 24.04* (Ampere A1, 2 OCPU, 12 GB; si dice "out of capacity", usa *VM.Standard.E2.1.Micro*). En *Advanced options → Management → Paste cloud-init script* pega `deploy/cloud-init.sh` con tu clave de Tailscale en `TS_AUTHKEY`. Crea la instancia.
4. Espera unos 10 minutos. En la app de Tailscale aparece **jarvis**. Abre `http://jarvis:8080` en el navegador del celular y crea tu usuario.
5. En **Ajustes → Claves** pega tu clave de ChatGPT (y las demás si quieres). En **Ajustes → Motor** deja *Sin parar* y pulsa *Iniciar*.

Si algo falla, el registro de la instalación está en `/var/log/jarvis-install.log` (se puede ver con Tailscale SSH).

## Instalar en Oracle Cloud con la Mac

Tú haces solo la parte que exige tu identidad; yo hago el resto desde tu Mac:
1. Entra a **cloud.oracle.com** → *Start for free*. Usa tu correo, tu tarjeta (solo verifica, no cobra en el plan gratis) y el código del teléfono. Región de inicio: **US East (Ashburn)** (no se puede cambiar después).
2. Menú → *Compute* → *Instances* → *Create instance*:
   - *Image*: **Ubuntu 24.04** · *Shape*: **Ampere VM.Standard.A1.Flex**, 2 OCPU y 12 GB.
   - *Add SSH keys*: **Generate a key pair** y pulsa *Save private key* (guárdala en tu Mac, en Descargas).
   - *Create*. Anota la **Public IP** que aparece.
3. Abre esta conversación en la app de Claude de tu Mac (enlazada a tu computadora) y dime "listo" con la IP. Yo subo JARVIS, lo instalo, lo pruebo y te dejo el acceso para el celular.

## Instalar en Oracle Cloud (manual)

1. Crea una cuenta en Oracle Cloud y una máquina **Ubuntu** con forma **VM.Standard.A1.Flex** (2 núcleos ARM, 12 GB de RAM: entra en el plan gratis). Si dice "out of capacity", prueba otra zona o reintenta más tarde.
2. Sube esta carpeta al servidor y ejecuta: `sudo bash deploy/install.sh`
3. Pon tus claves: `sudo nano /opt/jarvis/.env` y luego `sudo systemctl restart jarvis`.
   - `OPENAI_API_KEY`: en platform.openai.com → API keys. Pon un límite de gasto también allí. Deja `OPENAI_MODEL` vacío: JARVIS elige el modelo más barato que tu cuenta tenga.
   - `ANTHROPIC_API_KEY` (opcional): Claude Haiku 5.5 cuesta US$0.10 por millón de tokens de entrada; activa el debate entre dos IA.
   - `ALPACA_KEY_ID` y `ALPACA_SECRET_KEY`: cuenta gratis de práctica en alpaca.markets (solo datos).
   - Confirma los precios de la IA en la página oficial y ajústalos en **Ajustes**.
4. Acceso privado desde el celular, la Mac y tu amigo, con **Tailscale** (gratis para uso personal):
   - En el servidor: `curl -fsSL https://tailscale.com/install.sh | sh` y `sudo tailscale up`
   - Publica JARVIS solo dentro de tu red privada: `sudo tailscale serve --bg 8080`
   - Instala Tailscale en tu celular y tu Mac con la misma cuenta; entra a la dirección que te muestra.
   - Para tu amigo: compártele el acceso desde el panel de Tailscale y créale su usuario en **Ajustes → Usuarios**.
5. Abre JARVIS: la primera vez te pide crear la cuenta de administrador.
6. En **Ajustes → Motor autónomo**, elige las horas y pulsa **Iniciar**.

## Uso diario

- **Mapa**: tus empresas ordenadas por lo que más te conviene, en tres zonas: *Te recomiendo*, *En observación* y *No te recomiendo*. Cada una dice si invertir o no, por qué, qué le falta para subir y cuánto tiempo dejarla. El explorador estudia 3 empresas nuevas cada 6 horas (47 empresas y fondos grandes de EE. UU.) y cambia la que lleve 10 revisiones seguidas en *No te recomiendo* si encuentra una mejor; la que sale se revisa otra vez cada 14 días. Todos los movimientos quedan sellados.
- **Mi dinero** (en Mi cuenta): pon cuánto tienes para invertir. Todo se calcula con eso: "Sí, invierte" = 10% por idea, "Invierte poco" = 5%, máximo 20% solo si se cumplen 5 pruebas (la recomienda, probabilidad medida con casos reales, JARVIS acierta más que la suerte, en su plazo ganó 7 de cada 10 veces y la chance de perder es baja). Puedes empezar una práctica nueva con tu monto; la anterior se guarda.
- **Buscar**: pide "de 8 a 10 de cada 10 veces", el plazo y cuánto pondrás. Te dice cuáles cumplen, si JARVIS las recomienda o no, y revisa tu apuesta si es grande (cómo repartirla y entrar en 3 partes).
- **Motor sin parar**: en Ajustes deja marcado *Sin parar* y pulsa *Iniciar*. Trabaja hasta que lo detengas.
- **Avisos de tu dinero real**: si anotas una inversión real en Historial → Dinero real y cae 8% o pasa a *No te recomiendo*, te llega un aviso al celular (una sola vez).

- **Inicio**: la frase de 10 segundos, tus números y qué está haciendo JARVIS.
- **Recomendaciones**: ranking con semáforo; clic en una empresa para ver por qué, cuánto podrías ganar o perder y qué hacer.
- **Modo TV**: pantalla completa en vivo para dejar puesta.
- Los cálculos de dinero real son tuyos: JARVIS te da los números, tú decides.

## Mantenimiento

- Ver si funciona: `systemctl status jarvis` · Registros: `journalctl -u jarvis -n 100`
- Copias diarias verificadas en `/var/lib/jarvis/backups` (se guardan las últimas 14).
- Copia externa cifrada: `sudo apt install -y rclone && sudo -u jarvis rclone config` (conecta Google Drive con el nombre `gdrive`), luego en .env `RCLONE_REMOTE=gdrive:` y `BACKUP_PASSPHRASE=<frase larga>`.
- Avisos al celular: instala la app ntfy, suscríbete a un tema secreto y ponlo en .env como `NTFY_TOPIC`.
- Actualizar: sube la versión nueva y ejecuta de nuevo `sudo bash deploy/install.sh`. Los datos no se tocan: están separados del programa y las migraciones nunca borran.
- Pruebas: `npm test` (36 pruebas automáticas).
