// Pruebas de las cuentas de Ventas: npm run probar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contabilizar, calcularMargenes } from '../src/contabilidad.js';

const COT = 1500;
const usd = (ars) => ars / COT;

// Ganancia simple: precio menos costo, todo a la misma cotizacion
const contar = (ventas, pagos, margen = 0.2) =>
  contabilizar({
    ventas,
    pagos,
    cuentaDeVenta: (v) => v.cuenta_venta || null,
    claveNombre: (n) => String(n || '').trim().toUpperCase(),
    gananciaDe: (v) => (Number(v.precio_usd) || 0) - (Number(v.costo_usd) || 0),
    cotizacionDe: (v) => Number(v.cotizacion_venta) || COT,
    margenPendiente: () => margen,
  });

const pago = (id, ars, fecha, extra = {}) => ({
  id, cuenta: 'revendedor', revendedor: 'Federico', monto_ars: ars, monto_usd: usd(ars), cotizacion: COT, fecha, aplicado: false, ...extra,
});
const venta = (id, ars, costoArs, fecha, extra = {}) => ({
  id, categoria: 'celular', modelo: '13 PRO', precio_usd: usd(ars), costo_usd: usd(costoArs), cotizacion_venta: COT, fecha_venta: fecha, ...extra,
});
const deCuenta = { cuenta_venta: 'revendedor', revendedor: 'Federico' };

const totalArs = (movs, desde = '', hasta = '9999') =>
  movs.filter((m) => m.fecha_venta >= desde && m.fecha_venta < hasta).reduce((acc, m) => acc + m.cobrado_ars, 0);
const gananciaUsd = (movs) => movs.reduce((acc, m) => acc + m.ganancia_usd, 0);
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, msg + ': ' + a + ' contra ' + b);

test('venta directa: entra el precio el dia de la venta', () => {
  const movs = contar([venta(1, 500000, 400000, '2026-10-01T12:00:00Z')], []);
  cerca(totalArs(movs), 500000, 'cobrado');
  cerca(gananciaUsd(movs), usd(100000), 'ganancia');
});

test('permuta: solo entra la diferencia en plata', () => {
  const movs = contar([venta(1, 800000, 600000, '2026-10-01T12:00:00Z', { permuta_usd: usd(500000) })], []);
  cerca(totalArs(movs), 300000, 'cobrado');
  cerca(gananciaUsd(movs), usd(200000), 'la ganancia es la del equipo entregado');
});

// Audio del cliente: le habian entregado 300 mil de un equipo de 760 mil; hoy cobra 460 mil y
// el total tiene que subir 460 mil, no 760 mil.
test('cuenta que se cierra: la plata entregada antes no se vuelve a sumar', () => {
  const pagos = [
    pago(1, 300000, '2026-10-05T12:00:00Z', { aplicado: true }),
    pago(2, 460000, '2026-10-21T22:00:00Z', { aplicado: true }),
  ];
  const ventas = [venta(10, 760000, 600000, '2026-10-21T22:00:01Z', deCuenta)];
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs), 760000, 'en total entraron 760 mil');
  cerca(totalArs(movs, '2026-10-21'), 460000, 'el dia del cierre entran 460 mil');
  cerca(totalArs(movs, '2026-10-05', '2026-10-06'), 300000, 'los 300 mil siguen en su dia');
  cerca(gananciaUsd(movs), usd(160000), 'la ganancia del equipo se cuenta una sola vez');
  const vendida = movs.find((m) => m.id === 10);
  cerca(vendida.cobrado_ars, 0, 'el equipo no suma plata nueva: ya estaba pagado');
  cerca(vendida.cubierto_ars, 760000, 'figura como pagado con lo entregado');
});

test('la plata entregada en otro mes se queda en su mes', () => {
  const pagos = [pago(1, 500000, '2026-09-20T12:00:00Z', { aplicado: true }), pago(2, 1000000, '2026-10-10T12:00:00Z', { aplicado: true })];
  const ventas = [1, 2, 3].map((i) => venta(i, 500000, 400000, '2026-10-10T12:00:02Z', deCuenta));
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs, '2026-09', '2026-10'), 500000, 'septiembre');
  cerca(totalArs(movs, '2026-10', '2026-11'), 1000000, 'octubre');
});

