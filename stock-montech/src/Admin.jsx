import { useState, useEffect, useRef, Fragment } from 'react';
import { supabase } from './supabase';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORES = [
  'Negro',
  'Blanco',
  'Plata',
  'Gris',
  'Oro',
  'Rosa',
  'Azul',
  'Morado',
  'Verde',
  'Amarillo',
  'Naranja',
  'Rojo',
  'Titanio',
  'Titanio del Desierto',
];

// Palabras clave -> clase de Tailwind. El orden importa: gana la primera coincidencia.
const PALETA = [
  [['negro', 'medianoche', 'black', 'midnight'], 'bg-gray-900'],
  [['blanco', 'estelar', 'white', 'starlight'], 'bg-white border border-gray-300'],
  [['plata', 'silver', 'titanio'], 'bg-gray-300'],
  [['gris', 'grafito', 'gray', 'grey', 'space'], 'bg-gray-600'],
  [['rosa', 'pink'], 'bg-pink-300'],
  [['oro', 'dorado', 'gold', 'desierto'], 'bg-yellow-200'],
  [['azul', 'celeste', 'blue'], 'bg-blue-500'],
  [['morado', 'violeta', 'purpura', 'lila', 'purple'], 'bg-purple-600'],
  [['verde', 'green'], 'bg-emerald-500'],
  [['amarillo', 'yellow'], 'bg-yellow-400'],
  [['naranja', 'orange'], 'bg-orange-500'],
  [['rojo', 'red'], 'bg-red-600'],
];

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const VENTAS_POR_PAGINA = 10;
const ALTO_MENU = 140;

// Columnas compartidas por el encabezado y las filas del stock en escritorio
const COLUMNAS_STOCK = 'md:grid md:grid-cols-[minmax(0,1fr)_17rem_8rem] md:gap-4 md:items-center';

const claseInput = 'border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none w-full min-w-0';
const claseInputModal = 'border border-gray-300 p-2.5 rounded-lg w-full min-w-0 bg-gray-50 focus:bg-white outline-none';
const claseInputEdicion = 'mt-1 border border-gray-300 p-2 rounded-lg w-full min-w-0 bg-white text-gray-800 text-base md:text-sm font-medium normal-case outline-none focus:border-blue-500';

const fmt = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

// Redondea a 2 decimales
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Devuelve el nombre canonico del color si coincide con la lista (sin importar mayusculas).
// Si no coincide, conserva el texto tal cual para no perder colores personalizados.
const colorCanonico = (valor) => {
  const v = String(valor || '').trim();
  const encontrado = COLORES.find((c) => c.toLowerCase() === v.toLowerCase());
  return encontrado || v;
};

// Formatea capacidad: agrega GB solo si el valor es numerico
const formatearCapacidad = (valor) => {
  const v = String(valor || '').trim().toUpperCase();
  if (/^\d+$/.test(v)) return v + 'GB';
  return v;
};

// Convierte "128GB" o "1TB" a un numero comparable
const capacidadANumero = (cap) => {
  const m = String(cap || '').toUpperCase().match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)?/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return m[2] === 'TB' ? n * 1000 : n;
};

const comparar = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });

// Desempate entre celulares del mismo precio: modelo, capacidad, color
const compararCelulares = (a, b) =>
  comparar(a.modelo, b.modelo) ||
  capacidadANumero(a.capacidad) - capacidadANumero(b.capacidad) ||
  comparar(a.color, b.color) ||
  (Number(a.precio_usd) || 0) - (Number(b.precio_usd) || 0);

// Desempate entre accesorios del mismo precio: tipo, modelo, color
const compararAccesorios = (a, b) =>
  comparar(a.tipo, b.tipo) ||
  comparar(a.modelo, b.modelo) ||
  comparar(a.color, b.color) ||
  (Number(a.precio_usd) || 0) - (Number(b.precio_usd) || 0);

// Ordena de menor a mayor precio sin romper los grupos por familia: las familias van segun
// su producto mas barato y, dentro de cada familia, los productos de menor a mayor precio
const ordenarPorPrecio = (lista, obtenerFamilia, desempate) => {
  const precio = (item) => Number(item.precio_usd) || 0;
  const minimos = {};
  lista.forEach((item) => {
    const familia = normalizar(obtenerFamilia(item));
    if (!(familia in minimos) || precio(item) < minimos[familia]) minimos[familia] = precio(item);
  });
  return [...lista].sort((a, b) => {
    const fa = normalizar(obtenerFamilia(a));
    const fb = normalizar(obtenerFamilia(b));
    if (fa !== fb) return minimos[fa] - minimos[fb] || comparar(fa, fb);
    return precio(a) - precio(b) || desempate(a, b);
  });
};

// La clave de lote NO incluye costo ni precio: ambos se promedian
const claveCelular = (c) =>
  [
    normalizar(c.modelo),
    normalizar(c.capacidad),
    normalizar(c.color),
    Number(c.bateria) || 0,
    normalizar(c.detalles),
  ].join('|');

const claveAccesorio = (a) =>
  [
    normalizar(a.tipo),
    normalizar(a.modelo),
    normalizar(a.color),
    normalizar(a.detalles),
  ].join('|');

// Agrupa las unidades iguales en una sola fila y las ordena. Cada registro de la BD es una
// unidad, por lo que total / cantidad es el promedio ponderado de costo y de precio del lote.
const agruparStock = (filas, claveFn, ordenar) => {
  const grupos = filas.reduce((acc, f) => {
    const k = claveFn(f);
    if (!acc[k]) acc[k] = { ...f, cantidad: 0, ids: [], costoTotal: 0, precioTotal: 0 };
    acc[k].cantidad += 1;
    acc[k].ids.push(f.id);
    acc[k].costoTotal += Number(f.costo_usd) || 0;
    acc[k].precioTotal += Number(f.precio_usd) || 0;
    return acc;
  }, {});
  return ordenar(
    Object.values(grupos).map((g) => ({
      ...g,
      costo_usd: redondear(g.costoTotal / g.cantidad),
      precio_usd: redondear(g.precioTotal / g.cantidad),
    }))
  );
};

const TAMANO_PAGINA = 1000;

// Supabase devuelve como maximo 1000 filas por consulta: se pide por paginas hasta traer todo
async function traerTodo(armarConsulta) {
  const filas = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await armarConsulta().range(desde, desde + TAMANO_PAGINA - 1);
    if (error) return { data: null, error };
    filas.push(...data);
    if (data.length < TAMANO_PAGINA) return { data: filas, error: null };
  }
}

// Inserta unidades nuevas y unifica costo y precio del lote con el promedio ponderado
async function guardarLoteConPromedio(tabla, filaBase, cantidad, claveFn) {
  const { data: existentes, error: errorBusqueda } = await traerTodo(() =>
    supabase.from(tabla).select('*').eq('estado', 'disponible').order('id')
  );
  if (errorBusqueda) return { error: errorBusqueda };

  const claveNueva = claveFn(filaBase);
  const mismos = (existentes || []).filter((e) => claveFn(e) === claveNueva);
  const total = mismos.length + cantidad;
  const promediar = (campo) =>
    redondear((mismos.reduce((acc, e) => acc + (Number(e[campo]) || 0), 0) + filaBase[campo] * cantidad) / total);
  const costo = promediar('costo_usd');
  const precio = promediar('precio_usd');

  const nuevos = Array.from({ length: cantidad }, () => ({
    ...filaBase,
    costo_usd: costo,
    precio_usd: precio,
    estado: 'disponible',
  }));

  const { error } = await supabase.from(tabla).insert(nuevos);
  if (error) return { error };

  const idsDesactualizados = mismos
    .filter((e) => Number(e.costo_usd) !== costo || Number(e.precio_usd) !== precio)
    .map((e) => e.id);
  if (idsDesactualizados.length > 0) {
    const { error: errorUpdate } = await supabase
      .from(tabla)
      .update({ costo_usd: costo, precio_usd: precio })
      .in('id', idsDesactualizados);
    if (errorUpdate) return { error: errorUpdate };
  }

  return { error: null, costo, precio, unificadas: mismos.length };
}

