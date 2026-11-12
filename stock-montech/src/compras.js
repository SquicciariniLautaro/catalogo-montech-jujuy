// Dolar de compra de la mercaderia. Cada unidad guarda el dolar al que se pago (cotizacion_costo):
// su costo en pesos queda fijo aunque despues cambie el "Costo $" de arriba. Las unidades sin ese
// dato (cargadas antes de que existiera) usan el "Costo $" del dia, como antes.

const redondear = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// Dolar de compra escrito en un formulario. Vacio o invalido = el "Costo $" de hoy.
export const dolarDeCompra = (escrito, costoHoy) => {
  const n = parseFloat(escrito);
  return n > 0 ? n : Number(costoHoy) || 0;
};

// Dolar con el que se pasa a pesos el costo de una unidad
export const dolarDeUnidad = (unidad, costoHoy) => Number(unidad.cotizacion_costo) || Number(costoHoy) || 0;

// Costo en pesos de varias unidades, cada una a su dolar de compra
export const costoEnPesos = (unidades, costoHoy) =>
  (unidades || []).reduce((acc, u) => acc + (Number(u.costo_usd) || 0) * dolarDeUnidad(u, costoHoy), 0);

// Compras de un lote: las unidades con el mismo costo en USD y el mismo dolar van juntas, en el
// orden en que se cargaron (la primera es la que sale primero al vender). dolar = null si esas
// unidades todavia no tienen dolar de compra guardado.
export const comprasDeUnidades = (unidades) => {
  const compras = [];
  const porClave = new Map();
  (unidades || []).forEach((u) => {
    const costo = redondear(u.costo_usd);
    const dolar = Number(u.cotizacion_costo) > 0 ? Number(u.cotizacion_costo) : null;
    const clave = costo + '|' + (dolar || '');
    let compra = porClave.get(clave);
    if (!compra) {
      compra = { clave, costo_usd: costo, dolar, ids: [], cantidad: 0 };
      porClave.set(clave, compra);
      compras.push(compra);
    }
    compra.ids.push(u.id);
    compra.cantidad += 1;
  });
  return compras;
};

// Cambios a guardar en una compra editada (costo en USD y dolar). Devuelve null si no cambio nada
// o un texto de error si un valor no sirve. El dolar vacio deja la compra como estaba.
export const cambiosDeCompra = (compra, escrito) => {
  const cambios = {};
  const costoTexto = String(escrito.costo_usd ?? '').trim();
  const dolarTexto = String(escrito.dolar ?? '').trim();
  if (costoTexto !== '') {
    const costo = parseFloat(costoTexto);
    if (!(costo >= 0)) return { error: 'El costo debe ser un numero valido' };
    if (redondear(costo) !== redondear(compra.costo_usd)) cambios.costo_usd = redondear(costo);
  }
  if (dolarTexto !== '') {
    const dolar = parseFloat(dolarTexto);
    if (!(dolar > 0)) return { error: 'El dolar de compra debe ser mayor a cero' };
    if (dolar !== compra.dolar) cambios.cotizacion_costo = dolar;
  }
  return Object.keys(cambios).length > 0 ? { cambios } : null;
};