test('"Pagado" con parte entregada: entra solo lo que falta', () => {
  // Entrego 300 mil; despues marca pagado un equipo de 500 mil y le cobra 200 mil en el momento
  const pagos = [
    pago(1, 300000, '2026-10-01T12:00:00Z'),
    pago(2, -300000, '2026-10-15T12:00:01Z'), // fila negativa: lo usado en ese equipo
  ];
  const ventas = [venta(10, 500000, 350000, '2026-10-15T12:00:00Z', deCuenta)];
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs), 500000, 'total');
  cerca(totalArs(movs, '2026-10-15'), 200000, 'el dia del pagado entra lo que faltaba');
  cerca(gananciaUsd(movs), usd(150000), 'ganancia real del equipo');
});

test('pago sin usar: cuenta como cobro con ganancia estimada', () => {
  const movs = contar([], [pago(1, 300000, '2026-10-01T12:00:00Z')], 0.25);
  cerca(totalArs(movs), 300000, 'cobrado');
  cerca(gananciaUsd(movs), usd(75000), 'ganancia estimada');
  assert.equal(movs[0].estimada, true);
});

test('saldo a favor que la version anterior volvia a anotar como pago: no se cuenta dos veces', () => {
  // Debia 500 mil, entrego 600 mil. Al cerrar, la version anterior daba los pagos por usados y
  // anotaba 100 mil como un pago nuevo. Despues se llevo otro equipo de 500 mil y pago 400 mil.
  const pagos = [
    pago(1, 600000, '2026-10-15T12:00:00Z', { aplicado: true }),
    pago(2, 100000, '2026-10-15T12:00:02Z', { aplicado: true }), // lo que sobro, reescrito
    pago(3, 400000, '2026-10-20T12:00:00Z', { aplicado: true }),
  ];
  const ventas = [
    venta(10, 500000, 400000, '2026-10-15T12:00:01Z', deCuenta),
    venta(11, 500000, 400000, '2026-10-20T12:00:01Z', deCuenta),
  ];
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs), 1000000, 'entraron 600 mil + 400 mil');
  assert.equal(movs.filter((m) => m.categoria === 'cobro').length, 2, 'el pago reescrito no aparece');
  cerca(movs.find((m) => m.id === 'pago-revendedor-1').sin_equipo_usd, 0, 'lo que sobro ya esta a su favor: no hay que revisarlo');
  cerca(gananciaUsd(movs), usd(200000), 'ganancia de los dos equipos');
});

test('saldo a favor con la version nueva: queda como credito y se usa en el proximo equipo', () => {
  const pagos = [
    pago(1, 600000, '2026-10-15T12:00:00Z'),
    pago(2, -500000, '2026-10-15T12:00:02Z'),
    pago(3, 400000, '2026-10-20T12:00:00Z'),
  ];
  const ventas = [
    venta(10, 500000, 400000, '2026-10-15T12:00:01Z', deCuenta),
    venta(11, 500000, 400000, '2026-10-20T12:00:01Z', deCuenta),
  ];
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs), 1000000, 'total');
  cerca(movs.find((m) => m.id === 11).cobrado_ars, 0, 'el segundo equipo se pago con el saldo a favor y el pago nuevo');
});

test('pago anotado por la base unos segundos despues de la venta: se toma igual como parte de la operacion', () => {
  const pagos = [pago(1, 300000, '2026-10-01T12:00:00Z'), pago(2, 200000, '2026-10-15T12:00:05Z')];
  const ventas = [venta(10, 500000, 400000, '2026-10-15T12:00:00Z', deCuenta)];
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs), 500000, 'total');
});

test('seña y revendedor con el mismo nombre no se mezclan', () => {
  const pagos = [pago(1, 300000, '2026-10-01T12:00:00Z', { cuenta: 'sena' })];
  const ventas = [venta(10, 500000, 400000, '2026-10-02T12:00:00Z', deCuenta)];
  const movs = contar(ventas, pagos);
  cerca(totalArs(movs), 800000, 'la seña no paga el equipo del revendedor');
});

