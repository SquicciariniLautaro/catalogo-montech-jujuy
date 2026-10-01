import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Normaliza texto para comparar: quita caracteres raros, espacios repetidos y pasa a mayusculas
const normalizar = (v) =>
  String(v === null || v === undefined ? '' : v)
    .replace(/[^\w\sñÑáéíóúÁÉÍÓÚ.,%+-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

// Minusculas y sin tildes, para el traductor de colores
const sinTildes = (v) =>
  String(v === null || v === undefined ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Redondea a 2 decimales
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Agrupa las unidades iguales en una sola fila. El precio NO forma parte de la clave:
// se muestra el promedio ponderado del lote, igual que en el panel de administracion.
const agruparCatalogo = (filas, claveFn) => {
  const grupos = filas.reduce((acc, f) => {
    const k = claveFn(f);
    if (!acc[k]) acc[k] = { ...f, cantidad: 0, precioTotal: 0 };
    acc[k].cantidad += 1;
    acc[k].precioTotal += Number(f.precio_usd) || 0;
    return acc;
  }, {});
  return Object.values(grupos).map((g) => ({ ...g, precio_usd: redondear(g.precioTotal / g.cantidad) }));
};

const claveCelular = (c) =>
  [normalizar(c.modelo), normalizar(c.capacidad), normalizar(c.color), Number(c.bateria) || 0, normalizar(c.detalles)].join('|');

const claveAccesorio = (a) =>
  [normalizar(a.tipo), normalizar(a.modelo), normalizar(a.color), normalizar(a.detalles)].join('|');

function BotonConsultar({ href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-0.5 bg-white border border-green-500 text-green-700 rounded px-1 py-0.5 text-[9px] md:text-xs font-bold hover:bg-green-50 transition"
    >
      <img
        src="/logo-whatsapp.png"
        alt=""
        className="w-2.5 h-2.5 md:w-3 md:h-3 object-contain"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      Consultar
    </a>
  );
}

// Convierte "128GB" o "1TB" a un numero comparable
const capacidadANumero = (cap) => {
  const m = String(cap || '').toUpperCase().match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)?/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return m[2] === 'TB' ? n * 1000 : n;
};

const comparar = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });

// Orden: modelo, capacidad, color, precio
const compararCelulares = (a, b) => {
  const porModelo = comparar(a.modelo, b.modelo);
  if (porModelo !== 0) return porModelo;
  const porCapacidad = capacidadANumero(a.capacidad) - capacidadANumero(b.capacidad);
  if (porCapacidad !== 0) return porCapacidad;
  const porColor = comparar(a.color, b.color);
  if (porColor !== 0) return porColor;
  return (Number(a.precio_usd) || 0) - (Number(b.precio_usd) || 0);
};

// Orden: tipo, modelo, color, precio
const compararAccesorios = (a, b) => {
  const porTipo = comparar(a.tipo, b.tipo);
  if (porTipo !== 0) return porTipo;
  const porModelo = comparar(a.modelo, b.modelo);
  if (porModelo !== 0) return porModelo;
  const porColor = comparar(a.color, b.color);
  if (porColor !== 0) return porColor;
  return (Number(a.precio_usd) || 0) - (Number(b.precio_usd) || 0);
};

// Arma la lista de filas insertando un renglon separador cada vez que cambia la familia
// (por ejemplo de "13" a "13 PRO"). Cuando cambia la capacidad dentro de la misma familia
// se marca la fila con una division mas fina.
const armarFilasConSeparador = (lista, obtenerFamilia, obtenerEtiqueta, obtenerSub) => {
  const filas = [];
  let familiaPrevia = null;
  let subPrevia = null;
  let contador = 0;

  lista.forEach((item) => {
    const familia = normalizar(obtenerFamilia(item));
    const sub = obtenerSub ? normalizar(obtenerSub(item)) : '';
    const cambioFamilia = familia !== familiaPrevia;

    if (cambioFamilia) {
      filas.push({ tipo: 'separador', key: 'sep-' + filas.length, etiqueta: obtenerEtiqueta(item) });
    }
    filas.push({
      tipo: 'fila',
      key: 'fila-' + filas.length,
      item,
      cambioSub: !cambioFamilia && sub !== subPrevia,
      zebra: contador % 2 === 0,
    });

    contador += 1;
    familiaPrevia = familia;
    subPrevia = sub;
  });

  return filas;
};

