// Cuentas de la pestana Ventas: cuanta plata entro, que dia entro y cuanta ganancia dejo.
//
// Regla: cada peso cuenta una sola vez, el dia en que entro, y despues no se mueve.
// - Venta directa: entra lo cobrado (el precio menos el equipo recibido en permuta) el dia de
//   la venta.
// - Pago a cuenta de un revendedor o de una seña: entra el dia del pago, aunque despues se use
//   para pagar equipos.
// - Venta que sale de una cuenta (equipo "Pagado" o cuenta cerrada): entra solo la parte que no
//   estaba cubierta por pagos anteriores. La parte cubierta ya se conto el dia de cada pago.
//
// Antes, al cerrar la cuenta, los pagos anteriores desaparecian de su mes y el equipo entraba
// completo en el mes del cierre: la plata que ya se habia cobrado volvia a sumarse ese dia.
//
// La ganancia de un equipo de una cuenta se reparte en la misma proporcion que la plata: cada
// pago lleva la parte de ganancia de lo que pago. Lo entregado que todavia no se uso en ningun
// equipo lleva una ganancia estimada con el margen de lo que esa persona tiene hoy.

// Movimientos de una misma cuenta separados por menos de esto son una sola operacion (un pago que
// cierra la cuenta y la venta de sus equipos). Dentro de una operacion la plata se toma antes que
// los equipos, aunque los relojes del celular y de la base difieran en unos segundos.
const VENTANA_OPERACION_MS = 2 * 60 * 1000;
const CENTAVO = 0.005;

const tiempo = (iso) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

