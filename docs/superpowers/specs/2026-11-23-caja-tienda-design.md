# Caja de la tienda: cierre diario + salida del efectivo

23-nov-2026 · decidido con Rodrigo en chat · estado: DISEÑO (sin construir)

## Por qué

Hoy no existe ninguna caja en el CRM: no hay tabla de caja, gastos, entregas ni
fondo. El 23-nov hicimos a mano el cuadre de noviembre de Jackeline Barreto
(`uuid-007`) con SQL sobre `crm.pagos` y salió: 21 cobros en efectivo $600,44, 42
transferencias $2.132,32. Pero nadie puede decir si esos $600,44 están en el
cajón, porque **el efectivo se queda en la caja y se acumula** y nunca se cuenta.

Rodrigo pidió que funcione **como en las otras industrias, sin inventar nada**.
Se tomó la práctica estándar de retail (Shopify, Lightspeed, manuales de arqueo en
español): fondo fijo, arqueo a ciegas al cierre, la fórmula de «debería haber»,
diferencias documentadas, retiros registrados, y que quien cuenta no sea quien
recibe la plata.

## Lo que dijo Rodrigo

1. «En la tienda tengo 1 solo vendedor». Una caja y una responsable.
2. «Vamos primero con Jackeline». Esta versión es solo su caja.
3. Hoy el efectivo «lo deja en caja».
4. «Yo paso una vez por semana a retirar», «o me lo depositan a diario».
5. «Que sea una opción: pago efectivo o transferencia». El excedente de cada día
   sale de una de dos formas, y Jackeline elige cuál en el cierre:
   - **💵 Entregado en efectivo:** va a un sobre con la fecha y Rodrigo lo recibe
     cuando pasa.
   - **🏦 Depositado/transferido:** va a la cuenta de la empresa, con foto de la
     papeleta o del comprobante.

## Objetivo

Que cada día de la tienda **cuadre por separado**. Si falta plata, se sabe qué día
faltó y si fue en el cajón, en el sobre o en el depósito. Y Rodrigo confirma desde
el CRM que cada salida de efectivo llegó a sus manos o al banco.

### No-objetivos (v1)

- Cajas de otros usuarios: YAW, Andrés, Xavier, Clever. También registran cobros
  en efectivo, pero no se sabe si van a este cajón. Eso queda para después.
- Conciliar automáticamente con el estado de cuenta del banco. Rodrigo marca a mano.
- Desglose por denominación (billetes de 20, 10…). Se escribe solo el total.
- Cambiar cómo se registran los pagos de un pedido, o su `estado`.
- Tocar el flujo «confirmar transferencia» de la tienda web
  (`/api/pagos/[id]/transferencia`). Ese flujo pasa el pedido a producción y a
  Shopify, y aquí NO se usa.

### Anti-objetivos (sería un fracaso aunque funcione)

- Que Jackeline vea el «debería haber» antes de contar. Eso mata el arqueo a ciegas.
- Que un cierre guardado se pueda editar en silencio.
- Que el cierre le tome más de unos 3 minutos a Jackeline cada noche.
- Que confirmar «llegó al banco» cambie algo del pedido (producción, Shopify, Meta).

## Cómo funciona (lo acordado)

### Cada noche, Jackeline: «Cierre de caja»

1. Escribe cuánto contó en billetes y monedas. **No ve el esperado** hasta guardar.
2. Al guardar, el CRM muestra:

   ```
   CIERRE 23-nov · Jackeline
   Fondo fijo (abrió con)         $ 20,00
   + Efectivo cobrado (CRM)       $ 35,98   ← 1 cobro, con link a cada pedido
   - Salidas de caja              $  0,00
   = Debería haber                $ 55,98
   Contó                          $ 55,98   ✅ cuadra   (o «falta $X» / «sobra $X»)
   ```

3. Si la diferencia pasa de la tolerancia, tiene que escribir el motivo para cerrar.
4. Dice qué hace con el excedente (contado − fondo fijo), una de dos:
   - 💵 **A sobre / entrega en efectivo.**
   - 🏦 **Depositado / transferido.** Sube la foto de la papeleta. Si deposita al
     día siguiente, puede subirla después desde el mismo cierre.
5. El cierre queda **firmado** con su nombre y la hora, y ya no se puede cambiar.
   Si se equivocó, el admin lo reabre y queda registrado quién y cuándo.

Durante el día puede anotar **salidas de caja** (un taxi, útiles…) con monto,
motivo y foto opcional del recibo. Esas restan del esperado.

Para el efectivo cobrado se toman los pagos `tipo='EFECTIVO'`,
`estado='PAGADO'` y `vendedor_id` de la responsable, con `fecha` dentro del día en
hora de Ecuador (America/Guayaquil; el día empieza a las 05:00 UTC). Son los mismos
números del cuadre a mano.

La caja abre todos los días con el **fondo fijo**. Si ayer quedó algo de más (no
salió todo el excedente), eso es el saldo de apertura de hoy. Así la cadena nunca
se rompe: apertura de hoy = contado de ayer − lo que salió ayer.

### Rodrigo (admin): «Por confirmar»

Hay una sola lista con todo lo que tiene que verificar:

```
POR CONFIRMAR (admin)
23-nov  Transferencia   MAN-JAC-6890   $ 40,00   📷        [✓ llegó] [✗ no llegó]
23-nov  Depósito caja   Jackeline      $ 35,98   📷 papeleta [✓ llegó] [✗ no llegó]
22-nov  Sobre efectivo  Jackeline      $ 52,00             [✓ recibido] [✗ no cuadra]
```