const calcularStats = (arrayStock, cot) => {
  const totalQty = arrayStock.reduce((acc, item) => acc + item.cantidad, 0);
  const totalCosto = arrayStock.reduce((acc, item) => acc + item.costoTotal, 0);
  const totalVenta = arrayStock.reduce((acc, item) => acc + item.precioTotal, 0);
  const gananciaUsd = totalVenta - totalCosto;
  return { totalQty, totalCosto, totalVenta, gananciaUsd, gananciaArs: gananciaUsd * cot };
};

const obtenerMesAnio = (fechaISO) => {
  if (!fechaISO) return 'Sin fecha';
  const fecha = new Date(fechaISO);
  return fecha.getFullYear() + '-' + (fecha.getMonth() + 1).toString().padStart(2, '0');
};

const formatearNombreMes = (yyyyMm) => {
  const [year, month] = yyyyMm.split('-');
  return MESES[parseInt(month) - 1] + ' ' + year;
};

function IconoChevron() {
  return (
    <svg className="w-3 h-3 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Traduce el texto del color de la BD a un circulo de color.
// Si el color no se reconoce, muestra el texto limpio.
function CirculoColor({ color, soloCirculo = false }) {
  if (!color) return null;
  const c = sinTildes(color);
  const encontrado = PALETA.find(([palabras]) => palabras.some((p) => c.includes(p)));

  if (!encontrado) {
    if (soloCirculo) return null;
    const textoLimpio = String(color).replace(/[^\w\sñÑáéíóúÁÉÍÓÚ-]/gi, '').trim();
    if (!textoLimpio) return null;
    return <span className="ml-1 text-xs text-gray-600 font-medium uppercase">{textoLimpio}</span>;
  }

  return (
    <span
      title={String(color)}
      className={'inline-block shrink-0 w-3.5 h-3.5 rounded-full align-middle shadow-sm ' + (soloCirculo ? '' : 'ml-1.5 ') + encontrado[1]}
    />
  );
}

// Campo con etiqueta para los formularios de edicion
function Campo({ etiqueta, className = '', children }) {
  return (
    <label className={'block min-w-0 text-[10px] font-bold text-gray-500 uppercase tracking-wide ' + className}>
      {etiqueta}
      {children}
    </label>
  );
}

function ResumenStock({ etiqueta, stats }) {
  const claseTitulo = 'text-gray-500 text-[11px] md:text-xs font-semibold uppercase tracking-wider mb-1';
  const claseValor = 'font-black text-lg md:text-2xl break-words';
  return (
    <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="border-l-4 border-gray-400 pl-3 min-w-0">
        <p className={claseTitulo}>{etiqueta}</p>
        <p className={claseValor + ' text-gray-800'}>{stats.totalQty}</p>
      </div>
      <div className="border-l-4 border-red-400 pl-3 min-w-0">
        <p className={claseTitulo}>Costo Invertido</p>
        <p className={claseValor + ' text-gray-800'}>$ {fmt(stats.totalCosto)}</p>
      </div>
      <div className="border-l-4 border-blue-500 pl-3 min-w-0">
        <p className={claseTitulo}>Valor de Venta</p>
        <p className={claseValor + ' text-blue-600'}>$ {fmt(stats.totalVenta)}</p>
      </div>
      <div className="border-l-4 border-green-500 pl-3 min-w-0">
        <p className={claseTitulo}>Ganancia Esperada</p>
        <p className="font-black text-lg md:text-xl text-green-600 leading-tight break-words">
          $ {fmt(stats.gananciaUsd)}
          <span className="text-[10px] text-gray-500 block font-semibold mt-0.5">ARS $ {fmt(stats.gananciaArs)}</span>
        </p>
      </div>
    </div>
  );
}

// Dato con etiqueta dentro de una fila de stock
function DatoStock({ etiqueta, valor, clase }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide">{etiqueta}</span>
      <span className={'block text-sm font-bold break-words ' + clase}>{valor}</span>
    </div>
  );
}

// Titulo de la seccion de stock y, en escritorio, nombres de las columnas
function EncabezadoStock({ titulo, columna, stats, lotes, busqueda, onBusqueda }) {
  return (
    <Fragment>
      <div className="px-3 md:px-4 py-3 border-b border-gray-200 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold text-gray-800">{titulo}</h2>
        <span className="text-xs font-semibold text-gray-500">
          {stats.totalQty} unidad(es) en {lotes} lote(s)
        </span>
      </div>
      <div className="px-3 md:px-4 py-2 border-b border-gray-200">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Buscar en el stock"
          aria-label="Buscar en el stock"
          className="w-full min-w-0 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white px-3 py-2 text-base md:text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div className={'hidden px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide ' + COLUMNAS_STOCK}>
        <span>{columna}</span>
        <span>Precios por unidad</span>
        <span className="text-right">Acciones</span>
      </div>
    </Fragment>
  );
}

// Fila de stock: tarjeta apilada en celulares, fila de tres columnas en escritorio
function FilaStock({ item, titulo, subtitulo, cot, onOpciones }) {
  return (
    <div className={'p-3 md:px-4 flex flex-col gap-3 hover:bg-gray-50 transition ' + COLUMNAS_STOCK}>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span className="shrink-0 bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-bold shadow-sm" title="Unidades en stock">
            {item.cantidad} u.
          </span>
          <span className="min-w-0 break-words font-bold text-gray-900 text-base md:text-sm leading-tight">{titulo}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-gray-600">
          {item.color && (
            <span className="inline-flex items-center gap-1">
              <CirculoColor color={item.color} soloCirculo />
              {item.color}
            </span>
          )}
          {subtitulo.map((dato) => (
            <span key={dato} className="break-words min-w-0">{dato}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 bg-gray-50 md:bg-transparent rounded-lg p-2 md:p-0">
        <DatoStock etiqueta="Costo USD" valor={'$ ' + fmt(item.costo_usd)} clase="text-red-500" />
        <DatoStock etiqueta="Venta USD" valor={'$ ' + fmt(item.precio_usd)} clase="text-green-600" />
        <DatoStock etiqueta="Venta ARS" valor={'$ ' + fmt(Math.round(item.precio_usd * cot))} clase="text-gray-800" />
      </div>
      <div className="md:text-right">
        <button
          onClick={onOpciones}
          className="w-full md:w-auto bg-gray-200 text-gray-800 px-3 py-2.5 md:py-1.5 rounded-lg font-bold hover:bg-gray-300 transition text-xs shadow-sm"
        >
          Opciones
          <IconoChevron />
        </button>
      </div>
    </div>
  );
}

// Pie del formulario de edicion: a cuantas unidades aplicar y botones de accion
function AccionesEdicion({ cantidad, valor, onChange, onGuardar, onCancelar }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
      <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
        <span className="text-xs text-blue-700 font-bold whitespace-nowrap">Aplicar a:</span>
        <select
          name="cantidadAEditar"
          value={valor}
          onChange={onChange}
          className="flex-1 min-w-0 border border-gray-300 p-1.5 text-sm rounded bg-white text-gray-800"
        >
          {Array.from({ length: cantidad }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} unidad(es)</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 sm:ml-auto">
        <button onClick={onGuardar} className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition">
          Guardar
        </button>
        <button onClick={onCancelar} className="flex-1 sm:flex-none bg-gray-200 text-gray-700 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-gray-300 transition">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Admin() {
  const [cotizacion, setCotizacion] = useState(1250);
  const [descuentoMayorista, setDescuentoMayorista] = useState(5);
  const [activeTab, setActiveTab] = useState('celulares');

  const [stockCelulares, setStockCelulares] = useState([]);
  const [stockAccesorios, setStockAccesorios] = useState([]);
  const [ventasGlobales, setVentasGlobales] = useState([]);
  const [cargando, setCargando] = useState(true);

  const estadoInicialCelular = { modelo: '', capacidad: '', color: '', bateria: '', costo_usd: '', precio_usd: '', detalles: '', cantidad: 1 };
  const estadoInicialAccesorio = { tipo: '', modelo: '', color: '', costo_usd: '', precio_usd: '', detalles: '', cantidad: 1 };
  const estadoInicialPermuta = { modelo: '', capacidad: '', color: '', bateria: '', detalles: '', precio_ars: '', precio_venta_ars: '', entregaId: '' };

  const [formCelular, setFormCelular] = useState(estadoInicialCelular);
  const [formAccesorio, setFormAccesorio] = useState(estadoInicialAccesorio);
  const [formPermuta, setFormPermuta] = useState(estadoInicialPermuta);

  const [editandoCelularId, setEditandoCelularId] = useState(null);
  const [formEdicionCelular, setFormEdicionCelular] = useState({});
  const [editandoAccesorioId, setEditandoAccesorioId] = useState(null);
  const [formEdicionAccesorio, setFormEdicionAccesorio] = useState({});

  const [showPermutaModal, setShowPermutaModal] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState('todos');
  const [paginaActual, setPaginaActual] = useState(1);
  const [menu, setMenu] = useState(null); // { key, item, tabla, top, right }
  const [venta, setVenta] = useState(null); // { item, tabla, cantidad, mayorista }
  const [busquedaStock, setBusquedaStock] = useState('');
  const [dialogo, setDialogo] = useState(null); // { titulo, texto, botones: [{ etiqueta, clase, accion }] }
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);

  const cot = Number(cotizacion) || 0;

  // Evita que un doble toque dispare dos veces la misma operacion (por ejemplo, duplicar un ingreso)
  const conBloqueo = (fn) => async (...args) => {
    if (args[0] && typeof args[0].preventDefault === 'function') args[0].preventDefault();
    if (ocupado.current) return;
    ocupado.current = true;
    setGuardando(true);
    try {
      await fn(...args);
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  };

  // Lote del stock que se entrega al cliente en la permuta (opcional)
  const lotePermuta = stockCelulares.find((c) => String(c.ids[0]) === formPermuta.entregaId) || null;

  const cambiarTab = (tab) => {
    setActiveTab(tab);
    setBusquedaStock('');
  };

  useEffect(() => {
    document.title = 'Montech | Admin';
    cargarDatos(true);
  }, []);

  // Cierra el menu de opciones al hacer scroll o redimensionar
  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [menu]);

  async function cargarDatos(mostrarLoader = false) {
    if (mostrarLoader) setCargando(true);

    // El orden final (de menor a mayor precio, igual que el catalogo publico) se aplica al agrupar
    const [config, celDisponibles, accDisponibles, celVendidos, accVendidos] = await Promise.all([
      supabase.from('configuracion').select('*').eq('id', 1).single(),
      traerTodo(() => supabase.from('celulares').select('*').eq('estado', 'disponible').order('modelo', { ascending: true }).order('id')),
      traerTodo(() => supabase.from('accesorios').select('*').eq('estado', 'disponible').order('tipo', { ascending: true }).order('id')),
      traerTodo(() => supabase.from('celulares').select('*').eq('estado', 'vendido').order('id')),
      traerTodo(() => supabase.from('accesorios').select('*').eq('estado', 'vendido').order('id')),
    ]);

    const fallo = [config, celDisponibles, accDisponibles, celVendidos, accVendidos].find((r) => r.error);
    if (fallo) toast.error('Error al cargar datos: ' + fallo.error.message);

    if (config.data) {
      setCotizacion(config.data.cotizacion_dolar);
      if (config.data.descuento_mayorista !== null && config.data.descuento_mayorista !== undefined) {
        setDescuentoMayorista(config.data.descuento_mayorista);
      }
    }
    if (celDisponibles.data) setStockCelulares(agruparStock(celDisponibles.data, claveCelular, (l) => ordenarPorPrecio(l, (c) => c.modelo, compararCelulares)));
    if (accDisponibles.data) setStockAccesorios(agruparStock(accDisponibles.data, claveAccesorio, (l) => ordenarPorPrecio(l, (x) => x.tipo, compararAccesorios)));

    const ventasUnificadas = [
      ...(celVendidos.data || []).map((v) => ({ ...v, categoria: 'celular' })),
      ...(accVendidos.data || []).map((v) => ({ ...v, categoria: 'accesorio' })),
    ];
    ventasUnificadas.sort((a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta));
    setVentasGlobales(ventasUnificadas);

    if (mostrarLoader) setCargando(false);
  }

  async function handleActualizarConfiguracion() {
    const nuevaCotizacion = parseFloat(cotizacion);
    const nuevoDescuento = parseFloat(descuentoMayorista);
    if (!(nuevaCotizacion > 0)) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    if (!(nuevoDescuento >= 0 && nuevoDescuento <= 100)) {
      toast.error('El descuento mayorista debe estar entre 0 y 100');
      return;
    }
    const { error } = await supabase
      .from('configuracion')
      .update({ cotizacion_dolar: nuevaCotizacion, descuento_mayorista: nuevoDescuento })
      .eq('id', 1);
    if (!error) toast.success('Configuracion global actualizada');
    else toast.error('Error al guardar: ' + error.message);
  }

  // ---------- CSV ----------
  const escaparCsv = (valor) => '"' + String(valor === null || valor === undefined ? '' : valor).replace(/"/g, '""') + '"';

  const exportarCSV = () => {
    let csv = '﻿Categoria,Producto,Color,Fecha Venta,Costo USD,Venta USD,Ganancia USD\n';
    ventasFiltradas.forEach((v) => {
      const fecha = v.fecha_venta ? new Date(v.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha';
      const ganancia = (v.precio_usd - v.costo_usd).toFixed(2);
      const cat = v.categoria === 'celular' ? 'Celular' : 'Accesorio';
      const producto = v.categoria === 'celular' ? v.modelo + ' ' + v.capacidad : v.tipo + ' ' + v.modelo;
      csv += [escaparCsv(cat), escaparCsv(producto), escaparCsv(v.color), escaparCsv(fecha), v.costo_usd, v.precio_usd, ganancia].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Reporte_Ventas_Montech_' + mesSeleccionado + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ---------- Handlers de formularios ----------
  const handleChangeCelular = (e) => setFormCelular({ ...formCelular, [e.target.name]: e.target.value });
  const handleChangeAccesorio = (e) => setFormAccesorio({ ...formAccesorio, [e.target.name]: e.target.value });
  const handleChangePermuta = (e) => setFormPermuta({ ...formPermuta, [e.target.name]: e.target.value });

  const mensajeLote = (cantidad, nombre, resultado) =>
    resultado.unificadas > 0
      ? cantidad + ' ' + nombre + ' sumado(s) al lote existente. Promedio: costo USD ' + resultado.costo + ' / venta USD ' + resultado.precio
      : cantidad + ' ' + nombre + ' agregado(s)';

  async function handleGuardarCelular(e) {
    e.preventDefault();
    const cantidad = parseInt(formCelular.cantidad) || 1;
    const filaBase = {
      modelo: formCelular.modelo.trim().toUpperCase(),
      capacidad: formatearCapacidad(formCelular.capacidad),
      color: colorCanonico(formCelular.color),
      bateria: parseInt(formCelular.bateria),
      costo_usd: parseFloat(formCelular.costo_usd),
      precio_usd: parseFloat(formCelular.precio_usd),
      detalles: formCelular.detalles.trim(),
    };

    const resultado = await guardarLoteConPromedio('celulares', filaBase, cantidad, claveCelular);
    if (!resultado.error) {
      toast.success(mensajeLote(cantidad, 'equipo(s)', resultado));
      setFormCelular({ ...formCelular, cantidad: 1, color: '' });
      cargarDatos(false);
    } else toast.error('Error al guardar: ' + resultado.error.message);
  }

  async function handleGuardarAccesorio(e) {
    e.preventDefault();
    const cantidad = parseInt(formAccesorio.cantidad) || 1;
    const filaBase = {
      tipo: formAccesorio.tipo.trim(),
      modelo: formAccesorio.modelo.trim(),
      color: colorCanonico(formAccesorio.color),
      costo_usd: parseFloat(formAccesorio.costo_usd),
      precio_usd: parseFloat(formAccesorio.precio_usd),
      detalles: formAccesorio.detalles.trim(),
    };

    const resultado = await guardarLoteConPromedio('accesorios', filaBase, cantidad, claveAccesorio);
    if (!resultado.error) {
      toast.success(mensajeLote(cantidad, 'accesorio(s)', resultado));
      setFormAccesorio({ ...formAccesorio, cantidad: 1, color: '' });
      cargarDatos(false);
    } else toast.error('Error al guardar: ' + resultado.error.message);
  }

  async function handleGuardarPermuta(e) {
    e.preventDefault();
    if (!cot) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    const costoUsd = redondear(parseFloat(formPermuta.precio_ars) / cot);
    // Si no se indica precio de venta, queda igualado al costo
    const ventaUsd = formPermuta.precio_venta_ars
      ? redondear(parseFloat(formPermuta.precio_venta_ars) / cot)
      : costoUsd;

    const filaBase = {
      modelo: formPermuta.modelo.trim().toUpperCase(),
      capacidad: formatearCapacidad(formPermuta.capacidad),
      color: colorCanonico(formPermuta.color),
      bateria: parseInt(formPermuta.bateria),
      costo_usd: costoUsd,
      precio_usd: ventaUsd,
      detalles: formPermuta.detalles.trim(),
    };

    const { error } = await guardarLoteConPromedio('celulares', filaBase, 1, claveCelular);
    if (error) {
      toast.error('Error al registrar permuta: ' + error.message);
      return;
    }

    if (lotePermuta) {
      // El equipo entregado sale del stock como una venta al precio del lote
      const { error: errorEntrega } = await supabase
        .from('celulares')
        .update({ estado: 'vendido', fecha_venta: new Date().toISOString(), precio_usd: lotePermuta.precio_usd })
        .eq('id', lotePermuta.ids[0]);
      if (errorEntrega) toast.error('El equipo recibido se cargo, pero no se pudo registrar la entrega: ' + errorEntrega.message);
      else toast.success('Permuta registrada: el equipo recibido entro al stock y el entregado quedo como vendido');
    } else {
      toast.success('Permuta registrada: el equipo recibido entro al stock');
    }
    setShowPermutaModal(false);
    setFormPermuta(estadoInicialPermuta);
    cargarDatos(false);
  }

  // ---------- Menu de opciones ----------
  const abrirMenu = (e, item, tabla) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const key = tabla + '-' + item.ids[0];
    if (menu && menu.key === key) {
      setMenu(null);
      return;
    }
    // Si no entra debajo del boton, se abre hacia arriba
    const entraAbajo = rect.bottom + 4 + ALTO_MENU <= window.innerHeight;
    setMenu({
      key,
      item,
      tabla,
      top: entraAbajo ? rect.bottom + 4 : Math.max(8, rect.top - 4 - ALTO_MENU),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  // ---------- Ventas ----------
  const confirmarVenta = (item, tabla) => setVenta({ item, tabla, cantidad: 1, mayorista: false });

  // Cantidad a vender, siempre entre 1 y las unidades del lote
  const cantidadVenta = venta ? Math.min(venta.item.cantidad, Math.max(1, parseInt(venta.cantidad) || 1)) : 0;
  // El descuento mayorista solo aplica a accesorios vendidos por cantidad (2 o mas unidades)
  const admiteMayorista = venta ? venta.tabla === 'accesorios' : false;
  const mayoristaActivo = admiteMayorista && venta.mayorista && cantidadVenta >= 2;
  const precioVenta = venta
    ? redondear(venta.item.precio_usd * (mayoristaActivo ? 1 - Number(descuentoMayorista) / 100 : 1))
    : 0;

  // La venta se registra al precio que muestra el lote (promedio), con descuento si es mayorista
  async function ejecutarVenta() {
    const { item, tabla } = venta;
    const ids = item.ids.slice(0, cantidadVenta);
    setVenta(null);
    const { error } = await supabase
      .from(tabla)
      .update({ estado: 'vendido', fecha_venta: new Date().toISOString(), precio_usd: precioVenta })
      .in('id', ids);
    if (error) {
      toast.error('Error al registrar la venta: ' + error.message);
      return;
    }
    toast.success(ids.length + ' venta(s) registrada(s)');
    cargarDatos(false);
  }

  // Anular una venta cargada por error: la unidad vuelve al stock
  const confirmarAnulacion = (item) =>
    setDialogo({
      titulo: 'Anular esta venta?',
      texto: 'La unidad vuelve al stock disponible.',
      botones: [{ etiqueta: 'Anular venta', clase: 'bg-red-600 hover:bg-red-700', accion: () => anularVenta(item) }],
    });

  async function anularVenta(item) {
    const tabla = item.categoria === 'celular' ? 'celulares' : 'accesorios';
    const { error } = await supabase.from(tabla).update({ estado: 'disponible', fecha_venta: null }).eq('id', item.id);
    if (error) {
      toast.error('Error al anular la venta: ' + error.message);
      return;
    }
    toast.success('Venta anulada, la unidad volvio al stock');
    cargarDatos(false);
  }

  // ---------- Borrado ----------
  const confirmarBorrado = (item, tabla) => {
    const nombre = tabla === 'celulares' ? item.modelo + ' ' + (item.capacidad || '') : item.tipo + ' - ' + item.modelo;
    const botones = [{ etiqueta: 'Borrar 1 unidad', clase: 'bg-red-500 hover:bg-red-600', accion: () => ejecutarBorrado([item.ids[0]], tabla) }];
    if (item.cantidad > 1) {
      botones.push({
        etiqueta: 'Borrar las ' + item.cantidad + ' unidades',
        clase: 'bg-red-700 hover:bg-red-800',
        accion: () => ejecutarBorrado(item.ids, tabla),
      });
    }
    setDialogo({
      titulo: 'Borrar del stock',
      texto: nombre + (item.color ? ' - ' + item.color : '') + '. Esta accion no se puede deshacer.',
      botones,
    });
  };

  async function ejecutarBorrado(idsArray, tabla) {
    const { error } = await supabase.from(tabla).delete().in('id', idsArray);
    if (error) {
      toast.error('Error al borrar: ' + error.message);
      return;
    }
    toast.success(idsArray.length + ' item(s) eliminado(s)');
    cargarDatos(false);
  }

  // ---------- Edicion ----------
  const iniciarEdicionCelular = (celular) => {
    setEditandoCelularId(celular.ids[0]);
    setFormEdicionCelular({ ...celular, cantidadAEditar: celular.cantidad });
  };
  const handleChangeEdicionCelular = (e) => setFormEdicionCelular({ ...formEdicionCelular, [e.target.name]: e.target.value });

  // Valida los campos comunes de una edicion. Devuelve null (y avisa) si algo esta mal.
  const validarEdicion = (form) => {
    const color = colorCanonico(form.color);
    const costo_usd = parseFloat(form.costo_usd);
    const precio_usd = parseFloat(form.precio_usd);
    if (!color) {
      toast.error('Indica un color antes de guardar');
      return null;
    }
    if (!(costo_usd >= 0) || !(precio_usd >= 0)) {
      toast.error('Costo y venta deben ser numeros validos');
      return null;
    }
    const ids = form.ids.slice(0, parseInt(form.cantidadAEditar) || form.ids.length);
    return { color, costo_usd, precio_usd, ids };
  };

  async function guardarEdicionCelular() {
    const datos = validarEdicion(formEdicionCelular);
    if (!datos) return;
    const modelo = String(formEdicionCelular.modelo || '').trim().toUpperCase();
    if (!modelo) {
      toast.error('El modelo no puede quedar vacio');
      return;
    }
    const { error } = await supabase
      .from('celulares')
      .update({
        modelo,
        capacidad: formatearCapacidad(formEdicionCelular.capacidad),
        color: datos.color,
        bateria: parseInt(formEdicionCelular.bateria) || 0,
        costo_usd: datos.costo_usd,
        precio_usd: datos.precio_usd,
        detalles: String(formEdicionCelular.detalles || '').trim(),
      })
      .in('id', datos.ids);

    if (!error) {
      toast.success(datos.ids.length + ' equipo(s) actualizado(s)');
      setEditandoCelularId(null);
      cargarDatos(false);
    } else toast.error('Error al actualizar: ' + error.message);
  }

  const iniciarEdicionAccesorio = (acc) => {
    setEditandoAccesorioId(acc.ids[0]);
    setFormEdicionAccesorio({ ...acc, cantidadAEditar: acc.cantidad });
  };
  const handleChangeEdicionAccesorio = (e) => setFormEdicionAccesorio({ ...formEdicionAccesorio, [e.target.name]: e.target.value });

  async function guardarEdicionAccesorio() {
    const datos = validarEdicion(formEdicionAccesorio);
    if (!datos) return;
    const tipo = String(formEdicionAccesorio.tipo || '').trim();
    if (!tipo) {
      toast.error('El tipo no puede quedar vacio');
      return;
    }
    const { error } = await supabase
      .from('accesorios')
      .update({
        tipo,
        modelo: String(formEdicionAccesorio.modelo || '').trim(),
        color: datos.color,
        costo_usd: datos.costo_usd,
        precio_usd: datos.precio_usd,
        detalles: String(formEdicionAccesorio.detalles || '').trim(),
      })
      .in('id', datos.ids);

    if (!error) {
      toast.success(datos.ids.length + ' accesorio(s) actualizado(s)');
      setEditandoAccesorioId(null);
      cargarDatos(false);
    } else toast.error('Error al actualizar: ' + error.message);
  }

  // ---------- Datos derivados ----------
  const statsCelulares = calcularStats(stockCelulares, cot);
  const statsAccesorios = calcularStats(stockAccesorios, cot);

  // Buscador del stock: todas las palabras escritas deben aparecer en alguno de los campos
  const filtrarStock = (lista, campos) => {
    const palabras = sinTildes(busquedaStock).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return lista;
    return lista.filter((item) => {
      const texto = sinTildes(campos.map((c) => item[c]).join(' '));
      return palabras.every((p) => texto.includes(p));
    });
  };
  const celularesVisibles = filtrarStock(stockCelulares, ['modelo', 'capacidad', 'color', 'detalles']);
  const accesoriosVisibles = filtrarStock(stockAccesorios, ['tipo', 'modelo', 'color', 'detalles']);

  const mesesDisponibles = [...new Set(ventasGlobales.map((v) => obtenerMesAnio(v.fecha_venta)))]
    .filter((m) => m !== 'Sin fecha')
    .sort()
    .reverse();

  const ventasFiltradas =
    mesSeleccionado === 'todos'
      ? ventasGlobales
      : ventasGlobales.filter((v) => obtenerMesAnio(v.fecha_venta) === mesSeleccionado);

  const totalVendidos = ventasFiltradas.length;
  const gananciaVentasUSD = ventasFiltradas.reduce((acc, item) => acc + (item.precio_usd - item.costo_usd), 0);
  const gananciaVentasARS = gananciaVentasUSD * cot;

  const totalPaginas = Math.ceil(ventasFiltradas.length / VENTAS_POR_PAGINA);
  const pagina = Math.min(paginaActual, Math.max(1, totalPaginas));
  const ventasPaginadas = ventasFiltradas.slice((pagina - 1) * VENTAS_POR_PAGINA, pagina * VENTAS_POR_PAGINA);

  const datosGrafico = mesesDisponibles
    .slice(0, 6)
    .reverse()
    .map((mes) => {
      const ventasMes = ventasGlobales.filter((v) => obtenerMesAnio(v.fecha_venta) === mes);
      const ganancia = ventasMes.reduce((acc, c) => acc + (c.precio_usd - c.costo_usd), 0);
      const [, month] = mes.split('-');
      return { name: MESES[parseInt(month) - 1].slice(0, 3), Ganancia: redondear(ganancia) };
    });

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 bg-gray-50">Cargando...</div>;
  }

  const claseTab = (tab) =>
    'flex-1 md:flex-none py-3 px-6 text-sm font-bold rounded-t-lg transition ' +
    (activeTab === tab ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100');

  const claseBotonAgregar = 'flex-1 bg-blue-600 text-white py-3 md:py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition text-sm disabled:opacity-60';

  return (
    <div className="min-h-screen p-3 md:p-8 text-gray-800 bg-gray-50 overflow-x-hidden">
      {/* Lista de colores sugeridos: autocompleta pero permite escribir cualquier color */}
      <datalist id="lista-colores">
        {COLORES.map((color) => (
          <option key={color} value={color} />
        ))}
      </datalist>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 max-w-6xl mx-auto mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Panel de Control</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <button onClick={() => supabase.auth.signOut()} className="text-sm font-bold text-red-500 hover:underline py-1">
              Cerrar Sesion
            </button>
            <span className="text-gray-300">|</span>
            <a href="/" target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600 hover:underline py-1">
              Ver Catalogo Publico
            </a>
            <span className="text-gray-300">|</span>
            <button onClick={() => setShowPermutaModal(true)} className="text-sm font-bold text-purple-600 hover:underline py-1">
              Registrar Permuta
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:flex gap-2 md:gap-3 items-start">
          <label className="flex items-center min-w-0 bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
            <span className="font-semibold px-2 text-green-600 text-[11px] md:text-xs uppercase">Cotizacion $</span>
            <input
              type="number"
              min="0"
              value={cotizacion}
              onChange={(e) => setCotizacion(e.target.value)}
              className="flex-1 min-w-0 md:flex-none md:w-20 border-l pl-2 py-1 outline-none font-bold text-base md:text-sm text-gray-700 bg-transparent"
            />
          </label>
          <div className="min-w-0">
          <label className="flex items-center min-w-0 bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
            <span className="font-semibold px-2 text-blue-600 text-[11px] md:text-xs uppercase">Desc. mayorista %</span>
            <input
              type="number"
              min="0"
              max="100"
              value={descuentoMayorista}
              onChange={(e) => setDescuentoMayorista(e.target.value)}
              className="flex-1 min-w-0 md:flex-none md:w-16 border-l pl-2 py-1 outline-none font-bold text-base md:text-sm text-gray-700 bg-transparent"
            />
          </label>
          <p className="text-[9px] text-gray-400 font-medium mt-1 ml-1 leading-tight">Se aplica al vender accesorios por cantidad</p>
          </div>
          <button
            onClick={conBloqueo(handleActualizarConfiguracion)}
            className="col-span-2 bg-gray-900 text-white px-4 py-2.5 md:py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 md:gap-8 max-w-6xl mx-auto w-full">
        {/* TABS */}
        <div className="flex gap-2 border-b border-gray-200">
          <button onClick={() => cambiarTab('celulares')} className={claseTab('celulares')}>Celulares</button>
          <button onClick={() => cambiarTab('accesorios')} className={claseTab('accesorios')}>Accesorios</button>
        </div>

        {/* ===================== TAB CELULARES ===================== */}
        {activeTab === 'celulares' && (
          <div className="space-y-4 md:space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-4 md:mb-5 text-gray-800">Nuevo Ingreso de Celular</h2>
              <form onSubmit={conBloqueo(handleGuardarCelular)} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input required name="modelo" value={formCelular.modelo} onChange={handleChangeCelular} type="text" placeholder="Mod. (Ej: 14 PRO)" className={claseInput} />
                  <input required name="capacidad" value={formCelular.capacidad} onChange={handleChangeCelular} type="text" placeholder="Cap. (Ej: 128)" className={claseInput} />
                  <input required name="color" list="lista-colores" value={formCelular.color} onChange={handleChangeCelular} type="text" placeholder="Color" className={claseInput} />
                  <input required name="bateria" value={formCelular.bateria} onChange={handleChangeCelular} type="number" min="0" max="100" placeholder="Bateria %" className={claseInput} />
                  <input required name="costo_usd" value={formCelular.costo_usd} onChange={handleChangeCelular} type="number" min="0" step="0.01" placeholder="Costo (USD)" className={claseInput} />
                  <div className="flex flex-col min-w-0">
                    <input required name="precio_usd" value={formCelular.precio_usd} onChange={handleChangeCelular} type="number" min="0" step="0.01" placeholder="Venta (USD)" className={claseInput} />
                    <span className="text-[10px] text-green-600 font-bold mt-1 ml-1 h-3">
                      {formCelular.precio_usd ? 'ARS $ ' + fmt(formCelular.precio_usd * cot) : ''}
                    </span>
                  </div>
                  <input name="detalles" value={formCelular.detalles} onChange={handleChangeCelular} type="text" placeholder="Detalles (Opcional)" className={claseInput + ' col-span-2'} />
                </div>
                <div className="flex md:flex-col gap-2 md:w-32">
                  <div className="relative w-28 md:w-full shrink-0">
                    <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                    <input required name="cantidad" value={formCelular.cantidad} onChange={handleChangeCelular} type="number" min="1" className={claseInput + ' pl-12 font-bold'} />
                  </div>
                  <button type="submit" disabled={guardando} className={claseBotonAgregar}>{guardando ? 'Guardando...' : 'Agregar'}</button>
                </div>
              </form>
              <p className="text-[11px] text-gray-400 mt-3">
                Si el modelo, capacidad, color, bateria y detalles coinciden con un lote existente, las unidades se suman a ese lote y el costo y el precio de venta se recalculan como promedio ponderado.
              </p>
            </div>

            <ResumenStock etiqueta="Total Celulares" stats={statsCelulares} />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <EncabezadoStock titulo="Stock de Celulares" columna="Equipo" stats={statsCelulares} lotes={stockCelulares.length} busqueda={busquedaStock} onBusqueda={setBusquedaStock} />
              <div className="divide-y divide-gray-100 md:max-h-[400px] md:overflow-y-auto">
                {celularesVisibles.map((celu) =>
                  editandoCelularId === celu.ids[0] ? (
                    <div key={celu.ids[0]} className="p-3 md:p-4 bg-blue-50/40">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Campo etiqueta="Modelo">
                          <input className={claseInputEdicion} name="modelo" value={formEdicionCelular.modelo || ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                        <Campo etiqueta="Capacidad">
                          <input className={claseInputEdicion} name="capacidad" value={formEdicionCelular.capacidad || ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                        <Campo etiqueta="Bateria %">
                          <input className={claseInputEdicion} name="bateria" type="number" min="0" max="100" value={formEdicionCelular.bateria ?? ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                        <Campo etiqueta="Color">
                          <input className={claseInputEdicion} name="color" type="text" list="lista-colores" value={formEdicionCelular.color || ''} onChange={handleChangeEdicionCelular} placeholder="Elegir o escribir" />
                        </Campo>
                        <Campo etiqueta="Costo USD">
                          <input className={claseInputEdicion} name="costo_usd" type="number" min="0" step="0.01" value={formEdicionCelular.costo_usd ?? ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                        <Campo etiqueta="Venta USD">
                          <input className={claseInputEdicion} name="precio_usd" type="number" min="0" step="0.01" value={formEdicionCelular.precio_usd ?? ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                        <Campo etiqueta="Detalles" className="col-span-2">
                          <input className={claseInputEdicion} name="detalles" value={formEdicionCelular.detalles || ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                      </div>
                      <AccionesEdicion
                        cantidad={celu.cantidad}
                        valor={formEdicionCelular.cantidadAEditar}
                        onChange={handleChangeEdicionCelular}
                        onGuardar={conBloqueo(guardarEdicionCelular)}
                        onCancelar={() => setEditandoCelularId(null)}
                      />
                    </div>
                  ) : (
                    <FilaStock
                      key={celu.ids[0]}
                      item={celu}
                      titulo={celu.modelo + ' ' + (celu.capacidad || '')}
                      subtitulo={['Bateria ' + celu.bateria + '%', celu.detalles].filter(Boolean)}
                      cot={cot}
                      onOpciones={(e) => abrirMenu(e, celu, 'celulares')}
                    />
                  )
                )}
              </div>
              {celularesVisibles.length === 0 && (
                <p className="text-center p-8 text-gray-500">
                  {stockCelulares.length === 0 ? 'No hay celulares en stock.' : 'Ningun equipo coincide con la busqueda.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB ACCESORIOS ===================== */}
        {activeTab === 'accesorios' && (
          <div className="space-y-4 md:space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-4 md:mb-5 text-gray-800">Nuevo Ingreso de Accesorio</h2>
              <form onSubmit={conBloqueo(handleGuardarAccesorio)} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <input required name="tipo" value={formAccesorio.tipo} onChange={handleChangeAccesorio} type="text" placeholder="Tipo (Ej: Funda)" className={claseInput} />
                  <input required name="modelo" value={formAccesorio.modelo} onChange={handleChangeAccesorio} type="text" placeholder="Mod. (Ej: iPhone 13)" className={claseInput} />
                  <input required name="color" list="lista-colores" value={formAccesorio.color} onChange={handleChangeAccesorio} type="text" placeholder="Color / Diseno" className={claseInput} />
                  <input required name="costo_usd" value={formAccesorio.costo_usd} onChange={handleChangeAccesorio} type="number" min="0" step="0.01" placeholder="Costo (USD)" className={claseInput} />
                  <div className="flex flex-col min-w-0">
                    <input required name="precio_usd" value={formAccesorio.precio_usd} onChange={handleChangeAccesorio} type="number" min="0" step="0.01" placeholder="Venta (USD)" className={claseInput} />
                    <span className="text-[10px] text-green-600 font-bold mt-1 ml-1 h-3">
                      {formAccesorio.precio_usd ? 'ARS $ ' + fmt(formAccesorio.precio_usd * cot) : ''}
                    </span>
                  </div>
                  <input name="detalles" value={formAccesorio.detalles} onChange={handleChangeAccesorio} type="text" placeholder="Detalles extra" className={claseInput} />
                </div>
                <div className="flex md:flex-col gap-2 md:w-32">
                  <div className="relative w-28 md:w-full shrink-0">
                    <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                    <input required name="cantidad" value={formAccesorio.cantidad} onChange={handleChangeAccesorio} type="number" min="1" className={claseInput + ' pl-12 font-bold'} />
                  </div>
                  <button type="submit" disabled={guardando} className={claseBotonAgregar}>{guardando ? 'Guardando...' : 'Agregar'}</button>
                </div>
              </form>
              <p className="text-[11px] text-gray-400 mt-3">
                Si el tipo, modelo, color y detalles coinciden con un lote existente, las unidades se suman a ese lote y el costo y el precio de venta se recalculan como promedio ponderado.
              </p>
            </div>

            <ResumenStock etiqueta="Total Accesorios" stats={statsAccesorios} />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <EncabezadoStock titulo="Stock de Accesorios" columna="Accesorio" stats={statsAccesorios} lotes={stockAccesorios.length} busqueda={busquedaStock} onBusqueda={setBusquedaStock} />
              <div className="divide-y divide-gray-100 md:max-h-[400px] md:overflow-y-auto">
                {accesoriosVisibles.map((acc) =>
                  editandoAccesorioId === acc.ids[0] ? (
                    <div key={acc.ids[0]} className="p-3 md:p-4 bg-blue-50/40">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <Campo etiqueta="Tipo">
                          <input className={claseInputEdicion} name="tipo" value={formEdicionAccesorio.tipo || ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <Campo etiqueta="Modelo">
                          <input className={claseInputEdicion} name="modelo" value={formEdicionAccesorio.modelo || ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <Campo etiqueta="Color / Diseno">
                          <input className={claseInputEdicion} name="color" type="text" list="lista-colores" value={formEdicionAccesorio.color || ''} onChange={handleChangeEdicionAccesorio} placeholder="Elegir o escribir" />
                        </Campo>
                        <Campo etiqueta="Costo USD">
                          <input className={claseInputEdicion} name="costo_usd" type="number" min="0" step="0.01" value={formEdicionAccesorio.costo_usd ?? ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <Campo etiqueta="Venta USD">
                          <input className={claseInputEdicion} name="precio_usd" type="number" min="0" step="0.01" value={formEdicionAccesorio.precio_usd ?? ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <Campo etiqueta="Detalles">
                          <input className={claseInputEdicion} name="detalles" value={formEdicionAccesorio.detalles || ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                      </div>
                      <AccionesEdicion
                        cantidad={acc.cantidad}
                        valor={formEdicionAccesorio.cantidadAEditar}
                        onChange={handleChangeEdicionAccesorio}
                        onGuardar={conBloqueo(guardarEdicionAccesorio)}
                        onCancelar={() => setEditandoAccesorioId(null)}
                      />
                    </div>
                  ) : (
                    <FilaStock
                      key={acc.ids[0]}
                      item={acc}
                      titulo={acc.tipo + ' - ' + acc.modelo}
                      subtitulo={[acc.detalles].filter(Boolean)}
                      cot={cot}
                      onOpciones={(e) => abrirMenu(e, acc, 'accesorios')}
                    />
                  )
                )}
              </div>
              {accesoriosVisibles.length === 0 && (
                <p className="text-center p-8 text-gray-500">
                  {stockAccesorios.length === 0 ? 'No hay accesorios en stock.' : 'Ningun accesorio coincide con la busqueda.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===================== HISTORIAL GLOBAL ===================== */}
        <div className="space-y-4 pt-6 md:pt-8 border-t border-gray-200 mt-2 md:mt-4">
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">Historial Global de Ventas</h2>
            <div className="flex gap-2 w-full md:w-auto">
              {ventasFiltradas.length > 0 && (
                <button
                  onClick={exportarCSV}
                  className="flex-1 md:flex-none bg-green-600 text-white font-bold py-2.5 md:py-2 px-4 rounded-lg hover:bg-green-700 text-sm shadow-sm transition"
                >
                  Descargar CSV
                </button>
              )}
              {mesesDisponibles.length > 0 && (
                <select
                  value={mesSeleccionado}
                  onChange={(e) => { setMesSeleccionado(e.target.value); setPaginaActual(1); }}
                  className="flex-1 md:flex-none min-w-0 border border-gray-300 rounded-lg px-3 py-2.5 md:py-2 text-sm font-bold bg-white text-gray-700 outline-none shadow-sm cursor-pointer hover:bg-gray-50 transition"
                >
                  <option value="todos">Historico Total</option>
                  {mesesDisponibles.map((mes) => (
                    <option key={mes} value={mes}>{formatearNombreMes(mes)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <div className="min-w-0 bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
              <p className="text-gray-500 text-xs md:text-sm font-medium">Items Vendidos</p>
              <p className="text-xl md:text-3xl font-black mt-1 text-gray-800">{totalVendidos}</p>
            </div>
            <div className="min-w-0 bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-green-500">
              <p className="text-gray-500 text-xs md:text-sm font-medium">Ganancia Neta (USD)</p>
              <p className="text-xl md:text-3xl font-black mt-1 text-green-600 break-words">$ {fmt(gananciaVentasUSD)}</p>
            </div>
            <div className="min-w-0 bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-emerald-400 col-span-2 md:col-span-1">
              <p className="text-gray-500 text-xs md:text-sm font-medium">Ganancia (ARS, al dolar de hoy)</p>
              <p className="text-xl md:text-3xl font-black mt-1 text-emerald-600 break-words">$ {fmt(gananciaVentasARS)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {datosGrafico.length > 0 && (
              <div className="min-w-0 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-xs md:text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider text-center">
                  Ganancias Unificadas (Ultimos 6 Meses, USD)
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGrafico}>
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                      <Bar dataKey="Ganancia" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="min-w-0 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
              <div className="flex-grow divide-y divide-gray-100">
                {ventasPaginadas.map((item) => {
                  const ganancia = item.precio_usd - item.costo_usd;
                  return (
                    <div key={item.categoria + '-' + item.id} className="p-3 md:p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                          {item.categoria} - {item.fecha_venta ? new Date(item.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha'}
                        </span>
                        <div className="font-semibold text-gray-800 text-sm break-words">
                          {item.categoria === 'celular' ? item.modelo + ' ' + (item.capacidad || '') : item.tipo + ' - ' + item.modelo}
                          <CirculoColor color={item.color} />
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span
                          className={
                            'font-bold text-sm px-2 py-1 rounded whitespace-nowrap ' +
                            (ganancia < 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50')
                          }
                        >
                          {ganancia < 0 ? '-' : '+'} $ {fmt(Math.abs(ganancia))}
                        </span>
                        <button
                          onClick={() => confirmarAnulacion(item)}
                          className="text-[11px] font-bold text-gray-400 hover:text-red-500 hover:underline py-1"
                        >
                          Anular venta
                        </button>
                      </div>
                    </div>
                  );
                })}
                {ventasFiltradas.length === 0 && <p className="text-center p-8 text-gray-500">No hay ventas registradas.</p>}
              </div>
              {totalPaginas > 1 && (
                <div className="bg-gray-50 p-3 md:p-4 border-t border-gray-200 flex justify-between items-center gap-2 mt-auto">
                  <button
                    onClick={() => setPaginaActual(Math.max(1, pagina - 1))}
                    disabled={pagina === 1}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="text-xs font-medium text-gray-600">Pag {pagina} de {totalPaginas}</span>
                  <button
                    onClick={() => setPaginaActual(Math.min(totalPaginas, pagina + 1))}
                    disabled={pagina === totalPaginas}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-12 text-center flex flex-col items-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Desarrollado por</span>
        <a
          href="https://www.instagram.com/lambdasoluciones/"
          target="_blank"
          rel="noreferrer"
          className="font-bold text-xs uppercase tracking-wide text-blue-600 hover:text-blue-800 transition"
        >
          LAMBDA SOLUCIONES
        </a>
      </div>

      {/* MENU DESPLEGABLE DE OPCIONES (posicion fija, no se recorta por el scroll de la lista) */}
      {menu && (
        <Fragment>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
            style={{ top: menu.top, right: menu.right }}
          >
            <div className="flex flex-col">
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  if (tabla === 'celulares') iniciarEdicionCelular(item);
                  else iniciarEdicionAccesorio(item);
                }}
                className="px-4 py-3 text-sm font-bold text-blue-600 bg-white hover:bg-blue-50 text-left border-b border-gray-50"
              >
                Editar
              </button>
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  confirmarVenta(item, tabla);
                }}
                className="px-4 py-3 text-sm font-bold text-green-700 bg-white hover:bg-green-50 text-left border-b border-gray-50"
              >
                Vendido
              </button>
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  confirmarBorrado(item, tabla);
                }}
                className="px-4 py-3 text-sm font-bold text-red-500 bg-white hover:bg-red-50 text-left"
              >
                Borrar
              </button>
            </div>
          </div>
        </Fragment>
      )}

      {/* DIALOGO DE CONFIRMACION */}
      {dialogo && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">{dialogo.titulo}</h2>
            <p className="text-sm text-gray-600 mt-1 break-words">{dialogo.texto}</p>
            <div className="flex flex-col gap-2 mt-4">
              {dialogo.botones.map((boton) => (
                <button
                  key={boton.etiqueta}
                  type="button"
                  disabled={guardando}
                  onClick={conBloqueo(async () => {
                    setDialogo(null);
                    await boton.accion();
                  })}
                  className={'text-white px-4 py-2.5 rounded-lg text-sm font-bold transition disabled:opacity-60 ' + boton.clase}
                >
                  {boton.etiqueta}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDialogo(null)}
                className="bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-300 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VENTA */}
      {venta && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800">Registrar Venta</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">
              {venta.tabla === 'celulares'
                ? venta.item.modelo + ' ' + (venta.item.capacidad || '') + ' - Bateria ' + venta.item.bateria + '%'
                : venta.item.tipo + ' - ' + venta.item.modelo}
              {venta.item.color ? ' - ' + venta.item.color : ''}
            </p>

            <label className="text-xs font-bold text-gray-600 mt-4 mb-1 block">
              Cuantas unidades vendiste? (hay {venta.item.cantidad} en stock)
            </label>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-label="Restar una unidad"
                onClick={() => setVenta({ ...venta, cantidad: Math.max(1, cantidadVenta - 1) })}
                disabled={cantidadVenta <= 1}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max={venta.item.cantidad}
                value={venta.cantidad}
                onChange={(e) => setVenta({ ...venta, cantidad: e.target.value })}
                onBlur={() => setVenta({ ...venta, cantidad: cantidadVenta })}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2.5 text-center text-lg font-black text-gray-800 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                aria-label="Sumar una unidad"
                onClick={() => setVenta({ ...venta, cantidad: Math.min(venta.item.cantidad, cantidadVenta + 1) })}
                disabled={cantidadVenta >= venta.item.cantidad}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                +
              </button>
            </div>
            {venta.item.cantidad > 1 && (
              <button
                type="button"
                onClick={() => setVenta({ ...venta, cantidad: venta.item.cantidad })}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline py-1"
              >
                Vender todas ({venta.item.cantidad}){admiteMayorista ? ' - podes aplicar el descuento mayorista abajo' : ''}
              </button>
            )}

            {admiteMayorista && (
              <label
                className={
                  'mt-3 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3 ' +
                  (cantidadVenta >= 2 ? 'cursor-pointer' : 'opacity-60')
                }
              >
                <input
                  type="checkbox"
                  checked={mayoristaActivo}
                  disabled={cantidadVenta < 2}
                  onChange={(e) => setVenta({ ...venta, mayorista: e.target.checked })}
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-blue-800">
                    Aplicar descuento mayorista: {descuentoMayorista}% menos por unidad
                  </span>
                  <span className="block text-[11px] font-medium text-blue-700 mt-0.5">
                    {cantidadVenta >= 2
                      ? 'Es el porcentaje "Desc. mayorista" configurado arriba en el panel. Se descuenta de cada unidad de esta venta.'
                      : 'Disponible al vender 2 o mas unidades. Usa el porcentaje "Desc. mayorista" configurado arriba en el panel.'}
                  </span>
                </span>
              </label>
            )}

            <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-3">
              {mayoristaActivo && (
                <div className="flex justify-between gap-2 text-xs font-semibold text-gray-500">
                  <span>Precio de lista por unidad</span>
                  <span className="line-through">USD {fmt(venta.item.precio_usd)}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 text-xs font-semibold text-gray-600">
                <span>{mayoristaActivo ? 'Precio mayorista por unidad (-' + descuentoMayorista + '%)' : 'Precio por unidad'}</span>
                <span>USD {fmt(precioVenta)}</span>
              </div>
              <div className="flex justify-between gap-2 mt-1 text-base font-black text-green-700">
                <span>Total ({cantidadVenta} u.)</span>
                <span>USD {fmt(precioVenta * cantidadVenta)}</span>
              </div>
              <p className="text-right text-xs font-bold text-gray-500 mt-0.5">ARS $ {fmt(Math.round(precioVenta * cantidadVenta * cot))}</p>
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setVenta(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="button" onClick={conBloqueo(ejecutarVenta)} disabled={guardando} className="disabled:opacity-60 flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-green-700 transition">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PERMUTAS */}
      {showPermutaModal && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800">Registrar Permuta</h2>
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mt-3 mb-2">
              1. Equipo que recibis (entra al stock)
            </p>
            <form onSubmit={conBloqueo(handleGuardarPermuta)} autoComplete="off" className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Modelo</label>
                <input required name="modelo" value={formPermuta.modelo} onChange={handleChangePermuta} type="text" placeholder="Ej: 11 PRO" className={claseInputModal} />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Capacidad</label>
                <input required name="capacidad" value={formPermuta.capacidad} onChange={handleChangePermuta} type="text" placeholder="Ej: 64" className={claseInputModal} />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Bateria %</label>
                <input required name="bateria" value={formPermuta.bateria} onChange={handleChangePermuta} type="number" min="0" max="100" placeholder="Ej: 82" className={claseInputModal} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Color</label>
                <input required name="color" list="lista-colores" value={formPermuta.color} onChange={handleChangePermuta} type="text" placeholder="Elegir o escribir" className={claseInputModal} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Detalles (estado, rayas, caja, etc.)</label>
                <input name="detalles" value={formPermuta.detalles} onChange={handleChangePermuta} type="text" placeholder="Ej: Detalle en pantalla, sin caja" className={claseInputModal} />
              </div>
              <div className="col-span-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="text-xs font-bold text-blue-800 mb-1 block">Precio tomado (Pesos ARS)</label>
                <input required name="precio_ars" value={formPermuta.precio_ars} onChange={handleChangePermuta} type="number" min="0" placeholder="Ej: 450000" className="border border-blue-200 p-2.5 rounded-lg w-full bg-white outline-none font-bold text-gray-800" />
                <p className="text-xs text-blue-600 mt-2 font-bold text-right">
                  Costo: USD {formPermuta.precio_ars && cot ? (formPermuta.precio_ars / cot).toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="col-span-2 bg-green-50 p-3 rounded-lg border border-green-100">
                <label className="text-xs font-bold text-green-800 mb-1 block">Precio de venta (Pesos ARS) - opcional</label>
                <input name="precio_venta_ars" value={formPermuta.precio_venta_ars} onChange={handleChangePermuta} type="number" min="0" placeholder="Vacio = igual al costo" className="border border-green-200 p-2.5 rounded-lg w-full bg-white outline-none font-bold text-gray-800" />
                <p className="text-xs text-green-700 mt-2 font-bold text-right">
                  Venta: USD{' '}
                  {formPermuta.precio_venta_ars && cot
                    ? (formPermuta.precio_venta_ars / cot).toFixed(2)
                    : formPermuta.precio_ars && cot
                    ? (formPermuta.precio_ars / cot).toFixed(2)
                    : '0.00'}
                </p>
              </div>
              <div className="col-span-2 border-t border-gray-200 pt-3">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">
                  2. Equipo que entregas (sale del stock) - opcional
                </p>
                <select
                  name="entregaId"
                  value={formPermuta.entregaId}
                  onChange={handleChangePermuta}
                  className={claseInputModal + ' text-gray-700'}
                >
                  <option value="">No entrego equipo / lo cargo despues</option>
                  {stockCelulares.map((c) => (
                    <option key={c.ids[0]} value={c.ids[0]}>
                      {c.modelo} {c.capacidad} {c.color} - Bat {c.bateria}% - ARS $ {fmt(Math.round(c.precio_usd * cot))} ({c.cantidad} u.)
                    </option>
                  ))}
                </select>
                {lotePermuta && (
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-semibold text-gray-600">
                    <div className="flex justify-between gap-2">
                      <span>Precio del equipo que entregas</span>
                      <span>ARS $ {fmt(Math.round(lotePermuta.precio_usd * cot))}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-1">
                      <span>Menos el equipo que recibis</span>
                      <span>ARS $ {fmt(Number(formPermuta.precio_ars) || 0)}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-1 text-sm font-black text-gray-900">
                      <span>Diferencia a cobrar</span>
                      <span>ARS $ {fmt(Math.round(lotePermuta.precio_usd * cot) - (Number(formPermuta.precio_ars) || 0))}</span>
                    </div>
                    <p className="mt-2 font-medium text-gray-500">Al guardar, una unidad de este equipo queda como vendida.</p>
                  </div>
                )}
              </div>
              <div className="col-span-2 flex gap-3 mt-1">
                <button type="button" onClick={() => setShowPermutaModal(false)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-purple-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-purple-700 transition">
                  Guardar Permuta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
