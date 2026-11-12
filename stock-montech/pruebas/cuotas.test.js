// Pruebas del simulador de cuotas con tarjeta: npm run probar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANES_POR_DEFECTO, armarPlanes, leerPorcentaje, calcularPlan, textoPlan, textoParaCopiar, mensajeConsultaCuotas,
} from '../src/cuotas.js';

test('da lo mismo que el Excel con un precio de $ 540.000', () => {
  const r = PLANES_POR_DEFECTO.map((p) => calcularPlan(540000, p));
  assert.deepEqual(
    r.map((p) => [p.cuotas, p.total, p.cuota]),
    [[1, 621000, 621000], [3, 648000, 216000], [6, 685800, 114300], [9, 788400, 87600], [12, 847800, 70650]]
  );
  assert.equal(textoPlan(r[1]), '3 cuotas de $ 216.000');
  assert.equal(textoPlan(r[0]), '1 cuota de $ 621.000');
});

test('el texto para copiar lleva solo las cuotas visibles y el aviso, como la columna azul del Excel', () => {
  assert.equal(
    textoParaCopiar(540000, PLANES_POR_DEFECTO),
    ['3 cuotas de $ 216.000', '6 cuotas de $ 114.300', '9 cuotas de $ 87.600', '12 cuotas de $ 70.650', '', 'Cuotas aproximadas dependiendo la tarjeta'].join('\n')
  );
  const sinTres = PLANES_POR_DEFECTO.map((p) => (p.cuotas === 3 ? { ...p, visible: false } : p));
  assert.doesNotMatch(textoParaCopiar(540000, sinTres), /3 cuotas/);
});

test('los planes guardados reemplazan a los del Excel y se completan los que falten', () => {
  const planes = armarPlanes([{ cuotas: 6, interes: '30', visible: false }, { cuotas: 18, interes: 80, visible: true }]);
  assert.deepEqual(planes.map((p) => p.cuotas), [1, 3, 6, 9, 12, 18]);
  assert.deepEqual(planes.find((p) => p.cuotas === 6), { cuotas: 6, interes: 30, comision: null, visible: false });
  assert.deepEqual(armarPlanes(null), PLANES_POR_DEFECTO);
});

test('lee el porcentaje como lo escriban', () => {
  assert.equal(leerPorcentaje('15'), 15);
  assert.equal(leerPorcentaje('27,5'), 27.5);
  assert.equal(leerPorcentaje(' 46 % '), 46);
  ['', 'abc', '-5', '1,2,3'].forEach((t) => assert.ok(Number.isNaN(leerPorcentaje(t)), t));
});

test('mensaje de WhatsApp con el plan elegido y entrega en efectivo', () => {
  const plan = PLANES_POR_DEFECTO.find((p) => p.cuotas === 6);
  assert.equal(
    mensajeConsultaCuotas({ producto: '13 PRO 128GB (Negro)', precio: 640000, efectivo: 100000, plan, planes: PLANES_POR_DEFECTO }),
    'Hola Montech! Quiero comprar el 13 PRO 128GB (Negro) de $ 640.000 con tarjeta, entregando $ 100.000 en efectivo y el resto ' +
      '($ 540.000) en 6 cuotas de $ 114.300. ¿Me confirmás?'
  );
});

test('mensaje de WhatsApp sin plan elegido: manda todas las opciones visibles', () => {
  assert.equal(
    mensajeConsultaCuotas({ producto: '', precio: 540000, efectivo: 0, plan: null, planes: PLANES_POR_DEFECTO }),
    'Hola Montech! Quiero comprar algo de $ 540.000 con tarjeta. Vi en el simulador: 3 cuotas de $ 216.000, 6 cuotas de $ 114.300, ' +
      '9 cuotas de $ 87.600, 12 cuotas de $ 70.650. ¿Me confirmás?'
  );
});

test('la entrega en efectivo no puede pasar el precio', () => {
  const plan = PLANES_POR_DEFECTO.find((p) => p.cuotas === 3);
  assert.match(
    mensajeConsultaCuotas({ producto: '', precio: 100000, efectivo: 500000, plan, planes: PLANES_POR_DEFECTO }),
    /entregando \$ 100\.000 en efectivo y el resto \(\$ 0\)/
  );
});

test('lo que recibe el local: el total menos la comision de la tarjeta, sobre el total', () => {
  // El ejemplo del audio: $ 100.000 en 6 cuotas al 27%, la tarjeta se queda con el 20%
  const c = calcularPlan(100000, { cuotas: 6, interes: 27, comision: 20 });
  assert.equal(c.total, 127000);
  assert.equal(c.recibe, 101600);
  assert.equal(c.diferencia, 1600);
  // Si la comision es mayor que lo que se le suma al cliente, se pierde plata
  assert.equal(calcularPlan(100000, { cuotas: 3, interes: 10, comision: 10 }).diferencia, -1000);
  // Sin comision cargada no se calcula
  assert.equal(calcularPlan(100000, { cuotas: 3, interes: 20, comision: null }).recibe, null);
  assert.equal(armarPlanes([{ cuotas: 3, interes: 20, comision: '12.5', visible: true }])[1].comision, 12.5);
});