function Catalogo() {
  const [celularesAgrupados, setCelularesAgrupados] = useState([]);
  const [accesoriosAgrupados, setAccesoriosAgrupados] = useState([]);
  const [cotizacion, setCotizacion] = useState(1250);
  const [cargando, setCargando] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [tabActiva, setTabActiva] = useState('celulares');

  const numeroMontech = '5493885265866';

  useEffect(() => {
    document.title = 'Montech | Catalogo';

    async function cargarDatos() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setEsAdmin(true);

        // Las vistas publicas no incluyen el costo de compra
        const { data: configData } = await supabase
          .from('catalogo_config')
          .select('cotizacion_dolar')
          .single();

        if (configData) setCotizacion(Number(configData.cotizacion_dolar) || 1250);

        const { data: celularesData } = await supabase
          .from('catalogo_celulares')
          .select('*');

        if (celularesData) {
          setCelularesAgrupados(agruparCatalogo(celularesData, claveCelular).sort(compararCelulares));
        }

        const { data: accesoriosData } = await supabase
          .from('catalogo_accesorios')
          .select('*');

        if (accesoriosData) {
          setAccesoriosAgrupados(agruparCatalogo(accesoriosData, claveAccesorio).sort(compararAccesorios));
        }
      } catch (error) {
        console.error(error.message);
      } finally {
        setCargando(false);
      }
    }

    cargarDatos();
  }, []);

  const cambiarTab = (tab) => {
    setTabActiva(tab);
    setBusqueda('');
  };

  // Traduce el texto del color de la BD a un circulo CSS de Tailwind
  const renderizarCirculoColor = (valorColor) => {
    if (!valorColor) return null;
    const c = sinTildes(valorColor);
    let claseColor;
    let conBorde = false;

    if (c.includes('negro') || c.includes('medianoche') || c.includes('black') || c.includes('midnight')) claseColor = 'bg-gray-900';
    else if (c.includes('blanco') || c.includes('estelar') || c.includes('white') || c.includes('starlight')) { claseColor = 'bg-white'; conBorde = true; }
    else if (c.includes('plata') || c.includes('silver') || c.includes('titanio')) claseColor = 'bg-gray-300';
    else if (c.includes('gris') || c.includes('grafito') || c.includes('gray') || c.includes('grey') || c.includes('space')) claseColor = 'bg-gray-600';
    else if (c.includes('rosa') || c.includes('pink')) claseColor = 'bg-pink-300';
    else if (c.includes('oro') || c.includes('dorado') || c.includes('gold') || c.includes('desierto')) claseColor = 'bg-yellow-200';
    else if (c.includes('azul') || c.includes('celeste') || c.includes('blue')) claseColor = 'bg-blue-500';
    else if (c.includes('morado') || c.includes('violeta') || c.includes('purpura') || c.includes('lila') || c.includes('purple')) claseColor = 'bg-purple-600';
    else if (c.includes('verde') || c.includes('green')) claseColor = 'bg-emerald-500';
    else if (c.includes('amarillo') || c.includes('yellow')) claseColor = 'bg-yellow-400';
    else if (c.includes('naranja') || c.includes('orange')) claseColor = 'bg-orange-500';
    else if (c.includes('rojo') || c.includes('red')) claseColor = 'bg-red-600';
    else {
      // Color desconocido: se filtran caracteres raros y se muestra solo el texto
      const textoLimpio = String(valorColor).replace(/[^\w\sñÑáéíóúÁÉÍÓÚ-]/gi, '').trim();
      if (!textoLimpio) return null;
      return <span className="ml-1 text-[9px] text-gray-600 font-medium uppercase">{textoLimpio}</span>;
    }

    return (
      <span
        className={'inline-block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ml-1 align-middle shadow-sm ' + claseColor + (conBorde ? ' border border-gray-300' : '')}
      />
    );
  };

  const limpiarTexto = (t) => (t ? String(t).replace(/[^\w\sñÑáéíóúÁÉÍÓÚ-]/gi, '').trim() : '');

  const linkWsp = (mensaje) => 'https://wa.me/' + numeroMontech + '?text=' + encodeURIComponent(mensaje);

  // Arma "(Negro, bateria 85%, detalle)" con los datos que tenga el equipo
  const armarDescripcion = (partes) => {
    const lista = partes.filter(Boolean);
    return lista.length > 0 ? ' (' + lista.join(', ') + ')' : '';
  };

  const linkConsultaCelular = (celu, precioPesos) => {
    const precio = Math.round(precioPesos).toLocaleString('es-AR');
    const descripcion = armarDescripcion([
      limpiarTexto(celu.color),
      celu.bateria ? 'batería ' + celu.bateria + '%' : '',
      String(celu.detalles || '').trim(),
    ]);
    const mensaje =
      'Hola Montech! Vi en tu catálogo el ' + celu.modelo + ' ' + (celu.capacidad || '') +
      descripcion + ' a $' + precio + '. ¿Tenés stock?';
    return linkWsp(mensaje);
  };

  const linkConsultaAccesorio = (acc, precioPesos) => {
    const precio = Math.round(precioPesos).toLocaleString('es-AR');
    const descripcion = armarDescripcion([limpiarTexto(acc.color), String(acc.detalles || '').trim()]);
    const mensaje =
      'Hola Montech! Vi en tu catálogo el accesorio ' + acc.tipo + ' ' + acc.modelo +
      descripcion + ' a $' + precio + '. ¿Tenés stock?';
    return linkWsp(mensaje);
  };

  const termino = busqueda.toLowerCase().trim();

  const celularesFiltrados = celularesAgrupados.filter((celu) => {
    if (!termino) return true;
    return (
      (celu.modelo || '').toLowerCase().includes(termino) ||
      (celu.color || '').toLowerCase().includes(termino) ||
      (celu.capacidad || '').toLowerCase().includes(termino)
    );
  });

  const accesoriosFiltrados = accesoriosAgrupados.filter((acc) => {
    if (!termino) return true;
    return (
      (acc.tipo || '').toLowerCase().includes(termino) ||
      (acc.modelo || '').toLowerCase().includes(termino) ||
      (acc.color || '').toLowerCase().includes(termino)
    );
  });

  const filasCelulares = armarFilasConSeparador(
    celularesFiltrados,
    (c) => c.modelo,
    (c) => String(c.modelo || '').toUpperCase(),
    (c) => c.capacidad
  );

  const filasAccesorios = armarFilasConSeparador(
    accesoriosFiltrados,
    (a) => a.tipo,
    (a) => String(a.tipo || '').toUpperCase(),
    (a) => a.modelo
  );

  const claseSeparador =
    'bg-gray-200 text-gray-600 text-[9px] md:text-[11px] font-bold uppercase tracking-wider px-2 py-1 border-y border-gray-300';

  if (cargando) {
    return <div className="p-10 text-center font-bold text-gray-600">Cargando catalogo...</div>;
  }

  return (
    <div className="relative p-1.5 max-w-4xl mx-auto font-sans bg-white pb-4 min-h-screen flex flex-col">
      {esAdmin && (
        <a
          href="/admin"
          className="absolute top-2 right-2 bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-md hover:bg-gray-800 transition"
        >
          Volver al Panel
        </a>
      )}

      <div className="flex justify-center items-center mb-2 mt-3">
        <img
          src="/logo.png"
          alt="Montech Jujuy"
          className="h-20 md:h-36 object-contain drop-shadow-xl"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      {/* PESTAÑAS */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => cambiarTab('celulares')}
          className={
            'flex-1 py-2 rounded-xl text-sm font-bold border transition ' +
            (tabActiva === 'celulares'
              ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')
          }
        >
          Celulares
        </button>
        <button
          onClick={() => cambiarTab('accesorios')}
          className={
            'flex-1 py-2 rounded-xl text-sm font-bold border transition ' +
            (tabActiva === 'accesorios'
              ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')
          }
        >
          Accesorios
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder={tabActiva === 'celulares' ? 'Buscar por modelo, capacidad o color' : 'Buscar por tipo, modelo o color'}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 p-2 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none transition text-sm"
        />
      </div>

      {/* TABLA CELULARES */}
      {tabActiva === 'celulares' && (
        <div className="shadow-sm border border-gray-300 rounded-lg w-full overflow-hidden">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-[#e4ecfa] border-b border-gray-300 text-gray-900 text-[8px] md:text-[11px] uppercase font-bold tracking-tight">
                <th className="py-1.5 px-0.5 text-center w-[8%]">Cant</th>
                <th className="py-1.5 px-1 text-left w-[38%]">Modelo / Color</th>
                <th className="py-1.5 px-0.5 text-center w-[10%]">Bat</th>
                <th className="py-1.5 px-1 text-right w-[21%]">Precio</th>
                <th className="py-1.5 px-0.5 text-center w-[23%]"></th>
              </tr>
            </thead>
            <tbody>
              {filasCelulares.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center p-6 text-gray-500 text-sm">
                    No se encontraron equipos con esa busqueda.
                  </td>
                </tr>
              )}

              {filasCelulares.map((fila) => {
                if (fila.tipo === 'separador') {
                  return (
                    <tr key={fila.key}>
                      <td colSpan="5" className={claseSeparador}>{fila.etiqueta}</td>
                    </tr>
                  );
                }

                const celu = fila.item;
                const precioPesos = Number(celu.precio_usd) * cotizacion;
                return (
                  <tr
                    key={fila.key}
                    className={
                      'border-b border-gray-200 ' +
                      (fila.cambioSub ? 'border-t-2 border-t-gray-300 ' : '') +
                      (fila.zebra ? 'bg-white' : 'bg-gray-50')
                    }
                  >
                    <td className="py-1 px-0.5 text-center font-bold text-blue-600 bg-blue-50 text-[10px]">
                      {celu.cantidad}
                    </td>
                    <td className="py-1 px-1 align-middle break-words">
                      <div className="font-bold text-gray-800 text-[10px] md:text-[13px] leading-tight">
                        {celu.modelo}
                        <span className="font-medium text-gray-500 text-[8px] md:text-xs ml-1">{celu.capacidad}</span>
                        {renderizarCirculoColor(celu.color)}
                      </div>
                      {celu.detalles && (
                        <div className="text-[8px] md:text-[11px] text-gray-500 leading-tight mt-0.5">{celu.detalles}</div>
                      )}
                    </td>
                    <td className="py-1 px-0.5 text-center font-medium text-gray-600 text-[9px] md:text-xs">
                      {celu.bateria ? celu.bateria + '%' : '-'}
                    </td>
                    <td className="py-1 px-1 text-right font-bold text-gray-900 text-[10px] md:text-sm leading-tight whitespace-nowrap">
                      $ {Math.round(precioPesos).toLocaleString('es-AR')}
                    </td>
                    <td className="py-1 px-0.5 text-center">
                      <BotonConsultar href={linkConsultaCelular(celu, precioPesos)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TABLA ACCESORIOS */}
      {tabActiva === 'accesorios' && (
        <div className="shadow-sm border border-gray-300 rounded-lg w-full overflow-hidden">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-[#e4ecfa] border-b border-gray-300 text-gray-900 text-[8px] md:text-[11px] uppercase font-bold tracking-tight">
                <th className="py-1.5 px-0.5 text-center w-[8%]">Cant</th>
                <th className="py-1.5 px-1 text-left w-[48%]">Accesorio / Color</th>
                <th className="py-1.5 px-1 text-right w-[21%]">Precio</th>
                <th className="py-1.5 px-0.5 text-center w-[23%]"></th>
              </tr>
            </thead>
            <tbody>
              {filasAccesorios.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center p-6 text-gray-500 text-sm">
                    {accesoriosAgrupados.length === 0
                      ? 'Por el momento no hay accesorios disponibles.'
                      : 'No se encontraron accesorios con esa busqueda.'}
                  </td>
                </tr>
              )}

              {filasAccesorios.map((fila) => {
                if (fila.tipo === 'separador') {
                  return (
                    <tr key={fila.key}>
                      <td colSpan="4" className={claseSeparador}>{fila.etiqueta}</td>
                    </tr>
                  );
                }

                const acc = fila.item;
                const precioPesos = Number(acc.precio_usd) * cotizacion;
                return (
                  <tr
                    key={fila.key}
                    className={
                      'border-b border-gray-200 ' +
                      (fila.cambioSub ? 'border-t-2 border-t-gray-300 ' : '') +
                      (fila.zebra ? 'bg-white' : 'bg-gray-50')
                    }
                  >
                    <td className="py-1 px-0.5 text-center font-bold text-blue-600 bg-blue-50 text-[10px]">
                      {acc.cantidad}
                    </td>
                    <td className="py-1 px-1 align-middle break-words">
                      <div className="font-bold text-gray-800 text-[10px] md:text-[13px] leading-tight">
                        {acc.tipo}
                        <span className="font-medium text-gray-500 text-[8px] md:text-xs ml-1">{acc.modelo}</span>
                        {renderizarCirculoColor(acc.color)}
                      </div>
                      {acc.detalles && (
                        <div className="text-[8px] md:text-[11px] text-gray-500 leading-tight mt-0.5">{acc.detalles}</div>
                      )}
                    </td>
                    <td className="py-1 px-1 text-right font-bold text-gray-900 text-[10px] md:text-sm leading-tight whitespace-nowrap">
                      $ {Math.round(precioPesos).toLocaleString('es-AR')}
                    </td>
                    <td className="py-1 px-0.5 text-center">
                      <BotonConsultar href={linkConsultaAccesorio(acc, precioPesos)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 text-right text-[10px] text-gray-400 font-semibold px-1 mb-6">
        Cotizacion de referencia USD: ${cotizacion.toLocaleString('es-AR')}
      </div>

      <div className="mt-auto pt-6 pb-2 flex flex-col items-center w-full">
        <a
          href="https://instagram.com/montech.jujuy"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-gray-700 hover:text-black transition mb-4 bg-gray-50 px-4 py-2 rounded-full border border-gray-200 shadow-sm"
        >
          <img
            src="/logo-instagram.png"
            alt="Instagram"
            className="w-4 h-4 object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <span className="font-bold text-xs tracking-wide">@montech.jujuy</span>
        </a>

        <div className="w-[80%] border-t border-gray-200 mb-3"></div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Desarrollado por
          </span>
          <div className="flex items-center gap-3">
            <a
              href="https://www.instagram.com/lambdasoluciones/"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[11px] uppercase tracking-wider text-blue-600 hover:text-blue-800 transition"
            >
              LAMBDA SOLUCIONES
            </a>

            {/* Candado discreto: lleva al login, o directo al panel si ya hay sesion iniciada */}
            <a
              href="/admin"
              className="text-gray-300 hover:text-gray-700 transition p-1"
              title="Acceso Administrativo"
              aria-label="Acceso Administrativo"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Catalogo;