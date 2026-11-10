// Simulador de cuotas con tarjeta. Mismas cuentas que el Excel "TARJETAS INTERESES MONTECH":
//   total financiado = precio x (1 + interes)
//   valor de cuota   = total financiado / cuotas, redondeado al peso
//   texto            = "3 cuotas de $ 216.000"
// El interes de cada plan y si se muestra o no se cambian desde el panel (pestana Tarjeta) y se
// guardan en la tabla planes_tarjeta (sql/planes-tarjeta.sql). Sin esa tabla se usan los del Excel.

export const AVISO_CUOTAS = 'Cuotas aproximadas dependiendo la tarjeta';

// Interes en porcentaje (15 = 15%). La cuota unica arranca oculta: en el Excel no va en el texto
// para el cliente, y el pedido fue mostrar de 3 a 12 cuotas.
export const PLANES_POR_DEFECTO = [
  { cuotas: 1, interes: 15, visible: false },
  { cuotas: 3, interes: 20, visible: true },
  { cuotas: 6, interes: 27, visible: true },
  { cuotas: 9, interes: 46, visible: true },
  { cuotas: 12, interes: 57, visible: true },
];

// Planes guardados en la base, completados con los por defecto que falten y ordenados por cuotas
export function armarPlanes(filas) {
  const guardados = new Map();
  (filas || []).forEach((f) => {
    const cuotas = Math.round(Number(f.cuotas));
    if (cuotas >= 1) guardados.set(cuotas, { cuotas, interes: Number(f.interes) || 0, visible: f.visible !== false });
  });
  PLANES_POR_DEFECTO.forEach((p) => {
    if (!guardados.has(p.cuotas)) guardados.set(p.cuotas, { ...p });
  });
  return [...guardados.values()].sort((a, b) => a.cuotas - b.cuotas);
}

// "15,5" o "15.5" o "15 %" -> 15.5. Devuelve NaN si no es un porcentaje valido.
export function leerPorcentaje(texto) {
  const limpio = String(texto ?? '').replace('%', '').replace(',', '.').trim();
  if (limpio === '' || !/^\d+(\.\d+)?$/.test(limpio)) return NaN;
  return Number(limpio);
}

export function calcularPlan(monto, plan) {
  const total = (Number(monto) || 0) * (1 + (Number(plan.interes) || 0) / 100);
  return { ...plan, total: Math.round(total), cuota: Math.round(total / plan.cuotas) };
}

export const pesos = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');

export const textoPlan = (p) => p.cuotas + (p.cuotas === 1 ? ' cuota de ' : ' cuotas de ') + pesos(p.cuota);

// El texto que se copia para mandarle al cliente: un renglon por plan visible y el aviso
export function textoParaCopiar(monto, planes) {
  const lineas = planes.filter((p) => p.visible).map((p) => textoPlan(calcularPlan(monto, p)));
  return [...lineas, '', AVISO_CUOTAS].join('\n');
}

// Mensaje de WhatsApp del catalogo. producto: "13 PRO 128GB (Negro, bateria 90%)" o '' si el
// cliente escribio un monto. plan: el que eligio o null para mandar todas las opciones.
export function mensajeConsultaCuotas({ producto, precio, efectivo, plan, planes }) {
  const entrega = Math.max(0, Math.min(Number(efectivo) || 0, precio));
  const financiado = precio - entrega;
  const que = producto ? 'el ' + producto + ' de ' + pesos(precio) : 'algo de ' + pesos(precio);
  const conEfectivo = entrega > 0 ? ', entregando ' + pesos(entrega) + ' en efectivo y el resto (' + pesos(financiado) + ')' : '';
  if (plan) {
    const c = calcularPlan(financiado, plan);
    return (
      'Hola Montech! Quiero comprar ' + que + ' con tarjeta' + conEfectivo + ' en ' + textoPlan(c) +
      ' (total ' + pesos(c.total) + '). ¿Me confirmás?'
    );
  }
  const opciones = planes.filter((p) => p.visible).map((p) => textoPlan(calcularPlan(financiado, p)));
  return (
    'Hola Montech! Quiero comprar ' + que + ' con tarjeta' + conEfectivo + '. Vi en el simulador: ' + opciones.join(', ') +
    '. ¿Me confirmás?'
  );
}