test('pago dado por usado sin ningun equipo vendido: cuenta como plata y queda marcado para revisar', () => {
  // Pago cargado de mas por error en una cuenta que despues se cerro (aplicado), o cuyo equipo se anulo
  const pagos = [pago(1, 2000000, '2026-10-03T12:00:00Z', { aplicado: true }), pago(2, 300000, '2026-10-04T12:00:00Z')];
  const ventas = [venta(10, 500000, 400000, '2026-10-03T12:00:01Z', deCuenta)];
  const movs = contar(ventas, pagos);
  const malo = movs.find((m) => m.id === 'pago-revendedor-1');
  cerca(malo.sin_equipo_usd, usd(1500000), 'lo que sobra del pago');
  assert.equal(malo.estimada, false, 'sin ganancia estimada: la cuenta ya se cerro');
  cerca(movs.find((m) => m.id === 'pago-revendedor-2').sin_equipo_usd, 0, 'un pago sin usar de una cuenta abierta no se marca');
  assert.equal(movs.find((m) => m.id === 10).cuenta_origen, 'revendedor');
});

test('saldo a favor reescrito que todavia no se uso: no se marca para revisar', () => {
  const pagos = [
    pago(1, 600000, '2026-10-15T12:00:00Z', { aplicado: true }),
    pago(2, 100000, '2026-10-15T12:00:02Z'), // lo que sobro, reescrito por la version anterior
  ];
  const movs = contar([venta(10, 500000, 400000, '2026-10-15T12:00:01Z', deCuenta)], pagos);
  cerca(totalArs(movs), 600000, 'entraron 600 mil');
  cerca(movs.find((m) => m.id === 'pago-revendedor-1').sin_equipo_usd, 0, 'no hay nada que revisar');
});

test('pago corregido con "dejar a su favor": la plata que entro no cambia', () => {
  // El pago de 1.500.000 se partio en 500 mil (pago el equipo) y 1.000.000 a su favor, del mismo dia
  const pagos = [
    pago(1, 500000, '2026-10-08T12:00:00Z', { aplicado: true }),
    pago(2, 1000000, '2026-10-08T12:00:00Z'),
  ];
  const movs = contar([venta(10, 500000, 400000, '2026-10-08T12:00:01Z', deCuenta)], pagos);
  cerca(totalArs(movs), 1500000, 'siguen contando los 1.500.000');
  cerca(movs.find((m) => m.id === 10).cobrado_ars, 0, 'el equipo se pago con el pago de 500 mil');
});

// Audio del 26/10: el precio que se le pone al revendedor tiene que quedar fijo en pesos aunque
// cambie el dolar. Equipo de 500 mil entregado con el dolar a 1500; paga con el dolar a 1600.
const pagoA = (id, ars, cot, fecha, extra = {}) => pago(id, ars, fecha, { monto_usd: ars / cot, cotizacion: cot, ...extra });
const ventaFija = (id, ars, costoArs, cot, fecha) =>
  venta(id, ars, costoArs, fecha, { ...deCuenta, precio_usd: ars / cot, cotizacion_venta: cot, precio_revendedor_ars: ars });

test('precio fijo en pesos: pagando los pesos acordados el equipo queda pagado aunque cambie el dolar', () => {
  const pagos = [pagoA(1, 200000, 1500, '2026-10-05T12:00:00Z', { aplicado: true }), pagoA(2, 300000, 1600, '2026-10-20T12:00:00Z', { aplicado: true })];
  const movs = contar([ventaFija(10, 500000, 400000, 1600, '2026-10-20T12:00:01Z')], pagos);
  cerca(totalArs(movs), 500000, 'entraron exactamente los 500 mil');
  cerca(movs.find((m) => m.id === 10).cobrado_ars, 0, 'el equipo no suma plata nueva');
  cerca(movs.find((m) => m.id === 'pago-revendedor-2').sin_equipo_usd, 0, 'no queda nada para revisar');
  cerca(gananciaUsd(movs), 500000 / 1600 - usd(400000), 'la ganancia del equipo se cuenta una sola vez');
});

