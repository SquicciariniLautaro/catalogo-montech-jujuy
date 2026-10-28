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
//
// Los equipos entregados con precio fijo en pesos (precio_revendedor_ars) se pagan con los pesos
// que entrego la persona, sin importar el dolar de cada dia: un equipo de 500 mil queda pagado con
// 500 mil. Los anteriores, que se acordaban en dolares, se siguen cubriendo con los dolares de
// cada pago, para que el historial no cambie.

// Movimientos de una misma cuenta separados por menos de esto son una sola operacion (un pago que
// cierra la cuenta y la venta de sus equipos). Dentro de una operacion la plata se toma antes que
// los equipos, aunque los relojes del celular y de la base difieran en unos segundos.
const VENTANA_OPERACION_MS = 2 * 60 * 1000;
const CENTAVO = 0.005;
const MEDIO_PESO = 0.5;

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
// cubierto_usd y cubierto_ars (lo pagado con entregas anteriores), ganancia_total_usd y
// cuenta_origen (la cuenta de la que salio, o null); y un movimiento 'cobro' por cada pago real,
// con cobrado_usd, cobrado_ars, ganancia_usd, aplicado_usd (la parte ya usada en equipos
// vendidos), pendiente_usd y sin_equipo_usd: la parte que la base da por usada pero que no pago
// ningun equipo vendido. Esa plata cuenta como entrada y conviene revisarla: puede ser un pago
// cargado de mas o un equipo que despues se anulo.
export function contabilizar({ ventas, pagos, cuentaDeVenta, claveNombre, gananciaDe, cotizacionDe, margenPendiente }) {
  const movimientos = [];
  const porCuenta = new Map();
  const eventosDe = (cuenta, nombre) => {
    const k = cuenta + '|' + claveNombre(nombre);
    if (!porCuenta.has(k)) porCuenta.set(k, { cuenta, clave: claveNombre(nombre), eventos: [] });
    return porCuenta.get(k).eventos;
  };

  const ventasEnPesos = [];
  ventas.forEach((v) => {
    const valorUsd = (Number(v.precio_usd) || 0) - (Number(v.permuta_usd) || 0);
    const ganancia = gananciaDe(v);
    const mov = {
      ...v,
      cobrado_usd: valorUsd,
      cubierto_usd: 0,
      cubierto_ars: 0,
      ganancia_total_usd: ganancia,
      ganancia_usd: ganancia,
      cuenta_origen: cuentaDeVenta(v),
    };
    movimientos.push(mov);
    const cuenta = mov.cuenta_origen;
    if (!cuenta) return;
    // Equipo de una cuenta con precio fijo en pesos: lo que falta se lleva en pesos
    const precioArs = v.precio_revendedor_ars === null || v.precio_revendedor_ars === undefined ? NaN : Number(v.precio_revendedor_ars);
    const enPesos = Number.isFinite(precioArs);
    const valor = enPesos ? precioArs : valorUsd;
    const evento = { tipo: 'venta', t: tiempo(v.fecha_venta), mov, enPesos, valor, falta: valor };
    if (enPesos) ventasEnPesos.push(evento);
    eventosDe(cuenta, v.revendedor).push(evento);
  });
  const tolerancia = (venta) => (venta.enPesos ? MEDIO_PESO : CENTAVO);

  pagos.forEach((p) => {
    const usd = Number(p.monto_usd) || 0;
    // Las filas negativas solo anotan que parte de lo entregado se uso: aca se recalcula
    if (usd <= 0) return;
    eventosDe(p.cuenta, p.revendedor).push({ tipo: 'pago', t: tiempo(p.fecha), pago: p, usd, ars: Number(p.monto_ars) || 0 });
  });

  // Usa una parte de un pago para pagar una venta: la plata y la ganancia pasan al pago. usa es lo
  // que cubre, en la moneda de la venta; usd y ars, lo que sale del pago.
  const aplicar = (cobro, usa, usd, ars, venta) => {
    const ganancia = venta.valor > 0 ? usa * (venta.mov.ganancia_total_usd / venta.valor) : 0;
    cobro.aplicado_usd += usd;
    cobro.ganancia_usd += ganancia;
    venta.mov.cubierto_usd += usd;
    venta.mov.cubierto_ars += ars;
    if (!venta.enPesos) venta.mov.cobrado_usd -= usd;
    venta.mov.ganancia_usd -= ganancia;
    venta.falta -= usa;
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

    const credito = []; // partes de pagos todavia sin usar: { cobro, usd, ars }
    const disponible = () => credito.reduce((acc, c) => acc + c.usd, 0);

    operaciones.forEach((operacion) => {
      const pagosOp = operacion.filter((e) => e.tipo === 'pago');
      const ventasOp = operacion.filter((e) => e.tipo === 'venta');

      // La version anterior, al cerrar una cuenta con plata de mas, daba por usados todos los
      // pagos y anotaba lo que sobraba como un pago nuevo. Ese pago no es plata nueva: es lo
      // mismo que ya se habia entregado, y se reconoce porque se anoto despues de la venta de los
      // equipos (los pagos reales se anotan antes) y es exactamente lo que sobra.
      let reescrito = null;
      if (ventasOp.length > 0 && !ventasOp.some((e) => e.enPesos)) {
        const totalPagos = pagosOp.reduce((acc, e) => acc + e.usd, 0);
        const totalVentas = ventasOp.reduce((acc, e) => acc + e.valor, 0);
        const ultimaVenta = Math.max(...ventasOp.map((e) => e.t));
        reescrito =
          pagosOp.find((e) => {
            const sobra = disponible() + totalPagos - e.usd - totalVentas;
            return e.t > ultimaVenta && sobra >= CENTAVO && Math.abs(sobra - e.usd) < 0.01;
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
          sin_equipo_usd: 0,
          ganancia_usd: 0,
          estimada: false,
        };
        movimientos.push(cobro);
        credito.push({ cobro, usd: e.usd, ars: e.ars });
      });

      ventasOp.forEach((venta) => {
        while (venta.falta >= tolerancia(venta) && credito.length > 0) {
          const parte = credito[0];
          const hay = venta.enPesos ? parte.ars : parte.usd;
          if (!(hay > 0)) {
            credito.shift();
            continue;
          }
          const usa = Math.min(hay, venta.falta);
          // El pago se usa en proporcion: sus pesos y sus dolares bajan juntos
          const fraccion = usa / hay;
          const usd = parte.usd * fraccion;
          const ars = parte.ars * fraccion;
          aplicar(parte.cobro, usa, usd, ars, venta);
          parte.usd -= usd;
          parte.ars -= ars;
          if (fraccion >= 1 - 1e-9 || (parte.usd < CENTAVO && parte.ars < MEDIO_PESO)) credito.shift();
        }
      });

      // Lo que sobro en esa operacion es el saldo a favor que la version anterior reescribio: esa
      // plata sigue viva en el pago reescrito, asi que no hay nada que revisar
      if (reescrito) credito.forEach((parte) => (parte.aFavor = true));
    });

    // Lo entregado que todavia no pago ningun equipo: ganancia estimada. Si la base ya lo da por
    // usado (la cuenta se cerro), no hay equipo que lo explique: queda marcado para revisar.
    const margen = credito.length > 0 ? margenPendiente(cuenta, clave) || 0 : 0;
    credito.forEach(({ cobro, usd, aFavor }) => {
      cobro.pendiente_usd += usd;
      if (aFavor) return;
      if (cobro.pago.aplicado) cobro.sin_equipo_usd += usd;
      else {
        cobro.ganancia_usd += usd * margen;
        cobro.estimada = true;
      }
    });
  });

  const enPesos = new Map(ventasEnPesos.map((e) => [e.mov, e]));
  movimientos.forEach((m) => {
    if (m.categoria === 'cobro') return;
    const venta = enPesos.get(m);
    if (venta) {
      // Entra en pesos lo que faltaba del precio fijo; los dolares, a la cotizacion de la venta
      m.cobrado_ars = venta.falta >= MEDIO_PESO ? venta.falta : 0;
      m.cobrado_usd = cotizacionDe(m) ? m.cobrado_ars / cotizacionDe(m) : 0;
    } else m.cobrado_ars = m.cobrado_usd * cotizacionDe(m);
  });
  return movimientos;
}

