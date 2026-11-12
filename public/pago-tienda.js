/*
 * pago-tienda.js — Botones de pago propios de mandarinaec.com (11/12-nov-2026).
 * Lo sirve el CRM; el tema lo carga en TODAS las páginas con una línea (sección
 * "Liquid personalizado" del pie de página):
 *
 *   <script src="https://crm.apps.mandarinaec.com/pago-tienda.js" defer></script>
 *
 * Esconde el "Pagar pedido" y el "Comprar ahora" de Shopify y pone en su lugar
 * dos botones, en el carrito, en la ventanita "Artículo agregado" y en la ficha
 * del producto:
 *   💳 PAGAR CON TARJETA      → recuadro con CRM/pagar (Payphone) sin salir de la tienda.
 *   🏦 PAGAR CON TRANSFERENCIA → el mismo recuadro con &m=t: bancos, cuenta, monto y foto
 *      del comprobante (docs/superpowers/specs/2026-11-12-transferencia-en-tienda-design.md).
 *
 * SALIDA SEGURA: con ABIERTO_A_TODOS=false solo actúa en el navegador que entró con
 * ?pagotarjeta=1 (y ?pagotarjeta=0 lo apaga). Si este archivo no carga, el tema
 * queda con sus botones de Shopify de siempre: nadie se queda sin poder pagar.
 */
