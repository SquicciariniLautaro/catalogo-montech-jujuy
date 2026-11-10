// Pruebas del aviso de la mensualidad: npm run probar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelServicio, hoyArgentina, instalarSoloLectura, ponerSoloLectura, MENSAJE_SOLO_LECTURA } from '../src/servicio.js';

const fila = { vence: '2026-11-13', monto: 50000, recargo_diario: 10000, dias_aviso: 5, dias_gracia: 7 };

test('sin vencimiento cargado el panel funciona normal', () => {
  assert.equal(estadoDelServicio(null, '2026-11-10').etapa, 'al_dia');
  assert.equal(estadoDelServicio(undefined, '2030-01-01').soloLectura, false);
});

test('el aviso aparece 5 dias antes y sigue hasta el mismo dia del vencimiento', () => {
  assert.equal(estadoDelServicio(fila, '2026-11-07').etapa, 'al_dia');
  assert.equal(estadoDelServicio(fila, '2026-11-08').etapa, 'aviso');
  const hoy10 = estadoDelServicio(fila, '2026-11-10');
  assert.equal(hoy10.etapa, 'aviso');
  assert.equal(hoy10.faltan, 3);
  assert.equal(hoy10.recargo, 0);
  assert.equal(estadoDelServicio(fila, '2026-11-13').etapa, 'aviso');
});

test('desde el 14 corre el recargo de 10 mil por dia', () => {
  const e = estadoDelServicio(fila, '2026-11-14');
  assert.equal(e.etapa, 'vencido');
  assert.equal(e.atraso, 1);
  assert.equal(e.recargo, 10000);
  assert.equal(e.total, 60000);
  assert.equal(e.bloqueo, '2026-11-21');
  assert.equal(estadoDelServicio(fila, '2026-11-20').recargo, 70000);
});

test('pasados los 7 dias de gracia queda en solo lectura y el recargo sigue', () => {
  assert.equal(estadoDelServicio(fila, '2026-11-20').soloLectura, false);
  const e = estadoDelServicio(fila, '2026-11-21');
  assert.equal(e.etapa, 'solo_lectura');
  assert.equal(e.soloLectura, true);
  assert.equal(e.recargo, 80000);
});

test('el cambio de mes no rompe la cuenta de dias', () => {
  const diciembre = { ...fila, vence: '2026-12-13' };
  assert.equal(estadoDelServicio(diciembre, '2026-11-30').etapa, 'al_dia');
  assert.equal(estadoDelServicio({ ...fila, vence: '2026-12-30' }, '2027-01-02').recargo, 30000);
});

test('sin monto cargado muestra solo el recargo', () => {
  const e = estadoDelServicio({ ...fila, monto: null }, '2026-11-15');
  assert.equal(e.monto, null);
  assert.equal(e.total, null);
  assert.equal(e.recargo, 20000);
});

test('el dia cambia a la medianoche de Argentina, no a la de Londres', () => {
  assert.equal(hoyArgentina(new Date('2026-11-14T02:59:00Z')), '2026-11-13');
  assert.equal(hoyArgentina(new Date('2026-11-14T03:00:00Z')), '2026-11-14');
});

test('en solo lectura las altas, cambios y bajas devuelven el motivo y las lecturas siguen', async () => {
  const llamadas = [];
  const consulta = {
    select: () => (llamadas.push('select'), Promise.resolve({ data: [1], error: null })),
    update: () => (llamadas.push('update'), { in: () => Promise.resolve({ data: null, error: null }) }),
  };
  const cliente = { from: () => consulta };
  instalarSoloLectura(cliente);

  ponerSoloLectura(true);
  const cambio = await cliente.from('celulares').update({ precio_usd: 1 }).in('id', [1]);
  assert.equal(cambio.error.message, MENSAJE_SOLO_LECTURA);
  const borrado = await cliente.from('celulares').delete().eq('id', 1).select();
  assert.equal(borrado.error.message, MENSAJE_SOLO_LECTURA);
  const lectura = await cliente.from('celulares').select('*');
  assert.deepEqual(lectura.data, [1]);
  assert.deepEqual(llamadas, ['select']);

  ponerSoloLectura(false);
  await cliente.from('celulares').update({}).in('id', [1]);
  assert.deepEqual(llamadas, ['select', 'update']);
});