- **Transferencias del día:** los pagos `TRANSFERENCIA` que Jackeline registró
  (hoy ya entran como PAGADO con foto en 40 de 42). Él las marca contra el banco.
  Marcar es solo una verificación: **no cambia `crm.pagos.estado` ni el pedido.**
- **Depósitos de caja:** se marcan contra el banco.
- **Sobres:** cuando pasa por la tienda, cuenta cada sobre y lo marca recibido.
  Si no cuadra, escribe cuánto había.
- Los cierres con diferencia salen en rojo, con el motivo que escribió Jackeline.

### Quién ve qué

- **VENDEDOR responsable de una caja** (en v1, solo Jackeline): su cierre del día,
  sus salidas y sus cierres anteriores, sin la vista de admin.
- **ADMIN:** todos los cierres, «Por confirmar», reabrir un cierre, y configurar
  la caja (responsable, fondo fijo, tolerancia).
- Los demás roles no ven nada de esto.

## Valores por defecto (calls mías, Rodrigo puede cambiarlos)

- Fondo fijo de **$20**, configurable por caja.
- Tolerancia de **$5**. Una diferencia mayor pide motivo y sale en rojo.
- La caja se identifica por su **responsable** (un usuario), no por «tienda»,
  porque `usuarios.tiendas` (MANDARINA/INDSTORE) son marcas, no locales.
- Si un día no hubo cierre, el siguiente cierre muestra «faltó cerrar el 22-nov» y
  suma el efectivo de los días sin cerrar.

## Primer día: arqueo de arranque (decidió Rodrigo, opción A)

Rodrigo NO cuenta al inicio del día, ni en el arranque: «yo no tengo tiempo para
contar el dinero al inicio del día». El día que arranca el módulo, **Jackeline
cuenta sola** todo el cajón y lo registra como **cierre cero / saldo inicial**.
Deja el fondo fijo de $20 y el resto va a un sobre (movimiento «sobre efectivo»).
Rodrigo lo cuenta y lo marca recibido cuando pasa, igual que cualquier otro sobre.
Si no coincide, anota cuánto había. Desde ahí corre el cierre diario normal.
Nadie cuenta al abrir: la apertura sale del cierre anterior. Lo anterior al arranque no se intenta cuadrar contra los
pagos del CRM: queda contado una sola vez y nada más.

## Reglas del corte (calls mías tras la revisión, práctica de POS «por turno»)

- **El cierre cubre lo que entró desde el cierre anterior hasta que se firma, no un
  día del calendario.** Cada pago en efectivo queda marcado con el cierre que lo
  incluyó. Un cobro registrado después de firmar, o pasada la medianoche, entra
  en el cierre siguiente. Nada queda huérfano.
- **El esperado se congela al firmar**, junto con la lista de pagos incluidos.
  Si después se edita o se borra un pago que ya estaba en un cierre, el cierre no
  cambia, pero sale un aviso para el admin («pago de MAN-JAC-6890 cambió después
  del cierre del 23-nov»). No se bloquea la edición de pagos.
- **Monto que sale:** viene prellenado con el excedente (contado − fondo fijo).
  Jackeline puede bajarlo, y lo que no sale queda en el cajón como apertura del
  día siguiente.
- **Si el conteo queda por debajo del fondo fijo**, no hay excedente y la caja
  abre con menos, en rojo. Rodrigo repone cuando pasa y lo registra como
  movimiento «reposición de fondo».
- **Transferencias en «Por confirmar»:** solo las de la responsable de la caja, y
  desde el día en que arranca el módulo. «✗ no llegó» deja el pago marcado en rojo
  en una lista «no llegaron» para seguimiento. No toca el pedido.

## Enfoques considerados

- **A. Cierre diario + salida elegida (efectivo a sobre o depósito) + confirmación
  del admin. ELEGIDO.** Es la práctica estándar, cada día cuadra por separado y se
  cumple la separación de funciones (ella cuenta, él recibe o el banco prueba).
  Cuesta unos 3 minutos diarios a Jackeline.
- B. Solo un arqueo semanal cuando Rodrigo pasa. Más liviano, pero una diferencia
  no se puede ubicar en un día. Las guías lo desaconsejan. Descartado.
- C. Solo un reporte de «cuánto debería haber», sin conteo. No controla nada.
  Descartado.

## Constraints

- Next.js 14 en `MANDARINACRM`. Se trabaja en `main` y Vercel despliega desde main.
- Supabase `piingkecjgoisnxccvaa`, schema `crm`. Las tablas nuevas van ahí y la
  migración se registra en `supabase_migrations.schema_migrations`.
- Auth: `requireAdmin(req)` y `usuarioDeSesion()` en `lib/auth.js`. Los permisos
  por rol están en `canAccess`.
- Fotos: el `/api/upload` existente (Cloudinary).
- Montos: `components/InputDinero.js` (punto o coma como separador).
- Fechas en hora de Ecuador, con los helpers de `lib/parseFecha`.
- PostgREST corta en 1000 filas: hay que paginar o agregar en SQL.
- Pruebas: `node --test tests/*.test.js`, con imports relativos.

## Lo que queda al constructor

- Nombres y forma exacta de las tablas. Sugerencia: `crm.cajas`,
  `crm.cierres_caja` y `crm.movimientos_caja` (salidas, sobres y depósitos), más
  una tabla o columnas para la verificación de transferencias que no toque
  `crm.pagos.estado`.
- Dónde va en el menú y cómo se ve, siguiendo el estilo del CRM.
- La lógica del cálculo (esperado, diferencia, apertura) va en un `lib/` puro y
  con tests.