// Margen de ganancia de lo vendido: que parte de cada venta es ganancia. Solo lee las ventas, no
// mueve plata ni ganancia. Cada equipo cuenta entero el dia en que se vendio (su precio y la
// ganancia del equipo), aunque se haya pagado en partes. Los cobros a cuenta no son ventas y no
// entran; tampoco las ventas sin precio.
//
// ventas: movimientos de contabilizar (usa precio_usd, ganancia_total_usd y categoria).
// grupoDe(v): nombre del grupo de la venta (modelo, mes...), o null para no agruparla.
//
// Devuelve promedio (ganancia total / venta total: de cada peso vendido, cuanto es ganancia),
// simple (el promedio de los porcentajes de cada venta, todas pesan igual), unidades, ventaUsd,
// gananciaUsd y grupos [{ nombre, unidades, ventaUsd, gananciaUsd, margen }] en el orden en que
// aparecen. promedio y simple son null si no hay ventas.
export function calcularMargenes(ventas, grupoDe = () => null) {
  const vendidas = ventas.filter((v) => v.categoria !== 'cobro' && Number(v.precio_usd) > 0);
  const grupos = new Map();
  let ventaUsd = 0;
  let gananciaUsd = 0;
  let sumaMargenes = 0;
  vendidas.forEach((v) => {
    const precio = Number(v.precio_usd);
    const ganancia = Number(v.ganancia_total_usd) || 0;
    ventaUsd += precio;
    gananciaUsd += ganancia;
    sumaMargenes += ganancia / precio;
    const nombre = grupoDe(v);
    if (nombre === null || nombre === undefined) return;
    if (!grupos.has(nombre)) grupos.set(nombre, { nombre, unidades: 0, ventaUsd: 0, gananciaUsd: 0 });
    const g = grupos.get(nombre);
    g.unidades += 1;
    g.ventaUsd += precio;
    g.gananciaUsd += ganancia;
  });
  return {
    promedio: ventaUsd > 0 ? gananciaUsd / ventaUsd : null,
    simple: vendidas.length > 0 ? sumaMargenes / vendidas.length : null,
    unidades: vendidas.length,
    ventaUsd,
    gananciaUsd,
    grupos: [...grupos.values()].map((g) => ({ ...g, margen: g.gananciaUsd / g.ventaUsd })),
  };
}