(function () {
  if (window.__mpPagoTienda) return
  window.__mpPagoTienda = true

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
    // Los botones de Shopify que mandan a su checkout se esconden SOLO donde ya
    // pusimos los nuestros (si este script falla, la tienda queda como siempre).
    '.mp-escondido{display:none!important}',
    '.mp-con-par .shopify-payment-button,.mp-activo .additional-checkout-buttons{display:none!important}',
    '.mp-par{display:flex;flex-direction:column;gap:10px;margin:12px 0 0;width:100%}',
    '.mp-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:54px;padding:12px 16px;border:0;border-radius:6px;cursor:pointer;font-family:inherit;font-size:16px;font-weight:700;line-height:1.2;letter-spacing:.04em;text-transform:uppercase;color:#fff}',
    '.mp-btn small{font-weight:400;font-size:12px;letter-spacing:0;text-transform:none;opacity:.92;margin-top:3px}',
    '.mp-btn:hover{filter:brightness(1.06)}',
    '.mp-btn[disabled]{opacity:.6;cursor:wait}',
    '.mp-tarjeta{background:#f26a1b}',
    '.mp-transfer{background:#121212}',
    '.mp-aviso{font-family:inherit;font-size:13px;line-height:1.3;color:#b42318;margin:6px 0 0;text-align:center}',
    '.mp-pago-fondo{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px}',
    '.mp-pago-caja{background:#fff;width:min(520px,100%);height:min(820px,94vh);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.3)}',
    '.mp-pago-barra{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #eee;font:600 15px system-ui,sans-serif;color:#111}',
    '.mp-pago-barra button{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:#444}',
    '.mp-pago-caja iframe{border:0;width:100%;flex:1}',
  ].join('')
  document.head.appendChild(estilos)

  var pagado = false

  function abrirTarjeta() { return abrirRecuadro('tarjeta') }

  function abrirRecuadro(modo) {
    return fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json() })
      .then(function (cart) {
        var lineas = (cart.items || []).map(function (i) { return i.variant_id + ':' + i.quantity })
        if (!lineas.length) { alert('Tu carrito está vacío'); return }
        var abierta = document.querySelector('cart-notification.active, cart-notification [aria-modal]')
        if (abierta && abierta.close) try { abierta.close() } catch (e) {}
        var fondo = document.createElement('div')
        fondo.className = 'mp-pago-fondo'
        var titulo = modo === 'transferencia' ? '🏦 Pago por transferencia' : '🔒 Pago seguro con tarjeta'
        fondo.innerHTML = '<div class="mp-pago-caja" role="dialog" aria-label="Pago">' +
          '<div class="mp-pago-barra"><span>' + titulo + '</span><button type="button" aria-label="Cerrar">×</button></div>' +
          '<iframe allow="payment" title="Pago"></iframe></div>'
        fondo.querySelector('iframe').src = CRM + '/pagar?c=' + encodeURIComponent(lineas.join(',')) +
          (modo === 'transferencia' ? '&m=t' : '')
        fondo.querySelector('button').onclick = function () { cerrar(fondo) }
        document.body.appendChild(fondo)
        document.documentElement.style.overflow = 'hidden'
      })
      .catch(function () { alert('No pudimos abrir el pago. Intenta de nuevo.') })
  }

  function irATransferencia() { return abrirRecuadro('transferencia') }

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
    if (e.data.evento === 'cerrar') {
      var abierto = document.querySelector('.mp-pago-fondo')
      if (abierto) cerrar(abierto)
    }
  })

  // En la ficha del producto: primero agrega lo elegido al carrito (con talla y
  // personalización: se manda el formulario tal cual) y luego paga.
  function agregarDesdeFicha(form) {
    return fetch('/cart/add.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: new FormData(form),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.description || d.message || 'No se pudo agregar al carrito')
        return d
      })
    })
  }

  function crearPar(form) {
    var par = document.createElement('div')
    par.className = 'mp-par'
    par.innerHTML =
      '<button type="button" class="mp-btn mp-tarjeta">💳 Pagar con tarjeta<small>Crédito o débito · sin salir de la tienda</small></button>' +
      '<button type="button" class="mp-btn mp-transfer">🏦 Pagar con transferencia<small>Pichincha · Guayaquil · Produbanco · Deuna</small></button>'
    var aviso = null
    function correr(accion) {
      return function () {
        if (aviso) { aviso.remove(); aviso = null }
        var botones = par.querySelectorAll('button')
        for (var i = 0; i < botones.length; i++) botones[i].disabled = true
        var paso = form ? agregarDesdeFicha(form) : Promise.resolve()
        paso.then(accion).catch(function (e) {
          aviso = document.createElement('p')
          aviso.className = 'mp-aviso'
          aviso.textContent = (e && e.message) || 'Algo falló. Intenta de nuevo.'
          par.appendChild(aviso)
        }).then(function () {
          for (var i = 0; i < botones.length; i++) botones[i].disabled = false
        })
      }
    }
    par.querySelector('.mp-tarjeta').onclick = correr(abrirTarjeta)
    par.querySelector('.mp-transfer').onclick = correr(irATransferencia)
    return par
  }

  function ponerBotones() {
    // Carrito (/cart) y ventanita "Artículo agregado": junto a cada "Pagar pedido".
    var checkouts = document.querySelectorAll('[name="checkout"]')
    for (var i = 0; i < checkouts.length; i++) {
      var co = checkouts[i]
      var cont = co.closest('form') || co.parentNode
      if (!cont || !cont.parentNode) continue
      if (!cont.parentNode.querySelector(':scope > .mp-par')) cont.parentNode.insertBefore(crearPar(null), cont)
      co.classList.add('mp-escondido')
      document.body.classList.add('mp-activo')
    }
    // Ficha del producto: debajo de "Agregar al carrito".
    var cajas = document.querySelectorAll('.product-form__buttons')
    for (var j = 0; j < cajas.length; j++) {
      var caja = cajas[j]
      if (caja.querySelector('.mp-par')) continue
      var form = caja.closest('form')
      if (!form) continue
      caja.appendChild(crearPar(form))
      form.classList.add('mp-con-par')
    }
  }

  var pendiente = false
  function programar() {
    if (pendiente) return
    pendiente = true
    requestAnimationFrame(function () { pendiente = false; ponerBotones() })
  }

  function iniciar() {
    ponerBotones()
    // El tema vuelve a pintar el carrito al cambiar cantidades: reponer los botones.
    new MutationObserver(programar).observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar)
  else iniciar()
})()
