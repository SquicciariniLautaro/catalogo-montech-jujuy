// Cobro de la mensualidad del sistema (Lambda). El vencimiento y los datos de pago viven en la
// tabla estado_servicio, que el panel lee pero no puede cambiar. La base tiene la misma regla
// (servicio_habilitado en sql/cobro-mensualidad.sql) y rechaza los cambios en solo lectura.

const DIA = 86400000;

export const MENSAJE_SOLO_LECTURA =
  'El panel esta en solo lectura por falta de pago de la mensualidad. Se habilita apenas se registre el pago.';

// Fecha de hoy en Argentina (UTC-3, sin horario de verano) como 'AAAA-MM-DD'
export const hoyArgentina = (ahora = new Date()) => new Date(ahora.getTime() - 3 * 3600000).toISOString().slice(0, 10);

const diasEntre = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA);
const sumarDias = (fecha, dias) => new Date(Date.parse(fecha) + dias * DIA).toISOString().slice(0, 10);

// Etapas:
// - al_dia: falta mas de dias_aviso para el vencimiento (o no hay vencimiento cargado)
// - aviso: faltan dias_aviso o menos, hasta el mismo dia del vencimiento
// - vencido: corre el recargo diario, el panel sigue funcionando hasta terminar los dias de gracia
// - solo_lectura: se ve todo pero no se puede cambiar nada
export function estadoDelServicio(fila, hoy) {
  if (!fila || !fila.vence) return { etapa: 'al_dia', soloLectura: false };
  const diasAviso = fila.dias_aviso ?? 5;
  const diasGracia = fila.dias_gracia ?? 7;
  const faltan = diasEntre(hoy, fila.vence);
  const atraso = Math.max(0, -faltan);
  const recargo = atraso * Number(fila.recargo_diario || 0);
  const monto = fila.monto === null || fila.monto === undefined ? null : Number(fila.monto);

  let etapa = 'al_dia';
  if (atraso > diasGracia) etapa = 'solo_lectura';
  else if (atraso > 0) etapa = 'vencido';
  else if (faltan <= diasAviso) etapa = 'aviso';

  return {
    etapa,
    soloLectura: etapa === 'solo_lectura',
    vence: fila.vence,
    faltan: Math.max(0, faltan),
    atraso,
    recargo,
    recargoDiario: Number(fila.recargo_diario || 0),
    monto,
    total: monto === null ? null : monto + recargo,
    // Primer dia en solo lectura
    bloqueo: sumarDias(fila.vence, diasGracia + 1),
  };
}

// En solo lectura, las altas, cambios y bajas del panel devuelven un error con el motivo sin
// llegar a la base (la base igual las rechazaria). Las lecturas siguen igual.
let soloLectura = false;
export const ponerSoloLectura = (valor) => {
  soloLectura = valor;
};

const ESCRITURAS = ['insert', 'update', 'upsert', 'delete'];

// Consulta que acepta cualquier cadena (.eq, .in, .select...) y termina en el error de solo lectura
const rechazo = () => {
  const consulta = new Proxy(function () {}, {
    get: (_, clave) =>
      clave === 'then'
        ? (resolver, rechazar) => Promise.resolve({ data: null, error: { message: MENSAJE_SOLO_LECTURA } }).then(resolver, rechazar)
        : () => consulta,
  });
  return consulta;
};

export function instalarSoloLectura(cliente) {
  if (cliente.soloLecturaInstalado) return;
  cliente.soloLecturaInstalado = true;
  const desde = cliente.from.bind(cliente);
  cliente.from = (tabla) => {
    const consulta = desde(tabla);
    if (!soloLectura) return consulta;
    return new Proxy(consulta, {
      get: (destino, clave) => {
        if (ESCRITURAS.includes(clave)) return () => rechazo();
        const valor = destino[clave];
        return typeof valor === 'function' ? valor.bind(destino) : valor;
      },
    });
  };
}
