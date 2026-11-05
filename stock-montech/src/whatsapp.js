// Mandar por WhatsApp el resumen de la cuenta de un revendedor: que equipos tiene, a que precio y
// cuanto debe. Se arma un enlace https://wa.me/<numero>?text=<mensaje> que abre el chat con esa
// persona y el mensaje ya escrito; el mensaje se puede corregir en WhatsApp antes de mandarlo.

// Codigo de area de Montech: un celular cargado sin codigo de area se toma como de Jujuy
const AREA_LOCAL = '388';

// Pasa el celular como lo hayan cargado ("388 15 512-3456", "0388 4 123456", "+54 9 388...")
// al formato que pide WhatsApp: 549 + codigo de area + numero, sin 0 ni 15. Devuelve '' si no
// se puede reconocer.
export function numeroWhatsApp(texto) {
  const original = String(texto || '').trim();
  let d = original.replace(/\D/g, '');
  if (!d) return '';
  const internacional = original.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (internacional || (d.startsWith('54') && d.length >= 12)) {
    if (!d.startsWith('54')) return d.length >= 8 ? d : ''; // numero de otro pais, tal cual
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  d = d.replace(/^0+/, '');
  // Codigo de area (2 a 4 cifras) + 15 + numero: se saca el 15
  if (d.length === 12) {
    const i = [2, 3, 4].find((pos) => d.slice(pos, pos + 2) === '15');
    if (i !== undefined) d = d.slice(0, i) + d.slice(i + 2);
  }
  // Sin codigo de area: "15 512 3456" o "512 3456"
  if (d.length === 9 && d.startsWith('15')) d = d.slice(2);
  if (d.length === 7) d = AREA_LOCAL + d;
  return d.length === 10 ? '549' + d : '';
}

// Como se ve el numero ya reconocido, para controlarlo al cargarlo
export function numeroWhatsAppLegible(numero) {
  if (!numero) return '';
  return numero.startsWith('549') ? '+54 9 ' + numero.slice(3) : '+' + numero;
}

const pesos = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');

// cuenta: { nombre, items: [{ descripcion, cantidad, precioUnidadArs, precioTotalArs }],
//           totalArs (lo que valen los equipos), creditoArs (lo entregado a cuenta sin usar),
//           saldoArs (lo que debe; negativo si tiene plata a favor) }
export function mensajeCuenta({ nombre, items, totalArs, creditoArs, saldoArs }, fecha = new Date()) {
  const lineas = ['Hola ' + nombre + '! Te paso el resumen de tu cuenta con Montech al ' + fecha.toLocaleDateString('es-AR') + ':', ''];
  if (items.length > 0) {
    lineas.push('*Equipos que tenés:*');
    items.forEach((it) => {
      lineas.push(
        it.cantidad > 1
          ? '- ' + it.cantidad + ' x ' + it.descripcion + ': ' + pesos(it.precioUnidadArs) + ' c/u = ' + pesos(it.precioTotalArs)
          : '- ' + it.descripcion + ': ' + pesos(it.precioTotalArs)
      );
    });
    lineas.push('Total equipos: ' + pesos(totalArs));
  } else {
    lineas.push('No tenés equipos pendientes.');
  }
  if (Math.round(creditoArs) > 0) lineas.push('Pagos a cuenta: - ' + pesos(creditoArs));
  lineas.push('');
  if (saldoArs <= -0.5) lineas.push('*Saldo a tu favor: ' + pesos(-saldoArs) + '*');
  else if (saldoArs < 0.5) lineas.push('*Tu cuenta está al día.*');
  else lineas.push('*Saldo a pagar: ' + pesos(saldoArs) + '*');
  return lineas.join('\n');
}

// Sin numero reconocido, WhatsApp abre igual y deja elegir el chat
export function enlaceWhatsApp(numero, mensaje) {
  return 'https://wa.me/' + (numero || '') + '?text=' + encodeURIComponent(mensaje);
}
