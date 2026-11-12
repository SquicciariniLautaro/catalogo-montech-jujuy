// Pruebas del dolar de compra de la mercaderia: npm run probar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dolarDeCompra, dolarDeUnidad, costoEnPesos, comprasDeUnidades, cambiosDeCompra } from '../src/compras.js';

test('si no se escribe el dolar, se usa el Costo $ de hoy', () => {
  assert.equal(dolarDeCompra('', 1580), 1580);
  assert.equal(dolarDeCompra(undefined, 1580), 1580);
  assert.equal(dolarDeCompra('0', 1580), 1580);
  assert.equal(dolarDeCompra('1650', 1580), 1650);
});

test('cada unidad se pasa a pesos con su dolar, o con el de hoy si no tiene', () => {
  assert.equal(dolarDeUnidad({ cotizacion_costo: 1600 }, 1500), 1600);
  assert.equal(dolarDeUnidad({ cotizacion_costo: null }, 1500), 1500);
});

test('6 equipos comprados a 1600 y 3 a 1650 no se mezclan: el costo en pesos es exacto', () => {
  const unidades = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: i + 1, costo_usd: 400, cotizacion_costo: 1600 })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: i + 7, costo_usd: 420, cotizacion_costo: 1650 })),
  ];
  assert.equal(costoEnPesos(unidades, 1500), 6 * 400 * 1600 + 3 * 420 * 1650);
  // Si cambia el Costo $ de arriba, el costo de esas compras no se mueve
  assert.equal(costoEnPesos(unidades, 1400), costoEnPesos(unidades, 1500));
});

test('las unidades viejas sin dolar siguen al Costo $ de hoy', () => {
  const unidades = [{ id: 1, costo_usd: 100, cotizacion_costo: null }, { id: 2, costo_usd: 100, cotizacion_costo: 1600 }];
  assert.equal(costoEnPesos(unidades, 1500), 100 * 1500 + 100 * 1600);
});

test('las compras se separan por costo y por dolar, en el orden en que se cargaron', () => {
  const compras = comprasDeUnidades([
    { id: 1, costo_usd: 400, cotizacion_costo: null },
    { id: 2, costo_usd: 400, cotizacion_costo: 1600 },
    { id: 3, costo_usd: 400, cotizacion_costo: 1600 },
    { id: 4, costo_usd: 420, cotizacion_costo: 1600 },
    { id: 5, costo_usd: 400, cotizacion_costo: null },
  ]);
  assert.deepEqual(
    compras.map((c) => [c.costo_usd, c.dolar, c.ids]),
    [[400, null, [1, 5]], [400, 1600, [2, 3]], [420, 1600, [4]]]
  );
});

test('editar una compra guarda solo lo que cambio', () => {
  const compra = { costo_usd: 400, dolar: 1600 };
  assert.equal(cambiosDeCompra(compra, { costo_usd: '400', dolar: '1600' }), null);
  assert.equal(cambiosDeCompra(compra, { costo_usd: '', dolar: '' }), null);
  assert.deepEqual(cambiosDeCompra(compra, { costo_usd: '400', dolar: '1650' }), { cambios: { cotizacion_costo: 1650 } });
  assert.deepEqual(cambiosDeCompra(compra, { costo_usd: '410', dolar: '1600' }), { cambios: { costo_usd: 410 } });
  assert.deepEqual(cambiosDeCompra({ costo_usd: 400, dolar: null }, { costo_usd: '400', dolar: '1580' }), { cambios: { cotizacion_costo: 1580 } });
  assert.ok(cambiosDeCompra(compra, { costo_usd: '400', dolar: '-3' }).error);
  assert.ok(cambiosDeCompra(compra, { costo_usd: 'abc', dolar: '' }).error);
});