// ventas: unidades vendidas (cada fila una unidad).
// pagos: filas de pagos_revendedor y pagos_sena, aplicadas o no, con el campo cuenta
//        ('revendedor' o 'sena').
// cuentaDeVenta(v): 'revendedor', 'sena' o null si fue una venta directa del local.
// claveNombre(nombre): nombre normalizado para juntar a la misma persona.
// gananciaDe(v): ganancia real de la unidad, en USD.
// cotizacionDe(v): cotizacion de venta del dia de la venta.
// margenPendiente(cuenta, clave): margen para estimar la ganancia de lo entregado sin usar.
//
// Devuelve las ventas con cobrado_usd, cobrado_ars, ganancia_usd (lo que cuenta ese dia),
// cubierto_usd y cubierto_ars (lo pagado con entregas anteriores) y ganancia_total_usd; y un
// movimiento 'cobro' por cada pago real, con cobrado_usd, cobrado_ars, ganancia_usd,
// aplicado_usd (la parte ya usada en equipos vendidos) y pendiente_usd.
export function contabilizar({ ventas, pagos, cuentaDeVenta, claveNombre, gananciaDe, cotizacionDe, margenPendiente }) {
  const movimientos = [];
  const porCuenta = new Map();
  const eventosDe = (cuenta, nombre) => {
    const k = cuenta + '|' + claveNombre(nombre);
    if (!porCuenta.has(k)) porCuenta.set(k, { cuenta, clave: claveNombre(nombre), eventos: [] });
    return porCuenta.get(k).eventos;
  };

  ventas.forEach((v) => {
    const valor = (Number(v.precio_usd) || 0) - (Number(v.permuta_usd) || 0);
    const ganancia = gananciaDe(v);
    const mov = {
      ...v,
      cobrado_usd: valor,
      cubierto_usd: 0,
      cubierto_ars: 0,
      ganancia_total_usd: ganancia,
      ganancia_usd: ganancia,
    };
    movimientos.push(mov);
    const cuenta = cuentaDeVenta(v);
    if (cuenta) eventosDe(cuenta, v.revendedor).push({ tipo: 'venta', t: tiempo(v.fecha_venta), mov, valor, falta: valor });
  });

  pagos.forEach((p) => {
    const usd = Number(p.monto_usd) || 0;
    // Las filas negativas solo anotan que parte de lo entregado se uso: aca se recalcula
    if (usd <= 0) return;
    eventosDe(p.cuenta, p.revendedor).push({ tipo: 'pago', t: tiempo(p.fecha), pago: p, usd, ars: Number(p.monto_ars) || 0 });
  });

  // Usa una parte de un pago para pagar una venta: la plata y la ganancia pasan al pago
  const aplicar = (cobro, usd, venta) => {
    const proporcion = venta.valor > 0 ? venta.mov.ganancia_total_usd / venta.valor : 0;
    cobro.aplicado_usd += usd;
    cobro.ganancia_usd += usd * proporcion;
    venta.mov.cubierto_usd += usd;
    venta.mov.cubierto_ars += cobro.cobrado_usd > 0 ? usd * (cobro.cobrado_ars / cobro.cobrado_usd) : 0;
    venta.mov.cobrado_usd -= usd;
    venta.mov.ganancia_usd -= usd * proporcion;
    venta.falta -= usd;
  };

  porCuenta.forEach(({ cuenta, clave, eventos }) => {
    eventos.sort((a, b) => a.t - b.t);
    // Operaciones: movimientos seguidos con menos de VENTANA_OPERACION_MS entre uno y otro
    const operaciones = [];
    eventos.forEach((e) => {
      const ultima = operaciones[operaciones.length - 1];
      if (ultima && e.t - ultima[ultima.length - 1].t <= VENTANA_OPERACION_MS) ultima.push(e);
      else operaciones.push([e]);
    });

    const credito = []; // partes de pagos todavia sin usar: { cobro, usd }
    const disponible = () => credito.reduce((acc, c) => acc + c.usd, 0);

    operaciones.forEach((operacion) => {
      const pagosOp = operacion.filter((e) => e.tipo === 'pago');
      const ventasOp = operacion.filter((e) => e.tipo === 'venta');

      // La version anterior, al cerrar una cuenta con plata de mas, daba por usados todos los
      // pagos y anotaba lo que sobraba como un pago nuevo. Ese pago no es plata nueva: es lo
      // mismo que ya se habia entregado, y se reconoce porque es exactamente lo que sobra.
      let reescrito = null;
      if (ventasOp.length > 0) {
        const totalPagos = pagosOp.reduce((acc, e) => acc + e.usd, 0);
        const totalVentas = ventasOp.reduce((acc, e) => acc + e.valor, 0);
        reescrito =
          pagosOp.find((e) => {
            const sobra = disponible() + totalPagos - e.usd - totalVentas;
            return sobra >= CENTAVO && Math.abs(sobra - e.usd) < 0.01;
          }) || null;
      }

      pagosOp.forEach((e) => {
        if (e === reescrito) return;
        const cobro = {
          id: 'pago-' + cuenta + '-' + e.pago.id,
          categoria: 'cobro',
          cuenta,
          pago: e.pago,
          revendedor: String(e.pago.revendedor || '').trim(),
          fecha_venta: e.pago.fecha,
          cotizacion_venta: e.ars / e.usd,
          cobrado_usd: e.usd,
          cobrado_ars: e.ars,
          aplicado_usd: 0,
          pendiente_usd: 0,
          ganancia_usd: 0,
          estimada: false,
        };
        movimientos.push(cobro);
        credito.push({ cobro, usd: e.usd });
      });

      ventasOp.forEach((venta) => {
        while (venta.falta >= CENTAVO && credito.length > 0) {
          const parte = credito[0];
          const usa = Math.min(parte.usd, venta.falta);
          aplicar(parte.cobro, usa, venta);
          parte.usd -= usa;
          if (parte.usd < CENTAVO) credito.shift();
        }
      });
    });

    // Lo entregado que todavia no pago ningun equipo: ganancia estimada
    const margen = credito.length > 0 ? margenPendiente(cuenta, clave) || 0 : 0;
    credito.forEach(({ cobro, usd }) => {
      cobro.pendiente_usd += usd;
      cobro.ganancia_usd += usd * margen;
      cobro.estimada = true;
    });
  });

  movimientos.forEach((m) => {
    if (m.categoria !== 'cobro') m.cobrado_ars = m.cobrado_usd * cotizacionDe(m);
  });
  return movimientos;
}
