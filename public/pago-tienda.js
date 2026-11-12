/*
 * pago-tienda.js — Botón "Pagar con tarjeta" en el carrito de mandarinaec.com
 * (11-nov-2026). Lo sirve el CRM; el tema solo lo carga con una línea:
 *
 *   <div id="pago-tarjeta-mandarina"></div>
 *   <script src="https://crm.apps.mandarinaec.com/pago-tienda.js" defer></script>
 *
 * Al tocar el botón abre un recuadro con https://crm.apps.mandarinaec.com/pagar
 * (datos + total que calcula Shopify + Cajita de Payphone) SIN salir de la tienda.
 * Cuando el pago se aprueba, vacía el carrito.
 *
 * SALIDA SEGURA: mientras ABIERTO_A_TODOS sea false, el botón solo aparece en el
 * navegador de quien entró una vez a la tienda con ?pagotarjeta=1
 * (y ?pagotarjeta=0 lo vuelve a esconder). Para todos: cambiar a true y desplegar el CRM.
 */
(function () {
  var ABIERTO_A_TODOS = true
  var CRM = 'https://crm.apps.mandarinaec.com'
  var CLAVE = 'mp_pago_tarjeta'

  function leer(k) { try { return localStorage.getItem(k) } catch (e) { return null } }
  function guardar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch (e) {} }

  var q = new URLSearchParams(location.search).get('pagotarjeta')
  if (q === '1') guardar(CLAVE, '1')
  if (q === '0') guardar(CLAVE, null)
  if (!ABIERTO_A_TODOS && leer(CLAVE) !== '1') return

  var estilos = document.createElement('style')
  estilos.textContent = [
    '.mp-pago-btn{display:block;width:100%;margin:10px 0 0;padding:15px 18px;font-size:16px;font-weight:700;color:#fff;background:#f26a1b;border:0;cursor:pointer;letter-spacing:.02em}',
    '.mp-pago-btn:hover{filter:brightness(1.05)}',
    '.mp-pago-btn small{display:block;font-weight:400;font-size:12px;opacity:.9;margin-top:2px}',
    '.mp-pago-fondo{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px}',
    '.mp-pago-caja{background:#fff;width:min(520px,100%);height:min(820px,94vh);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.3)}',
    '.mp-pago-barra{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #eee;font:600 15px system-ui,sans-serif;color:#111}',
    '.mp-pago-barra button{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:#444}',
    '.mp-pago-caja iframe{border:0;width:100%;flex:1}',
  ].join('')
  document.head.appendChild(estilos)

  var pagado = false

  function abrir() {
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json() })
      .then(function (cart) {
        var lineas = (cart.items || []).map(function (i) { return i.variant_id + ':' + i.quantity })
        if (!lineas.length) { alert('Tu carrito está vacío'); return }
        var fondo = document.createElement('div')
        fondo.className = 'mp-pago-fondo'
        fondo.innerHTML = '<div class="mp-pago-caja" role="dialog" aria-label="Pago con tarjeta">' +
          '<div class="mp-pago-barra"><span>🔒 Pago seguro con tarjeta</span><button type="button" aria-label="Cerrar">×</button></div>' +
          '<iframe allow="payment" title="Pago con tarjeta"></iframe></div>'
        fondo.querySelector('iframe').src = CRM + '/pagar?c=' + encodeURIComponent(lineas.join(','))
        fondo.querySelector('button').onclick = function () { cerrar(fondo) }
        document.body.appendChild(fondo)
        document.documentElement.style.overflow = 'hidden'
      })
      .catch(function () { alert('No pudimos abrir el pago. Intenta de nuevo.') })
  }

  function cerrar(fondo) {
    fondo.remove()
    document.documentElement.style.overflow = ''
    if (pagado) location.href = '/'
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== CRM || !e.data || e.data.origen !== 'mandarina-pago') return
    if (e.data.evento === 'resultado' && e.data.estado === 'PAGADO' && !pagado) {
      pagado = true
      fetch('/cart/clear.js', { method: 'POST', credentials: 'same-origin' }).catch(function () {})
    }
  })

  function ponerBoton() {
    if (document.querySelector('.mp-pago-btn')) return
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mp-pago-btn'
    btn.innerHTML = '💳 Pagar con tarjeta aquí<small>Crédito o débito · sin salir de la tienda</small>'
    btn.onclick = abrir
    var lugar = document.getElementById('pago-tarjeta-mandarina')
    var checkout = document.querySelector('#main-cart-footer [name="checkout"], form[action="/cart"] [name="checkout"]')
    if (lugar) lugar.appendChild(btn)
    else if (checkout && checkout.parentNode) checkout.parentNode.insertBefore(btn, checkout.nextSibling)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ponerBoton)
  else ponerBoton()
})()
