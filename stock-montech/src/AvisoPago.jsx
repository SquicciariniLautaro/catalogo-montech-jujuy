import { useState } from 'react';
import toast from 'react-hot-toast';

const pesos = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const diaMes = (fecha) => fecha.slice(8, 10) + '/' + fecha.slice(5, 7);
const dias = (n) => n + (n === 1 ? ' dia' : ' dias');

// Aviso de la mensualidad del sistema arriba del panel. Con la mensualidad vencida o el panel en
// solo lectura, la ventana con los datos de pago se abre cada vez que se entra y la franja roja
// no se puede cerrar. Se monta recien con los datos cargados, asi la ventana arranca abierta.
function AvisoPago({ estado, datos }) {
  const vencida = estado.etapa === 'vencido' || estado.etapa === 'solo_lectura';
  const [ventanaAbierta, setVentanaAbierta] = useState(vencida);
  const [avisoCerrado, setAvisoCerrado] = useState(false);

  if (estado.etapa === 'al_dia') return null;

  const copiar = (texto, nombre) => {
    navigator.clipboard?.writeText(texto).then(
      () => toast.success(nombre + ' copiado'),
      () => toast.error('No se pudo copiar')
    );
  };

  let franja = null;
  if (estado.etapa === 'aviso' && !avisoCerrado) {
    franja = (
      <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
        <p className="flex-1 text-sm">
          <span className="font-bold">
            {estado.faltan === 0 ? 'Hoy vence la mensualidad del sistema.' : 'La mensualidad del sistema vence el ' + diaMes(estado.vence) + ' (faltan ' + dias(estado.faltan) + ').'}
          </span>{' '}
          Despues del vencimiento se suma un recargo de {pesos(estado.recargoDiario)} por dia.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setVentanaAbierta(true)} className="flex-1 md:flex-none bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-600 transition">
            Ver datos de pago
          </button>
          <button onClick={() => setAvisoCerrado(true)} className="px-3 py-2 rounded-lg text-sm font-bold text-amber-800 hover:bg-amber-100 transition" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      </div>
    );
  } else if (vencida) {
    franja = (
      <div className="bg-red-600 text-white rounded-xl p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 shadow-sm">
        <p className="flex-1 text-sm">
          {estado.soloLectura ? (
            <>
              <span className="font-bold">Panel en solo lectura por falta de pago.</span> Podes ver todo, pero no cargar, vender ni modificar nada
              hasta que se registre el pago.
            </>
          ) : (
            <>
              <span className="font-bold">La mensualidad del sistema vencio el {diaMes(estado.vence)}.</span> Recargo acumulado: {pesos(estado.recargo)}. El{' '}
              {diaMes(estado.bloqueo)} el panel pasa a solo lectura.
            </>
          )}
        </p>
        <button onClick={() => setVentanaAbierta(true)} className="bg-white text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-50 transition">
          Ver datos de pago
        </button>
      </div>
    );
  }

  const filas = [
    ['CBU', datos.cbu, true],
    ['Alias', datos.alias, true],
    ['Cuenta', datos.cuenta],
    ['Titular', datos.titular],
    ['CUIL', datos.cuil],
    ['Banco', datos.banco],
  ].filter(([, valor]) => valor);

  return (
    <>
      {franja && <div className="max-w-6xl mx-auto mb-4">{franja}</div>}

      {ventanaAbierta && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-pago" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 id="titulo-pago" className={'text-xl font-bold ' + (vencida ? 'text-red-600' : 'text-gray-800')}>
              {estado.soloLectura ? 'Panel en solo lectura' : vencida ? 'Mensualidad vencida' : 'Mensualidad del sistema'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {estado.soloLectura
                ? 'Por falta de pago el panel quedo en solo lectura: se ve todo, pero no se puede cargar, vender ni modificar nada. Se habilita apenas se registre el pago.'
                : vencida
                  ? 'La mensualidad vencio el ' + diaMes(estado.vence) + ' y corre un recargo de ' + pesos(estado.recargoDiario) + ' por dia. Si no se paga, el ' + diaMes(estado.bloqueo) + ' el panel pasa a solo lectura.'
                  : 'Vence el ' + diaMes(estado.vence) + '. Despues de esa fecha se suma un recargo de ' + pesos(estado.recargoDiario) + ' por dia.'}
            </p>

            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm flex flex-col gap-1.5">
              {estado.monto !== null && (
                <div className="flex justify-between gap-2"><span className="text-gray-600">Mensualidad</span><span className="font-bold">{pesos(estado.monto)}</span></div>
              )}
              {estado.atraso > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-600">Recargo ({dias(estado.atraso)} de atraso)</span>
                  <span className="font-bold text-red-600">{pesos(estado.recargo)}</span>
                </div>
              )}
              {estado.total !== null && estado.atraso > 0 && (
                <div className="flex justify-between gap-2 border-t border-gray-200 pt-1.5"><span className="font-bold">Total a pagar hoy</span><span className="font-black">{pesos(estado.total)}</span></div>
              )}
              {estado.monto === null && estado.atraso === 0 && <p className="text-gray-600">Sin recargo si se paga hasta el {diaMes(estado.vence)}.</p>}
            </div>

            <h3 className="text-xs font-bold text-gray-500 uppercase mt-4 mb-2">Datos para transferir</h3>
            <dl className="flex flex-col gap-2 text-sm">
              {filas.map(([nombre, valor, copiable]) => (
                <div key={nombre} className="flex items-center justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">{nombre}</dt>
                  <dd className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-gray-900 break-all text-right">{valor}</span>
                    {copiable && (
                      <button onClick={() => copiar(valor, nombre)} className="shrink-0 text-xs font-bold text-blue-600 border border-blue-200 rounded-md px-2 py-1 hover:bg-blue-50">
                        Copiar
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-gray-500 mt-4">Cuando hagas la transferencia, manda el comprobante a Lambda para que se registre el pago.</p>

            <button onClick={() => setVentanaAbierta(false)} className="mt-4 w-full bg-gray-900 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-gray-800 transition">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default AvisoPago;
