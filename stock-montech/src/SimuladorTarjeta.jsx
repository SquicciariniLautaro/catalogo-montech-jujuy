import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { armarPlanes, calcularPlan, textoPlan, pesos, mensajeConsultaCuotas, AVISO_CUOTAS } from './cuotas';

const OTRO = 'otro';

// "540.000" mientras se escribe; guarda solo los numeros
const soloNumeros = (texto) => String(texto).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const conPuntos = (crudo) => (crudo ? Number(crudo).toLocaleString('es-AR') : '');

// Pestana "Con tarjeta" del catalogo: el cliente elige un celular (o escribe un monto), puede
// entregar una parte en efectivo y ve las cuotas que el local tiene a la vista. Los intereses
// los carga el local en el panel (pestana Tarjeta).
function SimuladorTarjeta({ celulares, cotizacion, numeroWhatsApp }) {
  const [planes, setPlanes] = useState(null);
  const [eleccion, setEleccion] = useState('');
  const [precioEscrito, setPrecioEscrito] = useState('');
  const [efectivo, setEfectivo] = useState('');
  const [cuotasElegidas, setCuotasElegidas] = useState(null);

  useEffect(() => {
    // Sin la tabla se usan los intereses de siempre (los del Excel del local)
    supabase
      .from('planes_tarjeta')
      .select('cuotas,interes,visible')
      .order('cuotas')
      .then(({ data, error }) => setPlanes(armarPlanes(error ? null : data)));
  }, []);

  const celu = eleccion && eleccion !== OTRO ? celulares.find((c) => String(c.id) === eleccion) : null;
  const precio = celu ? Math.round(Number(celu.precio_usd) * cotizacion) : eleccion === OTRO ? Number(precioEscrito) || 0 : 0;
  const entrega = Math.min(Number(efectivo) || 0, precio);
  const financiado = precio - entrega;
  const visibles = (planes || []).filter((p) => p.visible);
  const elegido = visibles.find((p) => p.cuotas === cuotasElegidas) || null;

  const producto = celu
    ? celu.modelo + ' ' + (celu.capacidad || '') +
      ' (' + [celu.color, celu.bateria ? 'batería ' + celu.bateria + '%' : ''].filter(Boolean).join(', ') + ')'
    : '';
  const enlace =
    'https://wa.me/' + numeroWhatsApp + '?text=' +
    encodeURIComponent(mensajeConsultaCuotas({ producto: producto.replace(/\s+/g, ' ').replace(' ()', ''), precio, efectivo: entrega, plan: elegido, planes: visibles }));

  const claseCampo =
    'mt-1 w-full border border-gray-300 p-2.5 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none transition text-base';

  return (
    <div className="border border-gray-300 rounded-lg p-3 md:p-5 space-y-4">
      <div>
        <h2 className="text-base md:text-lg font-black text-gray-900">Simulá tu compra con tarjeta</h2>
        <p className="text-xs text-gray-500">Elegí el celular, si querés entregá una parte en efectivo, y mirá en cuántas cuotas te queda.</p>
      </div>

      <label className="block text-xs font-bold text-gray-700">
        1. Elegí el celular
        <select
          value={eleccion}
          onChange={(e) => {
            setEleccion(e.target.value);
            setCuotasElegidas(null);
          }}
          className={claseCampo + ' font-semibold'}
        >
          <option value="">Elegí un celular...</option>
          {celulares.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {[c.modelo + ' ' + (c.capacidad || ''), c.color, c.bateria ? 'bat. ' + c.bateria + '%' : '']
                .filter(Boolean)
                .join(' - ')}{' '}
              - {pesos(Number(c.precio_usd) * cotizacion)}
            </option>
          ))}
          <option value={OTRO}>Otro monto (escribir el precio)</option>
        </select>
      </label>

      {eleccion === OTRO && (
        <label className="block text-xs font-bold text-gray-700">
          Precio
          <input
            type="text"
            inputMode="numeric"
            value={conPuntos(precioEscrito)}
            onChange={(e) => setPrecioEscrito(soloNumeros(e.target.value))}
            placeholder="Ej: 500.000"
            className={claseCampo + ' font-bold'}
          />
        </label>
      )}

      {precio > 0 && (
        <label className="block text-xs font-bold text-gray-700">
          2. ¿Entregás algo en efectivo? <span className="font-medium text-gray-500">(opcional)</span>
          <input
            type="text"
            inputMode="numeric"
            value={conPuntos(efectivo)}
            onChange={(e) => setEfectivo(soloNumeros(e.target.value))}
            placeholder="$ 0"
            className={claseCampo}
          />
        </label>
      )}

      {precio > 0 && planes && (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-0.5">
            <div className="flex justify-between gap-3">
              <span>Precio</span>
              <span className="font-bold">{pesos(precio)}</span>
            </div>
            {entrega > 0 && (
              <div className="flex justify-between gap-3">
                <span>Efectivo</span>
                <span className="font-bold">- {pesos(entrega)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-gray-200 pt-1">
              <span className="font-bold">Con tarjeta</span>
              <span className="font-black text-gray-900">{pesos(financiado)}</span>
            </div>
          </div>

          {financiado <= 0 ? (
            <p className="text-sm font-semibold text-gray-600">Lo pagás todo en efectivo: no hace falta tarjeta.</p>
          ) : visibles.length === 0 ? (
            <p className="text-sm font-semibold text-gray-600">Por ahora no hay cuotas para mostrar: consultanos por WhatsApp.</p>
          ) : (
            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">3. Elegí las cuotas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {visibles.map((p) => {
                  const c = calcularPlan(financiado, p);
                  const activo = cuotasElegidas === p.cuotas;
                  return (
                    <button
                      key={p.cuotas}
                      type="button"
                      onClick={() => setCuotasElegidas(activo ? null : p.cuotas)}
                      aria-pressed={activo}
                      className={
                        'text-left rounded-xl border-2 px-3 py-2 transition ' +
                        (activo ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-400')
                      }
                    >
                      {/* Al publico solo el valor de la cuota: el total con tarjeta queda para el panel */}
                      <span className="block text-base font-black">{textoPlan(c)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {AVISO_CUOTAS}. Los precios y las cuotas son aproximados: confirmalos con nosotros antes de comprar.
          </p>

          <a
            href={enlace}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-green-700 transition"
          >
            <img src="/logo-whatsapp.png" alt="" className="w-4 h-4 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
            {elegido ? 'Consultar ' + elegido.cuotas + (elegido.cuotas === 1 ? ' cuota' : ' cuotas') + ' por WhatsApp' : 'Consultar por WhatsApp'}
          </a>
        </div>
      )}
    </div>
  );
}

export default SimuladorTarjeta;