test('precio fijo en pesos marcado "Pagado" con parte entregada: entra en pesos solo lo que faltaba', () => {
  const pagos = [pagoA(1, 200000, 1500, '2026-10-05T12:00:00Z', { aplicado: true })];
  const movs = contar([ventaFija(10, 500000, 400000, 1600, '2026-10-20T12:00:00Z')], pagos);
  cerca(totalArs(movs, '2026-10-20'), 300000, 'el dia del pago entran 300 mil');
  cerca(totalArs(movs), 500000, 'en total 500 mil');
});

test('precio fijo en pesos con plata de mas: lo que sobra queda sin usar', () => {
  const pagos = [pagoA(1, 600000, 1600, '2026-10-20T12:00:00Z')];
  const movs = contar([ventaFija(10, 500000, 400000, 1500, '2026-10-20T12:00:01Z')], pagos);
  const cobro = movs.find((m) => m.id === 'pago-revendedor-1');
  cerca(cobro.pendiente_usd, 100000 / 1600, 'quedan 100 mil (en dolares de ese pago) a su favor');
  cerca(totalArs(movs), 600000, 'entraron 600 mil');
});

// Audio del 27/10: ver el porcentaje de ganancia promedio de lo que se vende
const vendido = (precio, ganancia, extra = {}) => ({ categoria: 'celular', precio_usd: precio, ganancia_total_usd: ganancia, ...extra });

test('margen promedio: ganancia total sobre venta total, y el promedio simple de cada venta', () => {
  // Una vende 100 y gana 8 (8%), otra 100 y gana 10 (10%), otra 200 y gana 30 (15%)
  const m = calcularMargenes([vendido(100, 8), vendido(100, 10), vendido(200, 30)]);
  cerca(m.promedio, 48 / 400, 'de cada peso vendido, 12 centavos son ganancia');
  cerca(m.simple, (0.08 + 0.1 + 0.15) / 3, 'el promedio de los tres porcentajes');
  assert.equal(m.unidades, 3);
});

test('margen promedio: los cobros a cuenta y las ventas sin precio no entran', () => {
  const m = calcularMargenes([vendido(100, 10), { categoria: 'cobro', cobrado_usd: 500, ganancia_usd: 50 }, vendido(0, 0)]);
  cerca(m.promedio, 0.1, 'solo la venta con precio');
  assert.equal(m.unidades, 1);
  assert.equal(calcularMargenes([]).promedio, null, 'sin ventas no hay promedio');
});

test('margen promedio: por grupo, y una venta con perdida baja el promedio', () => {
  const m = calcularMargenes(
    [vendido(100, 20, { modelo: '13' }), vendido(100, -10, { modelo: '14' }), vendido(300, 30, { modelo: '13' })],
    (v) => v.modelo
  );
  cerca(m.promedio, 40 / 500, 'la perdida resta');
  const trece = m.grupos.find((g) => g.nombre === '13');
  cerca(trece.margen, 50 / 400, 'margen del 13');
  cerca(m.grupos.find((g) => g.nombre === '14').margen, -0.1, 'el 14 dio perdida');
});

test('margen promedio: no cambia la plata ni la ganancia de Ventas', () => {
  const pagos = [pago(1, 300000, '2026-10-05T12:00:00Z', { aplicado: true }), pago(2, 460000, '2026-10-21T22:00:00Z', { aplicado: true })];
  const ventas = [venta(10, 760000, 600000, '2026-10-21T22:00:01Z', deCuenta)];
  const movs = contar(ventas, pagos);
  const antes = JSON.stringify(movs);
  const m = calcularMargenes(movs);
  assert.equal(JSON.stringify(movs), antes, 'los movimientos quedan iguales');
  cerca(m.promedio, 160000 / 760000, 'el equipo cuenta entero aunque se haya pagado en partes');
  assert.equal(m.unidades, 1, 'los pagos a cuenta no son ventas');
});
