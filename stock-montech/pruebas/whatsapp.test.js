// Pruebas del mensaje de WhatsApp a los revendedores: npm run probar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroWhatsApp, numeroWhatsAppLegible, mensajeCuenta, enlaceWhatsApp } from '../src/whatsapp.js';

test('reconoce el celular como se cargue', () => {
  const esperado = '5493885123456';
  ['388 5123456', '388-512-3456', '0388 15 512-3456', '388 15 5123456', '+54 9 388 512 3456', '+54 388 5123456',
    '5493885123456', '005493885123456', '5123456', '15 5123456'].forEach((cargado) => {
    assert.equal(numeroWhatsApp(cargado), esperado, cargado);
  });
  assert.equal(numeroWhatsApp('11 15 2345 6789'), '5491123456789');
  assert.equal(numeroWhatsApp('+1 305 555 0101'), '13055550101');
});

test('no inventa un numero si no se reconoce', () => {
  ['', null, 'sin celular', '123', '388 512'].forEach((cargado) => assert.equal(numeroWhatsApp(cargado), '', String(cargado)));
});

test('muestra el numero reconocido para controlarlo', () => {
  assert.equal(numeroWhatsAppLegible('5493885123456'), '+54 9 3885123456');
  assert.equal(numeroWhatsAppLegible(''), '');
});

test('el mensaje lista los equipos, lo entregado y el saldo', () => {
  const mensaje = mensajeCuenta(
    {
      nombre: 'Fernando',
      items: [
        { descripcion: '13 128GB Azul', cantidad: 1, precioUnidadArs: 300000, precioTotalArs: 300000 },
        { descripcion: '14 128GB Negro', cantidad: 2, precioUnidadArs: 400000, precioTotalArs: 800000 },
      ],
      totalArs: 1100000,
      creditoArs: 200000,
      saldoArs: 900000,
    },
    new Date(2026, 10, 4)
  );
  assert.equal(
    mensaje,
    [
      'Hola Fernando! Te paso el resumen de tu cuenta con Montech al 4/11/2026:',
      '',
      '*Equipos que tenés:*',
      '- 13 128GB Azul: $ 300.000',
      '- 2 x 14 128GB Negro: $ 400.000 c/u = $ 800.000',
      'Total equipos: $ 1.100.000',
      'Pagos a cuenta: - $ 200.000',
      '',
      '*Saldo a pagar: $ 900.000*',
    ].join('\n')
  );
});

test('cuenta al dia o con plata a favor', () => {
  const base = { nombre: 'Tiago', items: [], totalArs: 0 };
  assert.match(mensajeCuenta({ ...base, creditoArs: 0, saldoArs: 0 }), /No tenés equipos pendientes\.[\s\S]*\*Tu cuenta está al día\.\*$/);
  assert.match(mensajeCuenta({ ...base, creditoArs: 50000, saldoArs: -50000 }), /\*Saldo a tu favor: \$ 50\.000\*$/);
});

test('el enlace abre el chat con el mensaje escrito', () => {
  assert.equal(enlaceWhatsApp('5493885123456', 'Hola! $ 1.000'), 'https://wa.me/5493885123456?text=Hola!%20%24%201.000');
  assert.equal(enlaceWhatsApp('', 'Hola'), 'https://wa.me/?text=Hola');
});
