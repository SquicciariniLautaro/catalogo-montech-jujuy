import { useState, useEffect, useRef, Fragment } from 'react';
import { supabase } from './supabase';
import toast from 'react-hot-toast';
import FirmaLambda from './FirmaLambda';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

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

// Colores del grafico por mes: paleta categorica en orden fijo
const COLORES_GRAFICO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const ALTO_MENU = 335;

// Columnas compartidas por el encabezado y las filas del stock en escritorio
const COLUMNAS_STOCK = 'md:grid md:grid-cols-[minmax(0,1fr)_17rem_8rem] md:gap-4 md:items-center';

const claseInput = 'border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none w-full min-w-0';
const claseInputModal = 'border border-gray-300 p-2.5 rounded-lg w-full min-w-0 bg-gray-50 focus:bg-white outline-none';
const claseInputEdicion = 'mt-1 border border-gray-300 p-2 rounded-lg w-full min-w-0 bg-white text-gray-800 text-base md:text-sm font-medium normal-case outline-none focus:border-blue-500';

const fmt = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

// Redondea a 4 decimales: los precios en USD admiten mas de 2 decimales para que
// el precio en pesos pueda quedar en un numero redondo
const redondear = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

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

// Familia de un modelo: el nombre normalizado sin la palabra "iPhone", para que "iPhone 13" y
// "13" queden juntos.
const familiaDeModelo = (modelo) => normalizar(modelo).replace(/^IPHONE\s*/, '');

// iPhone que se cargan sin numero adelante ("SE 2022", "XR", "XS MAX")
const IPHONE_SIN_NUMERO = ['SE', 'X', 'XR', 'XS'];

// Marca de un celular segun su modelo. Los iPhone ("13 PRO", "iPhone 13", "XR") devuelven '';
// el resto lleva la marca como primera palabra ("Samsung A55" -> "SAMSUNG").
const marcaDeModelo = (modelo) => {
  const texto = familiaDeModelo(modelo);
  const primera = texto.split(' ')[0];
  if (texto === '' || /^\d/.test(texto) || IPHONE_SIN_NUMERO.includes(primera)) return '';
  return primera;
};

// Orden jerarquico, igual en el catalogo y en el panel:
// 1. Marca: primero los iPhone, despues cada marca junta en orden alfabetico.
// 2. Familia del modelo en orden natural (13, 13 PRO, 14, 14 PRO...); en accesorios, el tipo.
// 3. Solo dentro de cada familia, de menor a mayor precio.
// Asi un equipo de gama alta vendido barato no queda por encima de los de gama menor.
const ordenarPorPrecio = (lista, obtenerFamilia, desempate, obtenerMarca = () => '') => {
  const precio = (item) => Number(item.precio_usd) || 0;
  return [...lista].sort((a, b) => {
    const ma = obtenerMarca(a);
    const mb = obtenerMarca(b);
    if (ma !== mb) return ma === '' ? -1 : mb === '' ? 1 : comparar(ma, mb);
    const fa = normalizar(obtenerFamilia(a));
    const fb = normalizar(obtenerFamilia(b));
    // Los iPhone con letras (X, XR, XS, SE) son de gama mas baja: van antes que los numerados
    const conNumero = (f) => (/^\d/.test(f) ? 1 : 0);
    if (fa !== fb) return conNumero(fa) - conNumero(fb) || comparar(fa, fb);
    return precio(a) - precio(b) || desempate(a, b);
  });
};

// Orden del stock de celulares y de accesorios (el mismo que el catalogo publico)
const ordenarCelulares = (lista) =>
  ordenarPorPrecio(lista, (c) => familiaDeModelo(c.modelo), compararCelulares, (c) => marcaDeModelo(c.modelo));
const ordenarAccesorios = (lista) => ordenarPorPrecio(lista, (x) => x.tipo, compararAccesorios);

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
    if (!acc[k]) acc[k] = { ...f, cantidad: 0, ids: [], costoTotal: 0, precioTotal: 0, promediado: false };
    acc[k].cantidad += 1;
    acc[k].ids.push(f.id);
    if (f.promediado) acc[k].promediado = true;
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

// ---------- Precios por tramo de cantidad (accesorios) ----------
// Cada accesorio puede tener tramos { desde, moneda: 'usd' | 'ars', precio }. Para una cantidad
// se usa el tramo con el mayor "desde" que no la supere; si no hay ninguno aplicable, el precio
// de lista. Devuelve el precio por unidad en USD y en pesos.
const precioPorCantidad = (tramos, cantidad, precioListaUsd, cot) => {
  let tramo = null;
  (tramos || []).forEach((t) => {
    if (t.desde <= cantidad && (!tramo || t.desde > tramo.desde)) tramo = t;
  });
  const lista = Number(precioListaUsd) || 0;
  if (!tramo) return { tramo: null, unitarioUsd: lista, unitarioArs: lista * cot };
  return tramo.moneda === 'ars'
    ? { tramo, unitarioUsd: cot ? tramo.precio / cot : 0, unitarioArs: tramo.precio }
    : { tramo, unitarioUsd: tramo.precio, unitarioArs: tramo.precio * cot };
};

// Rangos de la escala completa para mostrarla: "1 a 4 u.", "5 a 9 u.", "10 o mas u."
const describirTramos = (tramos, precioListaUsd, cot) => {
  const orden = [...tramos].sort((a, b) => a.desde - b.desde);
  const filas = [];
  if (orden.length > 0 && orden[0].desde > 1) {
    const hasta = orden[0].desde - 1;
    filas.push({ rango: hasta === 1 ? '1 u.' : '1 a ' + hasta + ' u.', ars: Math.round((Number(precioListaUsd) || 0) * cot) });
  }
  orden.forEach((t, i) => {
    const siguiente = orden[i + 1];
    const rango = siguiente
      ? siguiente.desde - 1 === t.desde
        ? t.desde + ' u.'
        : t.desde + ' a ' + (siguiente.desde - 1) + ' u.'
      : t.desde + ' o mas u.';
    filas.push({ rango, ars: Math.round(precioPorCantidad([t], t.desde, 0, cot).unitarioArs) });
  });
  return filas;
};

// Los ids viajan en la direccion de la consulta: con lotes grandes (cientos de unidades) hay
// que mandarlos por tandas para no superar el largo maximo
const TAMANO_TANDA = 150;
async function porTandas(ids, operacion) {
  for (let desde = 0; desde < ids.length; desde += TAMANO_TANDA) {
    const resultado = await operacion(ids.slice(desde, desde + TAMANO_TANDA));
    if (resultado.error) return resultado;
  }
  return { error: null };
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

  // El lote queda marcado como promediado si se juntaron unidades con distinto costo o precio
  const mezcla = mismos.some(
    (e) => Number(e.costo_usd) !== Number(filaBase.costo_usd) || Number(e.precio_usd) !== Number(filaBase.precio_usd)
  );
  const promediado = mezcla || mismos.some((e) => e.promediado === true);

  const { data: insertados, error } = await supabase.from(tabla).insert(nuevos).select('id');
  if (error) return { error };

  const idsDesactualizados = mismos
    .filter((e) => Number(e.costo_usd) !== costo || Number(e.precio_usd) !== precio)
    .map((e) => e.id);
  if (idsDesactualizados.length > 0) {
    const { error: errorUpdate } = await porTandas(idsDesactualizados, (tanda) => supabase
      .from(tabla)
      .update({ costo_usd: costo, precio_usd: precio })
      .in('id', tanda));
    if (errorUpdate) return { error: errorUpdate };
  }

  // La marca vive en una columna opcional: si la base todavia no la tiene, se ignora el error
  if (promediado) {
    const idsLote = [...mismos.map((e) => e.id), ...(insertados || []).map((n) => n.id)];
    await porTandas(idsLote, (tanda) => supabase.from(tabla).update({ promediado: true }).in('id', tanda));
  }

  return { error: null, costo, precio, unificadas: mismos.length };
}

// Cuentas a cobrar: equipos entregados a un revendedor o senados por un cliente. Las dos
// funcionan igual (carrito, pagos a cuenta, saldo, cierre); cambian el estado de la unidad,
// la tabla donde se guardan los pagos y los textos. Ninguna de las dos se muestra en el catalogo
// publico; en el stock del panel figuran como "Revendedores: N" o "Señas: N" en su lote.
const CUENTAS = {
  revendedor: {
    estado: 'revendedor',
    tablaPagos: 'pagos_revendedor',
    carrito: 'Carrito revendedor',
    agregado: 'Agregado al carrito de revendedor',
    etiquetaNombre: 'Nombre del revendedor',
    faltaNombre: 'Coloque el nombre del revendedor',
    elegirNombre: 'Elegir revendedor...',
    nombreNuevo: 'Nuevo revendedor (escribir nombre)',
    etiquetaMonto: 'Monto entregado ahora (pesos ARS)',
    ayudaMonto: '0 si no entrego nada',
    notaCarrito: 'Los equipos salen del stock disponible y del catalogo publico. Cuando el saldo llega a cero, pasan solos al historial de ventas.',
    carritoVacio: 'El carrito esta vacio. Agrega equipos desde Opciones y luego "Al carrito revendedor".',
    confirmar: 'Confirmar entrega',
    asignadas: ' unidad(es) entregada(s) a ',
    unidadesTotales: 'Unidades en la calle',
    explicacion:
      'Equipos entregados a consignacion. No aparecen en el catalogo publico ni se pueden vender desde el stock: ahi figuran como "Revendedores" en su lote. Cuando un revendedor paga un equipo, tocas "Pagado" y pasa al historial de ventas. Para entregar equipos, usa Opciones y luego "Al carrito revendedor" en el stock.',
    sinCuentas: 'Todavia no hay revendedores. Agrega uno con el boton de arriba o entregale equipos desde el carrito.',
    enSuPoder: ' unidad(es) en su poder',
    sinEquipos: 'Sin equipos en su poder.',
    desde: 'Entregado el ',
    devolver: 'Devolvio',
    tituloDevolucion: 'El revendedor devolvio',
    preguntaDevolucion: 'Cuantas unidades devolvio?',
    notaDevolucion: 'Vuelve al stock disponible con su precio de venta original.',
    cobro: 'cobro a cuenta',
    cobroCsv: 'Cobro a cuenta (estimado)',
  },
  sena: {
    estado: 'senado',
    tablaPagos: 'pagos_sena',
    carrito: 'Carrito de señas',
    agregado: 'Agregado al carrito de señas',
    etiquetaNombre: 'Nombre de quien seña',
    faltaNombre: 'Coloque el nombre de quien seña',
    elegirNombre: 'Elegir persona...',
    nombreNuevo: 'Otra persona (escribir nombre)',
    etiquetaMonto: 'Monto de la seña (pesos ARS)',
    ayudaMonto: 'Cuanto dejo de seña',
    notaCarrito: 'Los equipos salen del stock disponible y del catalogo publico. Cuando el saldo llega a cero, pasan solos al historial de ventas.',
    carritoVacio: 'El carrito esta vacio. Agrega equipos desde Opciones y luego "Señar".',
    confirmar: 'Confirmar seña',
    asignadas: ' unidad(es) señada(s) por ',
    unidadesTotales: 'Unidades señadas',
    explicacion:
      'Equipos reservados con una seña. No aparecen en el catalogo publico ni se pueden vender desde el stock: ahi figuran como "Señas" en su lote. Cuando el cliente paga el resto, tocas "Pagado" (o registras el pago) y pasa al historial de ventas. Si se cae la venta, tocas "Cancelo" y el equipo vuelve al stock. Para señar un equipo, usa Opciones y luego "Señar" en el stock.',
    sinCuentas: 'No hay equipos señados. Para señar uno, usa Opciones y luego "Señar" en el stock.',
    enSuPoder: ' unidad(es) señada(s)',
    sinEquipos: 'Sin equipos señados.',
    desde: 'Señado el ',
    devolver: 'Cancelo',
    tituloDevolucion: 'Se cancelo la seña',
    preguntaDevolucion: 'Cuantas unidades se cancelan?',
    notaDevolucion: 'Vuelve al stock disponible y al catalogo publico. Lo que ya entrego queda a su favor hasta que cierres la cuenta.',
    cobro: 'seña',
    cobroCsv: 'Seña (estimado)',
  },
};

// El costo se pasa a pesos con la cotizacion de costo y la venta con la de venta: la ganancia
// es la diferencia en pesos, y en dolares se expresa a la cotizacion de venta.
const calcularStats = (arrayStock, cot, cotCosto) => {
  const totalQty = arrayStock.reduce((acc, item) => acc + item.cantidad, 0);
  const totalCosto = arrayStock.reduce((acc, item) => acc + item.costoTotal, 0);
  const totalVenta = arrayStock.reduce((acc, item) => acc + item.precioTotal, 0);
  const costoArs = totalCosto * cotCosto;
  const gananciaArs = totalVenta * cot - costoArs;
  return { totalQty, totalCosto, totalVenta, costoArs, gananciaUsd: cot ? gananciaArs / cot : totalVenta - totalCosto, gananciaArs };
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

// Desplegable con la opcion de escribir un valor que no esta en la lista. Reemplaza al campo
// con sugerencias (<datalist>), que en los celulares no muestra la flecha ni la lista: solo
// sugiere arriba del teclado. Si la lista esta vacia, queda solo el campo para escribir.
const VALOR_OTRO = '__otro__';
function ListaConOtro({ opciones, valor, onCambio, clase, vacio, otro, placeholderOtro, ariaLabel, requerido = false, empezarEscribiendo = false }) {
  const actual = String(valor || '').trim();
  const enLista = opciones.find((o) => o.toLowerCase() === actual.toLowerCase());
  const [escribiendo, setEscribiendo] = useState(empezarEscribiendo || (actual !== '' && !enLista));

  const elegir = (e) => {
    if (e.target.value === VALOR_OTRO) {
      setEscribiendo(true);
      onCambio('');
      return;
    }
    setEscribiendo(false);
    onCambio(e.target.value);
  };

  const campo = (
    <input
      type="text"
      required={requerido}
      value={valor || ''}
      onChange={(e) => onCambio(e.target.value)}
      placeholder={placeholderOtro}
      aria-label={ariaLabel}
      className={clase}
    />
  );
  if (opciones.length === 0) return campo;

  return (
    <div className="min-w-0 flex flex-col gap-2">
      <select
        className={clase}
        value={escribiendo ? VALOR_OTRO : enLista || ''}
        onChange={elegir}
        required={requerido && !escribiendo}
        aria-label={ariaLabel}
      >
        <option value="" disabled>{vacio}</option>
        {opciones.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={VALOR_OTRO}>{otro}</option>
      </select>
      {escribiendo && campo}
    </div>
  );
}

// Desplegable de colores para los formularios de edicion. "Otro" permite escribir un color o
// diseno que no esta en la lista, asi no se pierden los valores personalizados.
function SelectorColor({ etiqueta, valor, onCambio }) {
  const actual = String(valor || '').trim();
  const canonico = COLORES.find((c) => c.toLowerCase() === actual.toLowerCase());
  const [otro, setOtro] = useState(actual !== '' && !canonico);

  const elegir = (e) => {
    if (e.target.value === 'OTRO') {
      setOtro(true);
      return;
    }
    setOtro(false);
    onCambio(e.target.value);
  };

  return (
    <div className="min-w-0">
      <label className="block min-w-0 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
        {etiqueta}
        <select className={claseInputEdicion} value={otro ? 'OTRO' : canonico || ''} onChange={elegir}>
          <option value="" disabled>Elegir color...</option>
          {COLORES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="OTRO">Otro (escribir)</option>
        </select>
      </label>
      {otro && (
        <input
          type="text"
          value={valor || ''}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="Escribi el color o diseno"
          aria-label={etiqueta + ' personalizado'}
          className={claseInputEdicion}
        />
      )}
    </div>
  );
}

// "6000000.5" -> "6.000.000,5" (formato argentino) para mostrar dentro del campo
const formatearMiles = (crudo) => {
  const texto = String(crudo === null || crudo === undefined ? '' : crudo);
  if (texto === '') return '';
  const [entero, decimales] = texto.split('.');
  const enteroConPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales === undefined ? enteroConPuntos : enteroConPuntos + ',' + decimales;
};

// Lo que escribe el usuario ("6.000.000,5") -> numero puro como texto ("6000000.5")
const limpiarPesos = (escrito) => {
  const texto = String(escrito).replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  const corte = texto.indexOf('.');
  return corte === -1 ? texto : texto.slice(0, corte + 1) + texto.slice(corte + 1).replace(/\./g, '');
};

// Campo para montos en pesos: muestra los puntos de miles mientras se escribe, pero entrega
// el numero puro (sin puntos) para que los calculos y la conversion a USD no cambien
function InputPesos({ value, onChange, ...props }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatearMiles(value)}
      onChange={(e) => onChange(limpiarPesos(e.target.value))}
      {...props}
    />
  );
}

// Equivalente en pesos de un monto en USD, para mostrar debajo del campo mientras se escribe
function PesosDe({ usd, cot }) {
  const monto = parseFloat(usd);
  return (
    <span className="block h-3 mt-1 ml-1 text-[10px] font-bold text-green-600 normal-case tracking-normal">
      {monto >= 0 ? 'ARS $ ' + fmt(Math.round(monto * cot)) : ''}
    </span>
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
        <p className={claseValor + ' text-gray-800'}>
          $ {fmt(stats.totalCosto)}
          <span className="text-[10px] text-gray-500 block font-semibold mt-0.5">ARS $ {fmt(Math.round(stats.costoArs))}</span>
        </p>
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
function DatoStock({ etiqueta, valor, clase, detalle }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide">{etiqueta}</span>
      <span className={'block text-sm font-bold break-words ' + clase}>{valor}</span>
      {detalle && <span className="block text-[10px] font-semibold text-gray-500 break-words">{detalle}</span>}
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

// Flecha que gira cuando la seccion esta abierta
function IconoFlecha({ abierto }) {
  return (
    <svg
      className={'w-4 h-4 shrink-0 text-gray-400 transition-transform ' + (abierto ? 'rotate-180' : '')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Agrupa una lista ya ordenada en familias consecutivas (modelo o tipo)
const agruparFamilias = (lista, obtenerNombre) => {
  const familias = [];
  lista.forEach((item) => {
    const nombre = String(obtenerNombre(item) || 'Sin nombre').trim();
    const clave = normalizar(nombre);
    const ultima = familias[familias.length - 1];
    const familia =
      ultima && ultima.clave === clave
        ? ultima
        : familias[familias.push({ clave, nombre, items: [], unidades: 0, conRevendedores: 0, senadas: 0 }) - 1];
    familia.items.push(item);
    familia.unidades += item.cantidad;
    familia.conRevendedores += item.fuera ? item.fuera.revendedor : 0;
    familia.senadas += item.fuera ? item.fuera.sena : 0;
  });
  return familias;
};

// Cuantas unidades de un lote (o de una familia) no estan en el local: las tienen los
// revendedores o estan senadas. Texto oscuro sobre fondo claro para que se lea en cualquier navegador.
function UnidadesFuera({ revendedores, senas, className = '' }) {
  if (!revendedores && !senas) return null;
  const clase = 'px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ';
  return (
    <span className={'flex flex-wrap items-center gap-1 ' + className}>
      {revendedores > 0 && (
        <span className={clase + 'border-purple-200 bg-purple-50 text-purple-700'} title="Unidades de este lote que tienen los revendedores">
          Revendedores: {revendedores}
        </span>
      )}
      {senas > 0 && (
        <span className={clase + 'border-amber-200 bg-amber-50 text-amber-700'} title="Unidades de este lote que estan señadas">
          Señas: {senas}
        </span>
      )}
    </span>
  );
}

// Encabezado de una familia del stock: se toca para abrir o cerrar sus lotes
function EncabezadoFamilia({ familia, abierta, cot, onAlternar }) {
  // El "desde" sale solo de los lotes que tienen unidades en el local
  const conStock = familia.items.filter((i) => i.cantidad > 0);
  const precioMinimo = conStock.length > 0 ? Math.min(...conStock.map((i) => Number(i.precio_usd) || 0)) : 0;
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierta}
      className="w-full flex items-center gap-2 px-3 md:px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-left transition"
    >
      <span className="min-w-0 flex-1 truncate font-black text-gray-800 text-sm uppercase tracking-wide">{familia.nombre}</span>
      {/* En celulares, lo que esta fuera del local va debajo del resumen; en escritorio, al lado */}
      <span className="shrink-0 flex flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-2">
        <span className="text-[11px] font-semibold text-gray-500">
          {conStock.length > 0
            ? familia.unidades + ' u. - desde $ ' + fmt(Math.round(precioMinimo * cot))
            : '0 u. para vender'}
        </span>
        <UnidadesFuera revendedores={familia.conRevendedores} senas={familia.senadas} className="justify-end" />
      </span>
      <IconoFlecha abierto={abierta} />
    </button>
  );
}

// Fila de stock. En celulares es un renglon compacto que se abre al tocarlo para ver los
// precios y las acciones; en escritorio es una fila de tres columnas siempre visible.
function FilaStock({ item, titulo, subtitulo, cot, cotCosto, onOpciones }) {
  const [abierto, setAbierto] = useState(false);
  // Lote sin unidades en el local: todas las tienen los revendedores o estan senadas
  const sinStock = item.cantidad === 0;
  const claseCantidad =
    'shrink-0 px-2 py-0.5 rounded text-xs font-bold shadow-sm ' +
    (sinStock ? 'bg-gray-200 text-gray-700 border border-gray-300' : 'bg-blue-600 text-white');
  const fuera = item.fuera || { revendedor: 0, sena: 0 };
  return (
    <div className="hover:bg-gray-50 transition">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="md:hidden w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className={claseCantidad}>{item.cantidad} u.</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-bold text-gray-900 text-sm">{titulo}</span>
            <CirculoColor color={item.color} soloCirculo />
          </span>
          <span className="block truncate text-[11px] font-medium text-gray-500">
            {[item.color, ...subtitulo].filter(Boolean).join(' - ')}
          </span>
          <UnidadesFuera revendedores={fuera.revendedor} senas={fuera.sena} className="mt-1" />
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold text-gray-800">$ {fmt(Math.round(item.precio_usd * cot))}</span>
          {item.promediado && <span className="block text-[9px] font-bold text-blue-500 uppercase tracking-wide">Promediado</span>}
        </span>
        <IconoFlecha abierto={abierto} />
      </button>

      <div className={(abierto ? 'flex' : 'hidden') + ' flex-col gap-3 px-3 pb-3 md:px-4 md:py-3 ' + COLUMNAS_STOCK}>
        <div className="hidden md:block min-w-0">
          <div className="flex items-start gap-2">
            <span className={claseCantidad} title="Unidades en el local, disponibles para vender">
              {item.cantidad} u.
            </span>
            <span className="min-w-0 break-words font-bold text-gray-900 text-sm leading-tight">{titulo}</span>
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
          <UnidadesFuera revendedores={fuera.revendedor} senas={fuera.sena} className="mt-1.5" />
        </div>
        <div className="grid grid-cols-3 gap-2 bg-gray-50 md:bg-transparent rounded-lg p-2 md:p-0">
          <DatoStock
            etiqueta="Costo USD"
            valor={'$ ' + fmt(item.costo_usd)}
            clase="text-red-500"
            detalle={'ARS $ ' + fmt(Math.round(item.costo_usd * cotCosto))}
          />
          <DatoStock etiqueta="Venta USD" valor={'$ ' + fmt(item.precio_usd)} clase="text-green-600" />
          <DatoStock etiqueta="Venta ARS" valor={'$ ' + fmt(Math.round(item.precio_usd * cot))} clase="text-gray-800" />
          {item.promediado && (
            <span
              className="col-span-3 text-[9px] font-bold text-blue-500 uppercase tracking-wide"
              title="Costo y venta son el promedio ponderado de ingresos con distintos valores"
            >
              Promediado
            </span>
          )}
        </div>
        <div className="md:text-right">
          {sinStock && <span className="block mb-1 text-[10px] font-bold text-gray-500 leading-tight">Sin unidades en el local</span>}
          <button
            onClick={onOpciones}
            className="w-full md:w-auto bg-gray-200 text-gray-800 px-3 py-2.5 md:py-1.5 rounded-lg font-bold hover:bg-gray-300 transition text-xs shadow-sm"
          >
            Opciones
            <IconoChevron />
          </button>
        </div>
      </div>
    </div>
  );
}

// Aviso al editar un lote que no tiene unidades en el local
function AvisoEdicionFuera() {
  return (
    <p className="mb-2 text-[11px] font-semibold text-purple-700">
      Estas unidades las tienen revendedores o estan señadas. Se corrigen sus datos; lo que deben por ellas no cambia.
    </p>
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
  const [cotizacionCosto, setCotizacionCosto] = useState(''); // vacia = la misma que la de venta
  const [activeTab, setActiveTab] = useState('celulares');

  const [stockCelulares, setStockCelulares] = useState([]);
  const [stockAccesorios, setStockAccesorios] = useState([]);
  const [ventasGlobales, setVentasGlobales] = useState([]);
  const [enRevendedor, setEnRevendedor] = useState([]); // unidades entregadas a consignacion
  const [enSena, setEnSena] = useState([]); // unidades senadas por un cliente
  const [escalas, setEscalas] = useState({}); // precios por cantidad: clave del accesorio -> tramos
  const [editorEscala, setEditorEscala] = useState(null); // { lote, filas: [{ desde, moneda, precio }] }
  const [listaRevendedores, setListaRevendedores] = useState([]); // revendedores guardados
  const [revForm, setRevForm] = useState(null); // { id, nombre, celular, bloqueaNombre }
  const [carritoCelular, setCarritoCelular] = useState('');
  const [cargando, setCargando] = useState(true);

  const estadoInicialCelular = { modelo: '', capacidad: '', color: '', bateria: '', costo_usd: '', precio_usd: '', detalles: '', cantidad: 1 };
  const estadoInicialAccesorio = { tipo: '', modelo: '', color: '', costo_usd: '', precio_usd: '', detalles: '', cantidad: 1 };
  const estadoInicialPermuta = { modelo: '', capacidad: '', color: '', bateria: '', detalles: '', precio_ars: '', precio_venta_ars: '', entregaId: '' };

  const [formCelular, setFormCelular] = useState(estadoInicialCelular);
  const [ingresosGuardados, setIngresosGuardados] = useState(0); // reinicia los desplegables de color
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
  const [venta, setVenta] = useState(null); // { item, tabla, cantidad, precio (ARS por unidad, celulares), accesorios: [{ id, cantidad, modo, precio }] }
  const [busquedaStock, setBusquedaStock] = useState('');
  // En pantallas chicas el formulario de ingreso arranca cerrado; las familias del stock, siempre
  const [esEscritorio] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [formAbierto, setFormAbierto] = useState(null); // null = segun el tamano de pantalla
  const [familiasAbiertas, setFamiliasAbiertas] = useState({});
  const [revAbiertos, setRevAbiertos] = useState({}); // revendedores desplegados (todos arrancan cerrados)
  const [carrito, setCarrito] = useState([]); // [{ id, tabla, cantidad, precio (ARS por unidad) }]
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [carritoNombre, setCarritoNombre] = useState('');
  const [carritoCuenta, setCarritoCuenta] = useState('revendedor'); // 'revendedor' o 'sena'
  const [carritoEntregado, setCarritoEntregado] = useState('');
  const [pagosRevendedor, setPagosRevendedor] = useState([]); // pagos a cuenta todavia no aplicados
  const [pagosSena, setPagosSena] = useState([]); // lo entregado por las senas, todavia no aplicado
  const [pagoRevendedor, setPagoRevendedor] = useState(null); // { cuenta, nombre, monto (ARS) }
  const [edicionPago, setEdicionPago] = useState(null); // { cuenta, nombre, pago, monto (ARS) }
  const [edicionVenta, setEdicionVenta] = useState(null); // { item, precio (ARS por unidad) }
  const [suma, setSuma] = useState(null); // { item, tabla, cantidad }
  const [borrado, setBorrado] = useState(null); // { item, tabla, cantidad }
  const [resolucion, setResolucion] = useState(null); // { lote, destino, cantidad }
  const [dialogo, setDialogo] = useState(null); // { titulo, texto, botones: [{ etiqueta, clase, accion }] }
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);

  // Hay dos cotizaciones del dolar. La de venta pasa a pesos los precios, los cobros y los saldos
  // (y es la del catalogo publico). La de costo pasa a pesos lo que cuesta la mercaderia, porque
  // los proveedores la cotizan a otro valor. Si no se cargo una de costo, es la misma de venta.
  const cot = Number(cotizacion) || 0;
  const cotCosto = Number(cotizacionCosto) || cot;
  // Por cuanto se multiplica un costo en USD del stock para llevarlo a dolares de venta
  const factorCosto = cot ? cotCosto / cot : 1;

  // Cotizacion con la que se cerro una venta. Las ventas anteriores a que se guardara
  // ese dato usan la cotizacion actual.
  const cotizacionDe = (v) => Number(v.cotizacion_venta) || cot;
  // Cotizacion de costo del dia de la venta. Las ventas que no la tienen guardada usan la misma
  // cotizacion que la venta, asi su ganancia queda como estaba.
  const cotizacionCostoDe = (v) => Number(v.cotizacion_costo) || cotizacionDe(v);
  // Ganancia de una venta en dolares de venta: lo cobrado en pesos menos el costo en pesos
  // (cada uno a su cotizacion), dividido por la cotizacion de venta
  const gananciaDe = (v) => {
    const cotVenta = cotizacionDe(v);
    const factor = cotVenta ? cotizacionCostoDe(v) / cotVenta : 1;
    return (Number(v.precio_usd) || 0) - (Number(v.costo_usd) || 0) * factor;
  };

  // Parte del precio de una venta que se cobro con un equipo recibido en permuta (0 si no hubo)
  const permutaDe = (v) => Number(v.permuta_usd) || 0;
  // Lo que entro en plata por una venta: el precio menos el equipo recibido en permuta
  const cobradoDe = (v) => (Number(v.precio_usd) || 0) - permutaDe(v);

  // Marca unidades como vendidas y guarda las cotizaciones del dia (venta y costo), para que el
  // historial en pesos y la ganancia no cambien cuando se mueve el dolar. En celulares guarda
  // tambien el valor del equipo recibido en permuta (vacio si fue una venta comun). Esas columnas
  // son opcionales: si la base todavia no las tiene, registra la venta igual sin ese dato y avisa
  // cuales faltaron.
  async function marcarVendido(tabla, ids, cambios, fecha = new Date().toISOString()) {
    const datos = { estado: 'vendido', fecha_venta: fecha, cotizacion_venta: cot, cotizacion_costo: cotCosto, ...cambios };
    if (tabla === 'celulares' && datos.permuta_usd === undefined) datos.permuta_usd = null;
    const omitidas = [];
    for (;;) {
      const resultado = await porTandas(ids, (tanda) => supabase.from(tabla).update(datos).in('id', tanda));
      const falta =
        resultado.error &&
        ['cotizacion_venta', 'cotizacion_costo', 'permuta_usd'].find((c) => c in datos && String(resultado.error.message).includes(c));
      if (!falta) return { ...resultado, omitidas };
      delete datos[falta];
      omitidas.push(falta);
    }
  }

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

  const formVisible = formAbierto === null ? esEscritorio : formAbierto;

  // Las familias arrancan cerradas en cualquier pantalla y se abren al tocarlas.
  // Al buscar se abren todas para mostrar los resultados.
  const familiaAbierta = (tab, clave) => {
    if (busquedaStock.trim()) return true;
    return familiasAbiertas[tab + '|' + clave] === true;
  };
  const alternarFamilia = (tab, clave, abierta) =>
    setFamiliasAbiertas({ ...familiasAbiertas, [tab + '|' + clave]: !abierta });

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
    const [config, celDisponibles, accDisponibles, celVendidos, accVendidos, celRevendedor, accRevendedor, celSena, accSena] = await Promise.all([
      supabase.from('configuracion').select('*').eq('id', 1).single(),
      traerTodo(() => supabase.from('celulares').select('*').eq('estado', 'disponible').order('modelo', { ascending: true }).order('id')),
      traerTodo(() => supabase.from('accesorios').select('*').eq('estado', 'disponible').order('tipo', { ascending: true }).order('id')),
      traerTodo(() => supabase.from('celulares').select('*').eq('estado', 'vendido').order('id')),
      traerTodo(() => supabase.from('accesorios').select('*').eq('estado', 'vendido').order('id')),
      traerTodo(() => supabase.from('celulares').select('*').eq('estado', 'revendedor').order('id')),
      traerTodo(() => supabase.from('accesorios').select('*').eq('estado', 'revendedor').order('id')),
      traerTodo(() => supabase.from('celulares').select('*').eq('estado', 'senado').order('id')),
      traerTodo(() => supabase.from('accesorios').select('*').eq('estado', 'senado').order('id')),
    ]);

    const fallo = [config, celDisponibles, accDisponibles, celVendidos, accVendidos, celRevendedor, accRevendedor, celSena, accSena].find((r) => r.error);
    if (fallo) toast.error('Error al cargar datos: ' + fallo.error.message);

    if (config.data) {
      setCotizacion(config.data.cotizacion_dolar);
      // Columna opcional: sin ella (o vacia) la cotizacion de costo es la de venta
      setCotizacionCosto(config.data.cotizacion_costo || '');
    }
    if (celDisponibles.data) setStockCelulares(agruparStock(celDisponibles.data, claveCelular, ordenarCelulares));
    if (accDisponibles.data) setStockAccesorios(agruparStock(accDisponibles.data, claveAccesorio, ordenarAccesorios));

    const ventasUnificadas = [
      ...(celVendidos.data || []).map((v) => ({ ...v, categoria: 'celular' })),
      ...(accVendidos.data || []).map((v) => ({ ...v, categoria: 'accesorio' })),
    ];
    ventasUnificadas.sort((a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta));
    setVentasGlobales(ventasUnificadas);

    const pagos = await traerTodo(() =>
      supabase.from('pagos_revendedor').select('*').eq('aplicado', false).order('fecha')
    );
    setPagosRevendedor(pagos.error ? [] : pagos.data);

    // Pagos de las senas (tabla opcional: si falta, se toma como vacia)
    const pagosDeSenas = await traerTodo(() => supabase.from('pagos_sena').select('*').eq('aplicado', false).order('fecha'));
    setPagosSena(pagosDeSenas.error ? [] : pagosDeSenas.data);

    // Precios por cantidad de los accesorios (tabla opcional: si falta, se vende a precio de lista)
    const esc = await traerTodo(() => supabase.from('escalas_precio').select('*').order('desde'));
    const mapaEscalas = {};
    (esc.error ? [] : esc.data).forEach((r) => {
      (mapaEscalas[r.clave] = mapaEscalas[r.clave] || []).push({ id: r.id, desde: r.desde, moneda: r.moneda, precio: Number(r.precio) });
    });
    setEscalas(mapaEscalas);

    // Lista guardada de revendedores (tabla opcional). Los que ya figuran en equipos o pagos
    // y todavia no estan en la lista se guardan, para que no desaparezcan al cerrar su cuenta.
    const lista = await traerTodo(() => supabase.from('revendedores_lista').select('*').order('nombre'));
    let guardados = lista.error ? [] : lista.data;
    if (!lista.error) {
      const enUso = new Map();
      [...(celRevendedor.data || []), ...(accRevendedor.data || []), ...(pagos.error ? [] : pagos.data)].forEach((u) => {
        const nombre = String(u.revendedor || '').trim();
        if (nombre) enUso.set(normalizar(nombre), nombre);
      });
      const faltan = [...enUso.entries()]
        .filter(([clave]) => !guardados.some((r) => r.clave === clave))
        .map(([clave, nombre]) => ({ nombre, clave }));
      if (faltan.length > 0) {
        const { data: nuevos, error: errorLista } = await supabase
          .from('revendedores_lista')
          .upsert(faltan, { onConflict: 'clave', ignoreDuplicates: true })
          .select();
        if (!errorLista && nuevos) guardados = [...guardados, ...nuevos];
      }
    }
    setListaRevendedores(guardados);

    setEnRevendedor([
      ...(celRevendedor.data || []).map((u) => ({ ...u, tabla: 'celulares' })),
      ...(accRevendedor.data || []).map((u) => ({ ...u, tabla: 'accesorios' })),
    ]);
    setEnSena([
      ...(celSena.data || []).map((u) => ({ ...u, tabla: 'celulares' })),
      ...(accSena.data || []).map((u) => ({ ...u, tabla: 'accesorios' })),
    ]);

    if (mostrarLoader) setCargando(false);
  }

  async function handleActualizarConfiguracion() {
    const nuevaCotizacion = parseFloat(cotizacion);
    if (!(nuevaCotizacion > 0)) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    // La de costo se puede dejar vacia: en ese caso se usa la de venta
    const escrita = String(cotizacionCosto === null || cotizacionCosto === undefined ? '' : cotizacionCosto).trim();
    const nuevaCosto = escrita === '' ? null : parseFloat(escrita);
    if (nuevaCosto !== null && !(nuevaCosto > 0)) {
      toast.error('La cotizacion de costo debe ser mayor a cero (o vacia para usar la de venta)');
      return;
    }
    let { error } = await supabase
      .from('configuracion')
      .update({ cotizacion_dolar: nuevaCotizacion, cotizacion_costo: nuevaCosto })
      .eq('id', 1);
    // La cotizacion de costo vive en una columna opcional: si la base todavia no la tiene, se
    // guarda la de venta sola
    const faltaColumna = Boolean(error) && String(error.message).includes('cotizacion_costo');
    if (faltaColumna) {
      ({ error } = await supabase.from('configuracion').update({ cotizacion_dolar: nuevaCotizacion }).eq('id', 1));
    }
    if (error) toast.error('Error al guardar: ' + error.message);
    else if (faltaColumna && nuevaCosto !== null) {
      setCotizacionCosto('');
      toast.error(
        'Se guardo la cotizacion de venta, pero no la de costo: falta actualizar la base de datos (correr el SQL).',
        { duration: 8000 }
      );
    } else toast.success(nuevaCosto !== null ? 'Cotizaciones actualizadas' : 'Cotizacion actualizada');
  }

  // ---------- CSV ----------
  const escaparCsv = (valor) => '"' + String(valor === null || valor === undefined ? '' : valor).replace(/"/g, '""') + '"';

  const exportarCSV = () => {
    let csv = '﻿Categoria,Producto,Color,Fecha Venta,Cantidad,Costo USD,Venta USD,Recibido en permuta USD,Cobrado USD,Ganancia USD,Cotizacion,Cobrado ARS,Cotizacion costo\n';
    ventasAgrupadas.forEach((v) => {
      const fecha = v.fecha_venta ? new Date(v.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha';
      const ganancia = gananciaDe(v).toFixed(2);
      const cat = v.categoria === 'celular' ? 'Celular' : v.categoria === 'cobro' ? CUENTAS[v.cuenta].cobroCsv : 'Accesorio';
      const producto = v.categoria === 'celular' ? v.modelo + ' ' + v.capacidad : v.categoria === 'cobro' ? v.revendedor : v.tipo + ' ' + v.modelo;
      csv += [escaparCsv(cat), escaparCsv(producto), escaparCsv(v.color), escaparCsv(fecha), v.cantidad, redondear(v.costo_usd), redondear(v.precio_usd), redondear(permutaDe(v)), redondear(cobradoDe(v)), ganancia, cotizacionDe(v), Math.round(cobradoDe(v) * cotizacionDe(v)), cotizacionCostoDe(v)].join(',') + '\n';
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
      setIngresosGuardados((n) => n + 1);
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
      setIngresosGuardados((n) => n + 1);
      cargarDatos(false);
    } else toast.error('Error al guardar: ' + resultado.error.message);
  }

  async function handleGuardarPermuta(e) {
    e.preventDefault();
    if (!cot) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    // El valor de toma (en pesos) es el costo del equipo recibido: se guarda en USD a la cotizacion
    // de costo, para que su costo en pesos sea exactamente lo que se tomo. Como parte de pago de la
    // venta se descuenta a la cotizacion de venta, igual que el resto de lo cobrado.
    const tomaUsd = redondear(parseFloat(formPermuta.precio_ars) / cot);
    const costoUsd = redondear(parseFloat(formPermuta.precio_ars) / cotCosto);
    // Si no se indica precio de venta, queda igualado al costo (el mismo monto en pesos)
    const ventaUsd = formPermuta.precio_venta_ars
      ? redondear(parseFloat(formPermuta.precio_venta_ars) / cot)
      : tomaUsd;

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
      // El equipo entregado sale del stock como una venta al precio del lote. Parte de ese precio
      // se cobro con el equipo recibido (su valor de toma): en Ventas solo cuenta como plata
      // cobrada la diferencia, y el equipo recibido suma cuando se venda.
      const { error: errorEntrega, omitidas } = await marcarVendido('celulares', [lotePermuta.ids[0]], {
        precio_usd: lotePermuta.precio_usd,
        permuta_usd: tomaUsd,
      });
      if (errorEntrega) toast.error('El equipo recibido se cargo, pero no se pudo registrar la entrega: ' + errorEntrega.message);
      else if (omitidas.includes('permuta_usd')) {
        toast.error(
          'Permuta registrada, pero en Ventas va a figurar por el precio completo: falta actualizar la base de datos (correr el SQL).',
          { duration: 8000 }
        );
      } else toast.success('Permuta registrada: el equipo recibido entro al stock y el entregado quedo como vendido');
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
    const key = tabla + '-' + idDeFila(item);
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
  const confirmarVenta = (item, tabla) =>
    setVenta({ item, tabla, cantidad: 1, precio: Math.round(item.precio_usd * cot), accesorios: [] });

  // Cantidad a vender, siempre entre 1 y las unidades del lote
  const cantidadVenta = venta ? Math.min(venta.item.cantidad, Math.max(1, parseInt(venta.cantidad) || 1)) : 0;
  // Precio de un accesorio segun la cantidad: usa los precios por cantidad cargados, si hay
  const cotizarEscala = (lote, cantidad) =>
    precioPorCantidad(escalas[claveAccesorio(lote)], cantidad, lote.precio_usd, cot);
  const escalaVenta = venta && venta.tabla === 'accesorios' ? cotizarEscala(venta.item, cantidadVenta) : null;

  // En celulares el precio final por unidad se carga en pesos y se puede cambiar al vender.
  // Si no se toco, se conserva el precio exacto en USD del lote.
  const precioManualArs = venta && venta.tabla === 'celulares' ? parseFloat(venta.precio) : NaN;
  const precioManualValido = precioManualArs >= 0 && cot > 0;
  const precioSinCambios = venta ? precioManualArs === Math.round(venta.item.precio_usd * cot) : false;
  const precioVenta = !venta
    ? 0
    : venta.tabla === 'celulares'
    ? redondear(!precioManualValido ? 0 : precioSinCambios ? venta.item.precio_usd : precioManualArs / cot)
    : redondear(escalaVenta.unitarioUsd);

  // Accesorios vendidos junto al celular. Cada uno puede ir a precio de lista, a un precio
  // especial (en pesos por unidad) o gratis.
  const accesoriosVenta = venta
    ? (venta.accesorios || [])
        .map((a) => {
          const lote = stockAccesorios.find((l) => String(l.ids[0]) === a.id);
          if (!lote) return null;
          const cantidad = Math.min(lote.cantidad, Math.max(1, parseInt(a.cantidad) || 1));
          const precioArs = parseFloat(a.precio);
          const escala = cotizarEscala(lote, cantidad);
          const precioUsd =
            a.modo === 'gratis'
              ? 0
              : a.modo === 'especial'
              ? precioArs >= 0 && cot > 0 ? redondear(precioArs / cot) : NaN
              : redondear(escala.unitarioUsd);
          return { ...a, lote, cantidad, precioUsd, escala };
        })
        .filter(Boolean)
    : [];
  const accesoriosValidos = accesoriosVenta.every((a) => a.precioUsd >= 0);
  const totalAccesoriosUsd = accesoriosVenta.reduce((acc, a) => acc + (a.precioUsd || 0) * a.cantidad, 0);
  const totalOperacionArs = Math.round((precioVenta * cantidadVenta + totalAccesoriosUsd) * cot);

  const agregarAccesorioVenta = (id) => {
    if (!id) return;
    const existente = venta.accesorios.find((a) => a.id === id);
    if (existente) {
      cambiarAccesorioVenta(id, { cantidad: (parseInt(existente.cantidad) || 1) + 1 });
      return;
    }
    const lote = stockAccesorios.find((l) => String(l.ids[0]) === id);
    setVenta({
      ...venta,
      accesorios: [...venta.accesorios, { id, cantidad: 1, modo: 'lista', precio: Math.round(lote.precio_usd * cot) }],
    });
  };
  const cambiarAccesorioVenta = (id, cambios) =>
    setVenta({ ...venta, accesorios: venta.accesorios.map((a) => (a.id === id ? { ...a, ...cambios } : a)) });
  const quitarAccesorioVenta = (id) =>
    setVenta({ ...venta, accesorios: venta.accesorios.filter((a) => a.id !== id) });

  // La venta se registra al precio final cargado (celulares) o al que corresponde por cantidad
  // (accesorios). Los accesorios elegidos salen del stock al precio indicado.
  async function ejecutarVenta() {
    const { item, tabla } = venta;
    if (tabla === 'celulares' && !precioManualValido) {
      toast.error('Indica el precio final de venta');
      return;
    }
    if (!accesoriosValidos) {
      toast.error('Indica el precio especial de los accesorios');
      return;
    }
    const ids = item.ids.slice(0, cantidadVenta);
    const fecha = new Date().toISOString();
    const accesorios = accesoriosVenta;
    setVenta(null);
    const { error } = await marcarVendido(tabla, ids, { precio_usd: precioVenta }, fecha);
    if (error) {
      toast.error('Error al registrar la venta: ' + error.message);
      return;
    }

    let unidadesAccesorios = 0;
    for (const { lote, cantidad, precioUsd } of accesorios) {
      const { error: errorAccesorio } = await marcarVendido('accesorios', lote.ids.slice(0, cantidad), { precio_usd: precioUsd }, fecha);
      if (errorAccesorio) {
        toast.error('El celular se vendio, pero no se pudo descontar ' + lote.tipo + ' ' + lote.modelo + ': ' + errorAccesorio.message);
      } else {
        unidadesAccesorios += cantidad;
      }
    }

    toast.success(
      ids.length + ' venta(s) registrada(s)' + (unidadesAccesorios > 0 ? ' y ' + unidadesAccesorios + ' accesorio(s) descontado(s)' : '')
    );
    cargarDatos(false);
  }

  // Anular una venta cargada por error: las unidades vuelven al stock. Si la venta fue de
  // varias unidades iguales, se puede anular toda o una sola.
  const confirmarAnulacion = (item) => {
    const cantidad = item.ids.length;
    setDialogo({
      titulo: cantidad > 1 ? 'Anular esta venta de ' + cantidad + ' unidades?' : 'Anular esta venta?',
      texto: cantidad > 1 ? 'Las unidades que anules vuelven al stock disponible.' : 'La unidad vuelve al stock disponible.',
      botones:
        cantidad > 1
          ? [
              { etiqueta: 'Anular las ' + cantidad + ' unidades', clase: 'bg-red-600 hover:bg-red-700', accion: () => anularVenta(item, item.ids) },
              { etiqueta: 'Anular solo 1 unidad', clase: 'bg-gray-700 hover:bg-gray-800', accion: () => anularVenta(item, item.ids.slice(0, 1)) },
            ]
          : [{ etiqueta: 'Anular venta', clase: 'bg-red-600 hover:bg-red-700', accion: () => anularVenta(item, item.ids) }],
    });
  };

  async function anularVenta(item, ids) {
    const tabla = item.categoria === 'celular' ? 'celulares' : 'accesorios';
    const { error } = await porTandas(ids, (tanda) =>
      supabase.from(tabla).update({ estado: 'disponible', fecha_venta: null }).in('id', tanda)
    );
    if (error) {
      toast.error('Error al anular la venta: ' + error.message);
      return;
    }
    toast.success(ids.length > 1 ? 'Venta anulada, las ' + ids.length + ' unidades volvieron al stock' : 'Venta anulada, la unidad volvio al stock');
    cargarDatos(false);
  }

  // ---------- Revendedores (consignacion) y senas ----------
  const nombreItem = (item, tabla) =>
    (tabla === 'celulares'
      ? item.modelo + ' ' + (item.capacidad || '') + ' - Bateria ' + item.bateria + '%'
      : item.tipo + ' - ' + item.modelo) + (item.color ? ' - ' + item.color : '');

  // Lo que debe el revendedor por una unidad: el precio acordado al entregarla
  // (si no se cargo, el precio de venta del equipo)
  const precioAcordado = (u) =>
    u.precio_revendedor === null || u.precio_revendedor === undefined ? Number(u.precio_usd) || 0 : Number(u.precio_revendedor) || 0;

  const diaEntrega = (u) => (u.fecha_revendedor ? new Date(u.fecha_revendedor).toLocaleDateString('es-AR') : '');

  const diasDesde = (fechaISO) => Math.max(0, Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000));

  // Agrupa las unidades de una cuenta (revendedor o sena) por persona y, dentro de cada una,
  // por lote (mismo equipo, mismo precio acordado y mismo dia de entrega). Suma los pagos a
  // cuenta de cada persona para calcular el saldo: deuda en USD menos lo entregado en USD.
  const armarGrupos = (cuenta, unidades, pagos, lista) => {
    const grupos = {};
    const grupo = (nombre) => {
      const k = normalizar(nombre);
      if (!grupos[k]) {
        grupos[k] = {
          cuenta, nombre, unidades: 0, totalUsd: 0, costoTotalUsd: 0, lotes: {}, pagadoUsd: 0, pagadoArs: 0, pagos: 0, aplicadoUsd: 0, aplicadoArs: 0,
          celular: '', idLista: null, movimientos: [],
        };
      }
      return grupos[k];
    };
    unidades.forEach((u) => {
      const g = grupo(String(u.revendedor || '').trim() || 'Sin nombre');
      const precio = precioAcordado(u);
      g.unidades += 1;
      g.totalUsd += precio;
      g.costoTotalUsd += Number(u.costo_usd) || 0;
      const kl = [u.tabla, u.tabla === 'celulares' ? claveCelular(u) : claveAccesorio(u), precio, diaEntrega(u)].join('|');
      if (!g.lotes[kl]) g.lotes[kl] = { ...u, cuenta, cantidad: 0, ids: [], precioUnidad: precio, precioTotal: 0 };
      g.lotes[kl].cantidad += 1;
      g.lotes[kl].ids.push(u.id);
      g.lotes[kl].precioTotal += precio;
    });
    pagos.forEach((pago) => {
      const g = grupo(String(pago.revendedor || '').trim() || 'Sin nombre');
      const usd = Number(pago.monto_usd) || 0;
      const ars = Number(pago.monto_ars) || 0;
      // Detalle de la cuenta, en el orden en que se cargo (los pagos vienen ordenados por fecha)
      g.movimientos.push({ ...pago, usd, ars });
      if (usd < 0 || ars < 0) {
        // Fila negativa: parte de lo entregado que ya se aplico a equipos marcados como pagados
        g.aplicadoUsd += -usd;
        g.aplicadoArs += -ars;
      } else {
        g.pagadoUsd += usd;
        g.pagadoArs += ars;
        g.pagos += 1;
      }
    });
    // Los revendedores guardados aparecen aunque no tengan equipos ni pagos
    lista.forEach((r) => {
      const g = grupo(r.nombre);
      g.celular = r.celular || '';
      g.idLista = r.id;
    });
    return Object.values(grupos)
      .map((g) => {
        // Credito = lo entregado que todavia no se aplico a ningun equipo
        const creditoUsd = g.pagadoUsd - g.aplicadoUsd;
        const creditoArs = g.pagadoArs - g.aplicadoArs;
        // Margen = parte del precio acordado que es ganancia, sobre todos los equipos que tiene
        // (con el costo a la cotizacion de costo)
        const margen = g.totalUsd > 0 ? (g.totalUsd - g.costoTotalUsd * factorCosto) / g.totalUsd : 0;
        return { ...g, lotes: Object.values(g.lotes), creditoUsd, creditoArs, margen, saldoUsd: g.totalUsd - creditoUsd };
      })
      .sort((a, b) => comparar(a.nombre, b.nombre));
  };

  const gruposRevendedor = armarGrupos('revendedor', enRevendedor, pagosRevendedor, listaRevendedores);
  // Las senas no usan lista guardada: la cuenta existe mientras haya equipos senados o plata entregada
  const gruposSena = armarGrupos('sena', enSena, pagosSena, []);
  const gruposDe = (cuenta) => (cuenta === 'sena' ? gruposSena : gruposRevendedor);

  // Cobros a cuenta de los revendedores y de las senas, para sumarlos a los ingresos y a la ganancia de la
  // pestana Ventas apenas se cobran. Cada cobro se trata como una venta parcial: ingreso = lo
  // cobrado y ganancia = lo cobrado x margen de los equipos de esa cuenta (estimada).
  // Lo que ya se aplico a equipos pagados (filas negativas) se descuenta de los cobros mas viejos,
  // porque esos equipos ya figuran como ventas reales: asi no se cuenta dos veces.
  const estimarCobros = (cuenta, pagos) => {
    const porRevendedor = {};
    pagos.forEach((p) => {
      const k = normalizar(String(p.revendedor || '').trim() || 'Sin nombre');
      (porRevendedor[k] = porRevendedor[k] || []).push(p);
    });
    const eventos = [];
    Object.entries(porRevendedor).forEach(([k, filas]) => {
      const g = gruposDe(cuenta).find((x) => normalizar(x.nombre) === k);
      const margen = g ? g.margen : 0;
      let aDescontarUsd = filas.reduce((acc, p) => acc + (Number(p.monto_usd) < 0 ? -Number(p.monto_usd) : 0), 0);
      filas
        .filter((p) => Number(p.monto_usd) > 0)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .forEach((p) => {
          const usd = Number(p.monto_usd);
          const ars = Number(p.monto_ars) || 0;
          const quita = Math.min(usd, aDescontarUsd);
          aDescontarUsd -= quita;
          const restoUsd = usd - quita;
          if (restoUsd < 0.005) return;
          const restoArs = ars * (restoUsd / usd);
          eventos.push({
            id: p.id,
            categoria: 'cobro',
            cuenta,
            revendedor: g ? g.nombre : String(p.revendedor || '').trim(),
            fecha_venta: p.fecha,
            precio_usd: restoUsd,
            costo_usd: restoUsd * (1 - margen),
            cotizacion_venta: restoArs / restoUsd,
          });
        });
    });
    return eventos;
  };
  const cobrosEstimados = [...estimarCobros('revendedor', pagosRevendedor), ...estimarCobros('sena', pagosSena)];

  // Saldo menor a medio centavo de dolar se considera cubierto
  const saldoCubierto = (saldoUsd) => saldoUsd < 0.005;

  // La pestana Senas muestra lo mismo que Revendedores, con las cuentas de senas
  const cuentaTab = activeTab === 'senas' ? 'sena' : 'revendedor';
  const textosTab = CUENTAS[cuentaTab];
  const gruposTab = gruposDe(cuentaTab);
  const unidadesTab = gruposTab.reduce((acc, g) => acc + g.unidades, 0);
  const totalEnLaCalleUsd = gruposTab.reduce((acc, g) => acc + g.totalUsd, 0);
  const totalEntregadoUsd = gruposTab.reduce((acc, g) => acc + Math.max(0, g.creditoUsd), 0);
  const totalEntregadoArs = gruposTab.reduce((acc, g) => acc + Math.max(0, g.creditoArs), 0);
  const saldoPendienteUsd = gruposTab.reduce((acc, g) => acc + Math.max(0, g.saldoUsd), 0);

  // Persona (revendedor o cliente que seno) a la que pertenece un lote
  const grupoDeLote = (lote) => {
    const nombre = String(lote.revendedor || '').trim() || 'Sin nombre';
    return gruposDe(lote.cuenta).find((g) => normalizar(g.nombre) === normalizar(nombre)) || null;
  };

  // ---------- Carrito (para un revendedor o para una sena) ----------
  const loteDelCarrito = (c) =>
    (c.tabla === 'celulares' ? stockCelulares : stockAccesorios).find((l) => String(l.ids[0]) === c.id);

  const itemsCarrito = carrito
    .map((c) => {
      const lote = loteDelCarrito(c);
      if (!lote) return null;
      const cantidad = Math.min(lote.cantidad, Math.max(1, parseInt(c.cantidad) || 1));
      const precioArs = parseFloat(c.precio);
      return { ...c, lote, cantidad, precioArs, valido: precioArs >= 0 };
    })
    .filter(Boolean);
  const totalCarritoArs = itemsCarrito.reduce((acc, i) => acc + (i.valido ? i.precioArs : 0) * i.cantidad, 0);
  const unidadesCarrito = itemsCarrito.reduce((acc, i) => acc + i.cantidad, 0);
  const entregadoCarritoArs = parseFloat(carritoEntregado) || 0;
  const textosCarrito = CUENTAS[carritoCuenta];
  const grupoCarrito = gruposDe(carritoCuenta).find((g) => normalizar(g.nombre) === normalizar(carritoNombre));
  const saldoPrevioArs = grupoCarrito ? grupoCarrito.saldoUsd * cot : 0;

  const agregarAlCarrito = (item, tabla, cuenta = 'revendedor') => {
    // El carrito es uno solo: no se mezclan equipos para un revendedor con equipos senados
    if (carrito.length > 0 && cuenta !== carritoCuenta) {
      toast.error(
        (carritoCuenta === 'sena'
          ? 'El carrito tiene equipos para señar.'
          : 'El carrito tiene equipos para un revendedor.') + ' Confirmalo o vacialo antes de seguir.',
        { duration: 6000 }
      );
      return;
    }
    if (cuenta !== carritoCuenta) {
      setCarritoCuenta(cuenta);
      setCarritoNombre('');
      setCarritoCelular('');
      setCarritoEntregado('');
    }
    const id = String(item.ids[0]);
    const existente = carrito.find((c) => c.id === id && c.tabla === tabla);
    if (existente) {
      if (existente.cantidad >= item.cantidad) {
        toast.error('Ya estan en el carrito todas las unidades de ese lote');
        return;
      }
      setCarrito(carrito.map((c) => (c === existente ? { ...c, cantidad: c.cantidad + 1 } : c)));
    } else {
      setCarrito([...carrito, { id, tabla, cantidad: 1, precio: Math.round(item.precio_usd * cot) }]);
    }
    toast.success(CUENTAS[cuenta].agregado);
  };
  const cambiarItemCarrito = (item, cambios) =>
    setCarrito(carrito.map((c) => (c.id === item.id && c.tabla === item.tabla ? { ...c, ...cambios } : c)));
  const quitarDelCarrito = (item) => setCarrito(carrito.filter((c) => !(c.id === item.id && c.tabla === item.tabla)));

  // Marca como vendidas todas las unidades de una cuenta (al precio acordado de cada una)
  // y da por aplicados sus pagos a cuenta. Lee la base para no depender de datos viejos.
  async function cerrarCuenta(cuenta, nombre) {
    const { estado, tablaPagos } = CUENTAS[cuenta];
    for (const tabla of ['celulares', 'accesorios']) {
      const { data, error } = await traerTodo(() =>
        supabase.from(tabla).select('id, precio_usd, precio_revendedor').eq('estado', estado).eq('revendedor', nombre).order('id')
      );
      if (error) return { error };
      const porPrecio = {};
      (data || []).forEach((u) => {
        const precio = precioAcordado(u);
        (porPrecio[precio] = porPrecio[precio] || []).push(u.id);
      });
      for (const [precio, ids] of Object.entries(porPrecio)) {
        const { error: errorVenta } = await marcarVendido(tabla, ids, { precio_usd: Number(precio) });
        if (errorVenta) return { error: errorVenta };
      }
    }
    return supabase.from(tablaPagos).update({ aplicado: true }).eq('revendedor', nombre).eq('aplicado', false);
  }

  async function registrarPagoCuenta(cuenta, nombre, montoArs) {
    return supabase.from(CUENTAS[cuenta].tablaPagos).insert({
      revendedor: nombre,
      monto_ars: redondear(montoArs),
      cotizacion: cot,
      monto_usd: redondear(montoArs / cot),
    });
  }

  async function confirmarCarrito() {
    const escrito = carritoNombre.trim();
    if (!escrito) {
      toast.error(textosCarrito.faltaNombre);
      return;
    }
    if (itemsCarrito.length === 0) {
      toast.error('El carrito esta vacio');
      return;
    }
    if (itemsCarrito.some((i) => !i.valido)) {
      toast.error('Revisa los precios del carrito');
      return;
    }
    if (!cot) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    // Si ya existe una cuenta con ese nombre, se usa la misma escritura para no duplicarla
    const cuenta = carritoCuenta;
    const nombre = grupoCarrito ? grupoCarrito.nombre : escrito;
    const saldoFinalUsd = (grupoCarrito ? grupoCarrito.saldoUsd : 0) + totalCarritoArs / cot - entregadoCarritoArs / cot;
    const fecha = new Date().toISOString();

    for (const item of itemsCarrito) {
      const { error } = await porTandas(item.lote.ids.slice(0, item.cantidad), (tanda) =>
        supabase
          .from(item.tabla)
          .update({ estado: CUENTAS[cuenta].estado, revendedor: nombre, precio_revendedor: redondear(item.precioArs / cot), fecha_revendedor: fecha })
          .in('id', tanda)
      );
      if (error) {
        // La base todavia no acepta el estado de las senas: falta correr el SQL de esta version
        toast.error(
          cuenta === 'sena' && /check|constraint|estado/i.test(error.message)
            ? 'Para usar las señas hay que actualizar la base de datos (falta correr el SQL).'
            : 'Error al asignar: ' + error.message,
          { duration: 6000 }
        );
        cargarDatos(false);
        return;
      }
    }

    if (cuenta === 'revendedor') await asegurarEnLista(nombre, carritoCelular);

    if (entregadoCarritoArs > 0) {
      const { error } = await registrarPagoCuenta(cuenta, nombre, entregadoCarritoArs);
      if (error) toast.error('Los equipos se asignaron, pero no se pudo guardar el monto entregado: ' + error.message);
    }

    if (saldoCubierto(saldoFinalUsd)) {
      const { error } = await cerrarCuenta(cuenta, nombre);
      if (error) toast.error('No se pudo cerrar la cuenta: ' + error.message);
      else toast.success('Pago completo: los equipos de ' + nombre + ' quedaron como vendidos');
    } else {
      toast.success(unidadesCarrito + CUENTAS[cuenta].asignadas + nombre + '. Saldo: ARS $ ' + fmt(Math.round(saldoFinalUsd * cot)));
    }
    setCarrito([]);
    setCarritoNombre('');
    setCarritoCelular('');
    setCarritoEntregado('');
    setCarritoAbierto(false);
    cargarDatos(false);
  }

  // ---------- Pagos a cuenta ----------
  const grupoPago = pagoRevendedor ? gruposDe(pagoRevendedor.cuenta).find((g) => g.nombre === pagoRevendedor.nombre) : null;
  const montoPagoArs = pagoRevendedor ? parseFloat(pagoRevendedor.monto) || 0 : 0;
  const saldoTrasPagoUsd = grupoPago ? grupoPago.saldoUsd - (cot ? montoPagoArs / cot : 0) : 0;

  async function confirmarPagoRevendedor() {
    const { cuenta, nombre } = pagoRevendedor;
    if (!(montoPagoArs > 0)) {
      toast.error('Indica el monto que entrego');
      return;
    }
    if (!cot) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    const saldoFinal = saldoTrasPagoUsd;
    setPagoRevendedor(null);
    const { error } = await registrarPagoCuenta(cuenta, nombre, montoPagoArs);
    if (error) {
      toast.error('Error al registrar el pago: ' + error.message);
      return;
    }
    if (saldoCubierto(saldoFinal) && grupoPago.unidades > 0) {
      const { error: errorCierre } = await cerrarCuenta(cuenta, nombre);
      if (errorCierre) toast.error('El pago se guardo, pero no se pudo cerrar la cuenta: ' + errorCierre.message);
      else toast.success('Saldo cubierto: los equipos de ' + nombre + ' quedaron como vendidos');
    } else {
      toast.success('Pago registrado. Saldo de ' + nombre + ': ARS $ ' + fmt(Math.round(saldoFinal * cot)));
    }
    cargarDatos(false);
  }

  // ---------- Corregir o eliminar un pago ya registrado ----------
  const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : 'Sin fecha');

  const grupoEdicionPago = edicionPago ? gruposDe(edicionPago.cuenta).find((g) => g.nombre === edicionPago.nombre) : null;
  const montoEdicionArs = edicionPago ? parseFloat(edicionPago.monto) || 0 : 0;
  // El pago conserva la cotizacion del dia en que se cobro
  const cotEdicionPago = edicionPago ? Number(edicionPago.pago.cotizacion) || cot : 0;
  const usdEdicionPago = cotEdicionPago ? montoEdicionArs / cotEdicionPago : 0;
  const saldoTrasEdicionUsd = grupoEdicionPago ? grupoEdicionPago.saldoUsd + edicionPago.pago.usd - usdEdicionPago : 0;

  // Lo entregado no puede quedar por debajo de lo que ya se desconto en equipos marcados como
  // pagados: esos equipos ya figuran como ventas cobradas con esa plata.
  const cubreLoAplicado = (g, pago, nuevoUsd) => g.pagadoUsd - pago.usd + nuevoUsd >= g.aplicadoUsd - 0.005;
  const avisoAplicado = (g) =>
    'De lo que entrego ' + g.nombre + ' ya se usaron ARS $ ' + fmt(Math.round(g.aplicadoArs)) +
    ' en equipos marcados como pagados. El total entregado no puede quedar por debajo de eso.';

  async function guardarEdicionPago() {
    const { cuenta, nombre, pago } = edicionPago;
    const grupo = grupoEdicionPago;
    if (!(montoEdicionArs > 0)) {
      toast.error('Indica el monto correcto. Para sacar el pago, usa "Eliminar".');
      return;
    }
    if (grupo && !cubreLoAplicado(grupo, pago, usdEdicionPago)) {
      toast.error(avisoAplicado(grupo), { duration: 7000 });
      return;
    }
    const saldoFinal = saldoTrasEdicionUsd;
    setEdicionPago(null);
    const { error } = await supabase
      .from(CUENTAS[cuenta].tablaPagos)
      .update({ monto_ars: redondear(montoEdicionArs), monto_usd: redondear(usdEdicionPago) })
      .eq('id', pago.id);
    if (error) {
      toast.error('No se pudo corregir el pago: ' + error.message);
      return;
    }
    if (grupo && saldoCubierto(saldoFinal) && grupo.unidades > 0) {
      const { error: errorCierre } = await cerrarCuenta(cuenta, nombre);
      if (errorCierre) toast.error('El pago se corrigio, pero no se pudo cerrar la cuenta: ' + errorCierre.message);
      else toast.success('Saldo cubierto: los equipos de ' + nombre + ' quedaron como vendidos');
    } else {
      toast.success('Pago corregido. Saldo de ' + nombre + ': ARS $ ' + fmt(Math.round(saldoFinal * cot)));
    }
    cargarDatos(false);
  }

  const pedirEliminarPago = (g, pago) => {
    if (!cubreLoAplicado(g, pago, 0)) {
      toast.error(avisoAplicado(g), { duration: 7000 });
      return;
    }
    setDialogo({
      titulo: 'Eliminar este pago?',
      texto:
        'Pago de ' + g.nombre + ' del ' + fechaCorta(pago.fecha) + ' por ARS $ ' + fmt(Math.round(pago.ars)) +
        '. Se borra y su saldo vuelve a subir por ese monto.',
      botones: [
        {
          etiqueta: 'Eliminar pago',
          clase: 'bg-red-600 hover:bg-red-700',
          accion: async () => {
            const { error } = await supabase.from(CUENTAS[g.cuenta].tablaPagos).delete().eq('id', pago.id);
            if (error) toast.error('No se pudo eliminar el pago: ' + error.message);
            else toast.success('Pago eliminado');
            cargarDatos(false);
          },
        },
      ],
    });
  };

  // Desde Ventas: abre la cuenta de quien hizo un cobro a cuenta, para ver y corregir sus pagos
  const verPagosDe = (cobro) => {
    setRevAbiertos({ ...revAbiertos, [cobro.cuenta + '|' + normalizar(cobro.revendedor)]: true });
    cambiarTab(cobro.cuenta === 'sena' ? 'senas' : 'revendedores');
  };

  // ---------- Corregir el precio de una venta ya registrada ----------
  const abrirEdicionVenta = (item) =>
    setEdicionVenta({ item, precio: Math.round(item.precioUnidadUsd * cotizacionDe(item)) });

  const precioEdicionVentaArs = edicionVenta ? parseFloat(edicionVenta.precio) : NaN;

  async function guardarEdicionVenta() {
    const { item } = edicionVenta;
    if (!(precioEdicionVentaArs >= 0)) {
      toast.error('Indica el precio correcto');
      return;
    }
    const tabla = item.categoria === 'celular' ? 'celulares' : 'accesorios';
    // Se convierte con la cotizacion del dia de la venta, para no mover el resto del historial
    const precioUsd = redondear(precioEdicionVentaArs / cotizacionDe(item));
    setEdicionVenta(null);
    const { error } = await porTandas(item.ids, (tanda) => supabase.from(tabla).update({ precio_usd: precioUsd }).in('id', tanda));
    if (error) {
      toast.error('No se pudo corregir la venta: ' + error.message);
      return;
    }
    toast.success('Venta corregida');
    cargarDatos(false);
  }

  const confirmarCierreCuenta = (g) =>
    setDialogo({
      titulo: 'Cerrar la cuenta de ' + g.nombre,
      texto:
        g.unidades > 0
          ? 'Sus ' + g.unidades + ' unidad(es) pasan al historial de ventas al precio acordado y los pagos a cuenta se dan por aplicados.'
          : 'No tiene equipos a su nombre. Los pagos a cuenta se dan por aplicados y la cuenta queda en cero.',
      botones: [
        {
          etiqueta: 'Cerrar cuenta',
          clase: 'bg-green-600 hover:bg-green-700',
          accion: async () => {
            const { error } = await cerrarCuenta(g.cuenta, g.nombre);
            if (error) toast.error('No se pudo cerrar la cuenta: ' + error.message);
            else toast.success('Cuenta de ' + g.nombre + ' cerrada');
            cargarDatos(false);
          },
        },
      ],
    });

  // El revendedor devuelve el equipo (o se cancela la sena): vuelve al stock con su precio de venta original
  async function devolverRevendedor(ids, tabla) {
    const { error } = await porTandas(ids, (tanda) =>
      supabase
        .from(tabla)
        .update({ estado: 'disponible', revendedor: null, precio_revendedor: null, fecha_revendedor: null })
        .in('id', tanda)
    );
    if (error) {
      toast.error('Error al actualizar: ' + error.message);
      return;
    }
    toast.success(ids.length + ' unidad(es) devuelta(s) al stock');
    cargarDatos(false);
  }

  const confirmarResolucion = (lote, destino) => setResolucion({ lote, destino, cantidad: 1 });

  const cantidadResolucion = resolucion
    ? Math.min(resolucion.lote.cantidad, Math.max(1, parseInt(resolucion.cantidad) || 1))
    : 0;

  // Al marcar equipos como pagados, primero se descuenta lo que el revendedor ya entrego a
  // cuenta; lo que falte se toma como cobrado en ese momento.
  const grupoResolucion = resolucion ? grupoDeLote(resolucion.lote) : null;
  const valorResolucionUsd = resolucion ? resolucion.lote.precioUnidad * cantidadResolucion : 0;
  const aplicaCreditoUsd =
    resolucion && resolucion.destino === 'vendido' && grupoResolucion
      ? Math.min(Math.max(grupoResolucion.creditoUsd, 0), valorResolucionUsd)
      : 0;
  const aplicaCreditoArs =
    grupoResolucion && grupoResolucion.creditoUsd > 0
      ? grupoResolucion.creditoArs * (aplicaCreditoUsd / grupoResolucion.creditoUsd)
      : 0;
  const cobroAhoraArs = Math.max(0, valorResolucionUsd * cot - aplicaCreditoArs);

  async function ejecutarResolucion() {
    const { lote, destino } = resolucion;
    const ids = lote.ids.slice(0, cantidadResolucion);
    const grupo = grupoResolucion;
    const nombre = grupo ? grupo.nombre : String(lote.revendedor || '').trim();
    const valorUsd = valorResolucionUsd;
    const aplicadoUsd = aplicaCreditoUsd;
    const aplicadoArs = aplicaCreditoArs;
    setResolucion(null);

    if (destino !== 'vendido') {
      await devolverRevendedor(ids, lote.tabla);
      return;
    }

    const { error } = await marcarVendido(lote.tabla, ids, { precio_usd: lote.precioUnidad });
    if (error) {
      toast.error('Error al registrar el pago: ' + error.message);
      return;
    }

    // Lo entregado a cuenta que cubre estos equipos se descuenta con una fila negativa
    if (aplicadoUsd > 0.005) {
      const { error: errorAplicacion } = await supabase.from(CUENTAS[lote.cuenta].tablaPagos).insert({
        revendedor: nombre,
        monto_ars: -redondear(aplicadoArs),
        cotizacion: cot,
        monto_usd: -redondear(aplicadoUsd),
      });
      if (errorAplicacion) {
        toast.error('Los equipos se marcaron como pagados, pero no se pudo descontar lo entregado a cuenta: ' + errorAplicacion.message);
      }
    }

    // Cobrar equipos ahora baja el saldo; si no quedan equipos o el saldo queda cubierto, se cierra la cuenta
    const quedan = grupo ? grupo.unidades - ids.length : 0;
    const saldoNuevoUsd = grupo ? grupo.saldoUsd - (valorUsd - aplicadoUsd) : 0;
    if (quedan === 0 || saldoCubierto(saldoNuevoUsd)) {
      const { error: errorCierre } = await cerrarCuenta(lote.cuenta, nombre);
      if (errorCierre) toast.error('Se registro el pago, pero no se pudo cerrar la cuenta: ' + errorCierre.message);
      else toast.success('Cuenta de ' + nombre + ' saldada: sus equipos quedaron como vendidos');
    } else {
      toast.success(
        ids.length + ' unidad(es) marcada(s) como pagada(s). Saldo de ' + nombre + ': ARS $ ' + fmt(Math.round(saldoNuevoUsd * cot))
      );
    }
    cargarDatos(false);
  }

  // ---------- Lista de revendedores ----------
  const tieneMovimientos = (g) => g.unidades > 0 || g.pagos > 0 || g.aplicadoArs > 0;

  const claveDesplegable = (g) => g.cuenta + '|' + normalizar(g.nombre);
  const alternarRevendedor = (g) => {
    const clave = claveDesplegable(g);
    setRevAbiertos({ ...revAbiertos, [clave]: !revAbiertos[clave] });
  };

  const abrirAltaRevendedor = () => setRevForm({ id: null, nombre: '', celular: '', bloqueaNombre: false });

  const abrirEdicionRevendedor = (g) =>
    setRevForm({ id: g.idLista, nombre: g.nombre, celular: g.celular || '', bloqueaNombre: tieneMovimientos(g) || !g.idLista });

  async function guardarRevendedor() {
    const nombre = revForm.nombre.trim();
    const celular = revForm.celular.trim();
    const clave = normalizar(nombre);
    if (!clave) {
      toast.error('Coloque el nombre del revendedor');
      return;
    }
    const repetido = gruposRevendedor.find((g) => g.idLista && g.idLista !== revForm.id && normalizar(g.nombre) === clave);
    if (repetido) {
      toast.error('Ya existe un revendedor con ese nombre');
      return;
    }
    const datos = { nombre, clave, celular: celular || null };
    const { error } = revForm.id
      ? await supabase.from('revendedores_lista').update(revForm.bloqueaNombre ? { celular: datos.celular } : datos).eq('id', revForm.id)
      : await supabase.from('revendedores_lista').insert(datos);
    if (error) {
      toast.error('No se pudo guardar el revendedor: ' + error.message);
      return;
    }
    setRevForm(null);
    toast.success(revForm.id ? 'Datos actualizados' : nombre + ' quedo guardado en la lista');
    cargarDatos(false);
  }

  // Guarda al revendedor en la lista la primera vez que se le entrega algo (si ya esta, no hace nada)
  async function asegurarEnLista(nombre, celular = '') {
    const clave = normalizar(nombre);
    if (!clave || listaRevendedores.some((r) => r.clave === clave)) return;
    await supabase
      .from('revendedores_lista')
      .upsert({ nombre, clave, celular: celular.trim() || null }, { onConflict: 'clave', ignoreDuplicates: true });
  }

  // No se puede eliminar a quien todavia tiene equipos o debe plata
  const pedirEliminarRevendedor = (g) => {
    const aviso = (texto) => toast.error(texto, { duration: 6000 });
    if (g.unidades > 0) {
      aviso(g.nombre + ' todavia tiene ' + g.unidades + ' equipo(s) en su poder. Registra el pago o la devolucion antes de eliminarlo.');
      return;
    }
    if (g.saldoUsd > 0.005) {
      aviso(g.nombre + ' todavia debe ARS $ ' + fmt(Math.round(g.saldoUsd * cot)) + '. Registra el pago antes de eliminarlo.');
      return;
    }
    if (tieneMovimientos(g)) {
      aviso('La cuenta de ' + g.nombre + ' tiene pagos sin cerrar. Toca "Cerrar cuenta" antes de eliminarlo.');
      return;
    }
    if (!g.idLista) return;
    setDialogo({
      titulo: 'Eliminar a ' + g.nombre,
      texto: 'Se quita de la lista de revendedores. Las ventas que ya se registraron con su nombre no se tocan.',
      botones: [
        {
          etiqueta: 'Eliminar',
          clase: 'bg-red-600 hover:bg-red-700',
          accion: async () => {
            const { error } = await supabase.from('revendedores_lista').delete().eq('id', g.idLista);
            if (error) toast.error('No se pudo eliminar: ' + error.message);
            else toast.success(g.nombre + ' se elimino de la lista');
            cargarDatos(false);
          },
        },
      ],
    });
  };

  // ---------- Precios por cantidad de un accesorio ----------
  const abrirEditorEscala = (lote) =>
    setEditorEscala({
      lote,
      filas: (escalas[claveAccesorio(lote)] || []).map((t) => ({ desde: String(t.desde), moneda: t.moneda, precio: String(t.precio) })),
    });

  const cambiarFilaEscala = (i, cambios) =>
    setEditorEscala({ ...editorEscala, filas: editorEscala.filas.map((f, j) => (j === i ? { ...f, ...cambios } : f)) });
  const quitarFilaEscala = (i) => setEditorEscala({ ...editorEscala, filas: editorEscala.filas.filter((_, j) => j !== i) });
  const agregarFilaEscala = () =>
    setEditorEscala({ ...editorEscala, filas: [...editorEscala.filas, { desde: '', moneda: 'ars', precio: '' }] });

  // Al cambiar de moneda se convierte el monto cargado, para conservar el mismo precio
  const cambiarMonedaFilaEscala = (i, moneda) => {
    const fila = editorEscala.filas[i];
    if (fila.moneda === moneda) return;
    const valor = parseFloat(fila.precio);
    const precio = valor >= 0 && cot > 0 ? String(moneda === 'usd' ? redondear(valor / cot) : Math.round(valor * cot)) : fila.precio;
    cambiarFilaEscala(i, { moneda, precio });
  };

  const copiarEscalaDe = (clave) => {
    if (!clave) return;
    setEditorEscala({
      ...editorEscala,
      filas: (escalas[clave] || []).map((t) => ({ desde: String(t.desde), moneda: t.moneda, precio: String(t.precio) })),
    });
  };

  // "5 a 9 unidades" / "10 o mas unidades", segun los otros tramos cargados
  const rangoEscala = (filas, i) => {
    const desde = parseInt(filas[i].desde);
    if (!(desde >= 1)) return 'Tramo nuevo';
    const siguientes = filas.map((f) => parseInt(f.desde)).filter((n) => n > desde);
    if (siguientes.length === 0) return desde + ' o mas unidades';
    const hasta = Math.min(...siguientes) - 1;
    return hasta === desde ? desde + (desde === 1 ? ' unidad' : ' unidades') : desde + ' a ' + hasta + ' unidades';
  };

  async function guardarEscala() {
    const { lote, filas } = editorEscala;
    const tramos = filas.map((f) => ({ desde: parseInt(f.desde), moneda: f.moneda, precio: parseFloat(f.precio) }));
    if (tramos.some((t) => !(t.desde >= 1) || !(t.precio >= 0))) {
      toast.error('Completa la cantidad "desde" y el precio de cada tramo');
      return;
    }
    const desdes = tramos.map((t) => t.desde);
    if (new Set(desdes).size !== desdes.length) {
      toast.error('Hay dos tramos que empiezan en la misma cantidad');
      return;
    }
    const clave = claveAccesorio(lote);
    setEditorEscala(null);
    if (tramos.length > 0) {
      const { error } = await supabase.from('escalas_precio').upsert(
        tramos.map((t) => ({
          clave,
          desde: t.desde,
          moneda: t.moneda,
          precio: t.moneda === 'usd' ? redondear(t.precio) : Math.round(t.precio * 100) / 100,
        })),
        { onConflict: 'clave,desde' }
      );
      if (error) {
        toast.error('Error al guardar los precios: ' + error.message);
        return;
      }
    }
    // Se quitan los tramos que ya no estan en la lista
    let borrado = supabase.from('escalas_precio').delete().eq('clave', clave);
    if (tramos.length > 0) borrado = borrado.not('desde', 'in', '(' + desdes.join(',') + ')');
    const { error: errorBorrado } = await borrado;
    if (errorBorrado) {
      toast.error('Error al actualizar los precios: ' + errorBorrado.message);
      return;
    }
    toast.success(tramos.length > 0 ? 'Precios por cantidad guardados' : 'Se quitaron los precios por cantidad');
    cargarDatos(false);
  }

  // ---------- Sumar stock a un lote existente ----------
  const cantidadSuma = suma ? Math.max(1, parseInt(suma.cantidad) || 1) : 0;

  async function sumarStock() {
    const { item, tabla } = suma;
    const comunes = {
      modelo: item.modelo,
      color: item.color,
      costo_usd: Number(item.costo_usd),
      precio_usd: Number(item.precio_usd),
      detalles: item.detalles || '',
    };
    const filaBase =
      tabla === 'celulares'
        ? { ...comunes, capacidad: item.capacidad, bateria: item.bateria }
        : { ...comunes, tipo: item.tipo };
    const cantidad = cantidadSuma;
    setSuma(null);
    const { error } = await guardarLoteConPromedio(tabla, filaBase, cantidad, tabla === 'celulares' ? claveCelular : claveAccesorio);
    if (error) {
      toast.error('Error al sumar stock: ' + error.message);
      return;
    }
    toast.success(cantidad + ' unidad(es) sumada(s) al stock');
    cargarDatos(false);
  }

  // ---------- Borrado ----------
  const confirmarBorrado = (item, tabla) => setBorrado({ item, tabla, cantidad: 1 });

  const cantidadBorrado = borrado ? Math.min(borrado.item.cantidad, Math.max(1, parseInt(borrado.cantidad) || 1)) : 0;

  async function confirmarBorradoElegido() {
    const { item, tabla } = borrado;
    const ids = item.ids.slice(0, cantidadBorrado);
    setBorrado(null);
    await ejecutarBorrado(ids, tabla);
  }

  async function ejecutarBorrado(idsArray, tabla) {
    const { error } = await porTandas(idsArray, (tanda) => supabase.from(tabla).delete().in('id', tanda));
    if (error) {
      toast.error('Error al borrar: ' + error.message);
      return;
    }
    toast.success(idsArray.length + ' item(s) eliminado(s)');
    cargarDatos(false);
  }

  // ---------- Edicion ----------
  const iniciarEdicionCelular = (celular) => {
    const ids = idsEditables(celular);
    setEditandoCelularId(idDeFila(celular));
    setFormEdicionCelular({ ...celular, ids, cantidadAEditar: ids.length });
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
    const { error } = await porTandas(datos.ids, (tanda) => supabase
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
      .in('id', tanda));

    if (!error) {
      // Los valores cargados a mano ya no son un promedio (columna opcional: se ignora si falta)
      await porTandas(datos.ids, (tanda) => supabase.from('celulares').update({ promediado: false }).in('id', tanda));
      toast.success(datos.ids.length + ' equipo(s) actualizado(s)');
      setEditandoCelularId(null);
      cargarDatos(false);
    } else toast.error('Error al actualizar: ' + error.message);
  }

  const iniciarEdicionAccesorio = (acc) => {
    const ids = idsEditables(acc);
    setEditandoAccesorioId(idDeFila(acc));
    setFormEdicionAccesorio({ ...acc, ids, cantidadAEditar: ids.length });
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
    const { error } = await porTandas(datos.ids, (tanda) => supabase
      .from('accesorios')
      .update({
        tipo,
        modelo: String(formEdicionAccesorio.modelo || '').trim(),
        color: datos.color,
        costo_usd: datos.costo_usd,
        precio_usd: datos.precio_usd,
        detalles: String(formEdicionAccesorio.detalles || '').trim(),
      })
      .in('id', tanda));

    if (!error) {
      // Los valores cargados a mano ya no son un promedio (columna opcional: se ignora si falta)
      await porTandas(datos.ids, (tanda) => supabase.from('accesorios').update({ promediado: false }).in('id', tanda));
      // Si cambio la identidad del accesorio, sus precios por cantidad lo acompanan
      const antes = stockAccesorios.find((l) => String(l.ids[0]) === String(editandoAccesorioId));
      if (antes && datos.ids.length === antes.ids.length) {
        const claveVieja = claveAccesorio(antes);
        const claveNueva = claveAccesorio({
          tipo,
          modelo: String(formEdicionAccesorio.modelo || '').trim(),
          color: datos.color,
          detalles: String(formEdicionAccesorio.detalles || '').trim(),
        });
        if (claveVieja !== claveNueva && escalas[claveVieja] && !escalas[claveNueva]) {
          await supabase.from('escalas_precio').update({ clave: claveNueva }).eq('clave', claveVieja);
        }
      }
      toast.success(datos.ids.length + ' accesorio(s) actualizado(s)');
      setEditandoAccesorioId(null);
      cargarDatos(false);
    } else toast.error('Error al actualizar: ' + error.message);
  }

  // ---------- Datos derivados ----------
  const statsCelulares = calcularStats(stockCelulares, cot, cotCosto);
  const statsAccesorios = calcularStats(stockAccesorios, cot, cotCosto);

  // Buscador del stock: todas las palabras escritas deben aparecer en alguno de los campos
  const filtrarStock = (lista, campos) => {
    const palabras = sinTildes(busquedaStock).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return lista;
    return lista.filter((item) => {
      const texto = sinTildes(campos.map((c) => item[c]).join(' '));
      return palabras.every((p) => texto.includes(p));
    });
  };

  // Suma a cada lote cuantas de sus unidades tienen los revendedores o estan senadas, y agrega
  // (con 0 unidades) los lotes que ya no tienen ninguna en el local. Asi el stock muestra que
  // esos equipos existen aunque no se puedan vender directamente.
  const conUnidadesFuera = (stock, tabla, claveFn, ordenar) => {
    const fuera = {};
    const contar = (unidades, campo) =>
      unidades.forEach((u) => {
        if (u.tabla !== tabla) return;
        const k = claveFn(u);
        if (!fuera[k]) fuera[k] = { muestra: u, ids: [], revendedor: 0, sena: 0, costoTotal: 0, precioTotal: 0 };
        fuera[k].ids.push(u.id);
        fuera[k][campo] += 1;
        fuera[k].costoTotal += Number(u.costo_usd) || 0;
        fuera[k].precioTotal += Number(u.precio_usd) || 0;
      });
    contar(enRevendedor, 'revendedor');
    contar(enSena, 'sena');

    const enLocal = new Set();
    const lotes = stock.map((lote) => {
      const k = claveFn(lote);
      enLocal.add(k);
      return fuera[k] ? { ...lote, fuera: { revendedor: fuera[k].revendedor, sena: fuera[k].sena } } : lote;
    });
    const sinUnidades = Object.entries(fuera)
      .filter(([k]) => !enLocal.has(k))
      .map(([k, f]) => {
        const total = f.revendedor + f.sena;
        return {
          ...f.muestra,
          claveLote: k,
          cantidad: 0,
          ids: [],
          idsFuera: f.ids,
          promediado: false,
          costo_usd: redondear(f.costoTotal / total),
          precio_usd: redondear(f.precioTotal / total),
          fuera: { revendedor: f.revendedor, sena: f.sena },
        };
      });
    return sinUnidades.length > 0 ? ordenar([...lotes, ...sinUnidades]) : lotes;
  };
  // Los lotes sin unidades en el local no tienen ids propios: se identifican por la clave del lote
  const idDeFila = (lote) => (lote.cantidad === 0 ? 'sin-unidades-' + lote.claveLote : lote.ids[0]);
  // Unidades sobre las que actua "Editar": las del local o, si no queda ninguna, las que estan afuera
  const idsEditables = (lote) => (lote.cantidad === 0 ? lote.idsFuera : lote.ids);

  // Abre la pestana Revendedores o Senas mostrando a quienes tienen unidades de ese lote
  const verQuienLoTiene = (lote, tabla, cuenta) => {
    const claveFn = tabla === 'celulares' ? claveCelular : claveAccesorio;
    const clave = claveFn(lote);
    const abiertos = { ...revAbiertos };
    gruposDe(cuenta).forEach((g) => {
      if (g.lotes.some((l) => l.tabla === tabla && claveFn(l) === clave)) abiertos[claveDesplegable(g)] = true;
    });
    setRevAbiertos(abiertos);
    cambiarTab(cuenta === 'sena' ? 'senas' : 'revendedores');
  };

  const celularesVisibles = filtrarStock(
    conUnidadesFuera(stockCelulares, 'celulares', claveCelular, ordenarCelulares),
    ['modelo', 'capacidad', 'color', 'detalles']
  );
  const accesoriosVisibles = filtrarStock(
    conUnidadesFuera(stockAccesorios, 'accesorios', claveAccesorio, ordenarAccesorios),
    ['tipo', 'modelo', 'color', 'detalles']
  );

  // Ventas reales mas cobros a cuenta de revendedores (estimados), del mas nuevo al mas viejo
  const movimientosGlobales = [...ventasGlobales, ...cobrosEstimados].sort(
    (a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta)
  );

  const mesesDisponibles = [...new Set(movimientosGlobales.map((v) => obtenerMesAnio(v.fecha_venta)))]
    .filter((m) => m !== 'Sin fecha')
    .sort()
    .reverse();

  const ventasFiltradas =
    mesSeleccionado === 'todos'
      ? movimientosGlobales
      : movimientosGlobales.filter((v) => obtenerMesAnio(v.fecha_venta) === mesSeleccionado);

  // Los cobros a cuenta no son unidades vendidas: no suman en "Items vendidos"
  const totalVendidos = ventasFiltradas.filter((v) => v.categoria !== 'cobro').length;
  const cobrosFiltrados = ventasFiltradas.filter((v) => v.categoria === 'cobro');
  const gananciaCobrosUSD = cobrosFiltrados.reduce((acc, v) => acc + gananciaDe(v), 0);
  const gananciaVentasUSD = ventasFiltradas.reduce((acc, item) => acc + gananciaDe(item), 0);
  const gananciaVentasARS = ventasFiltradas.reduce((acc, item) => acc + gananciaDe(item) * cotizacionDe(item), 0);
  // Hay ventas cuyo costo se paso a pesos con una cotizacion distinta de la de venta
  const hayCotizacionCosto = ventasFiltradas.some((v) => cotizacionCostoDe(v) !== cotizacionDe(v));

  // En el historial, las unidades iguales que salieron en la misma venta (mismo momento, mismo
  // precio) van en un solo renglon: "20 x Funda". precio_usd y costo_usd pasan a ser los totales
  // del renglon. Los resumenes de arriba siguen contando unidad por unidad.
  const ventasAgrupadas = (() => {
    const grupos = new Map();
    ventasFiltradas.forEach((v) => {
      const precio = Number(v.precio_usd) || 0;
      const costo = Number(v.costo_usd) || 0;
      const clave =
        v.categoria === 'cobro' || !v.fecha_venta
          ? [v.categoria, v.cuenta || '', v.id].join('|')
          : [
              v.categoria,
              v.categoria === 'celular' ? claveCelular(v) : claveAccesorio(v),
              v.fecha_venta,
              precio,
              Number(v.cotizacion_venta) || 0,
              Number(v.cotizacion_costo) || 0,
              permutaDe(v),
            ].join('|');
      const grupo = grupos.get(clave);
      if (grupo) {
        grupo.cantidad += 1;
        grupo.ids.push(v.id);
        grupo.precio_usd += precio;
        grupo.costo_usd += costo;
        grupo.permuta_usd += permutaDe(v);
      } else {
        grupos.set(clave, {
          ...v,
          claveGrupo: clave,
          cantidad: 1,
          ids: [v.id],
          precioUnidadUsd: precio,
          precio_usd: precio,
          costo_usd: costo,
          permuta_usd: permutaDe(v),
        });
      }
    });
    return [...grupos.values()];
  })();

  const ventasPorPagina = esEscritorio ? VENTAS_POR_PAGINA : 5;
  const totalPaginas = Math.ceil(ventasAgrupadas.length / ventasPorPagina);
  const pagina = Math.min(paginaActual, Math.max(1, totalPaginas));
  const ventasPaginadas = ventasAgrupadas.slice((pagina - 1) * ventasPorPagina, pagina * ventasPorPagina);

  // Total vendido por mes (ultimos 12 meses con ventas), en pesos a la cotizacion de cada
  // venta (las que no tienen ese dato usan la actual). En las permutas cuenta lo cobrado en
  // plata: el equipo recibido suma recien cuando se vende, asi no se cuenta dos veces.
  const resumenMensual = mesesDisponibles.slice(0, 12).map((mes) => {
    const ventasMes = movimientosGlobales.filter((v) => obtenerMesAnio(v.fecha_venta) === mes);
    const totalUsd = ventasMes.reduce((acc, v) => acc + cobradoDe(v), 0);
    const totalArs = ventasMes.reduce((acc, v) => acc + cobradoDe(v) * cotizacionDe(v), 0);
    const cobrosArs = ventasMes
      .filter((v) => v.categoria === 'cobro')
      .reduce((acc, v) => acc + (Number(v.precio_usd) || 0) * cotizacionDe(v), 0);
    return { mes, unidades: ventasMes.filter((v) => v.categoria !== 'cobro').length, totalUsd, totalArs, cobrosArs };
  });

  const gananciaPorMes = mesesDisponibles
    .slice(0, 6)
    .reverse()
    .map((mes) => {
      const ventasMes = movimientosGlobales.filter((v) => obtenerMesAnio(v.fecha_venta) === mes);
      const ganancia = ventasMes.reduce((acc, c) => acc + gananciaDe(c), 0);
      const [, month] = mes.split('-');
      return { name: MESES[parseInt(month) - 1] + ' ' + mes.slice(0, 4), Ganancia: redondear(ganancia) };
    });

  // Con un mes elegido, el grafico muestra de donde salio la ganancia de ese mes:
  // los 5 modelos (o tipos de accesorio) que mas dejaron y el resto agrupado en "Otros"
  const gananciaPorModelo = (() => {
    const totales = {};
    ventasFiltradas.forEach((v) => {
      const nombre = String((v.categoria === 'celular' ? v.modelo : v.categoria === 'cobro' ? 'Cobros a cuenta (estimado)' : v.tipo) || 'Sin nombre').trim();
      totales[nombre] = (totales[nombre] || 0) + gananciaDe(v);
    });
    const ordenados = Object.entries(totales)
      .map(([name, ganancia]) => ({ name, Ganancia: redondear(ganancia) }))
      .sort((a, b) => b.Ganancia - a.Ganancia);
    if (ordenados.length <= COLORES_GRAFICO.length) return ordenados;
    const principales = ordenados.slice(0, COLORES_GRAFICO.length - 1);
    const resto = ordenados.slice(COLORES_GRAFICO.length - 1).reduce((acc, d) => acc + d.Ganancia, 0);
    return [...principales, { name: 'Otros', Ganancia: redondear(resto) }];
  })();

  const graficoPorMes = mesSeleccionado === 'todos';
  const tituloGrafico = graficoPorMes
    ? 'Ganancia por mes (ultimos 6 meses, USD)'
    : 'Ganancia de ' + formatearNombreMes(mesSeleccionado) + ' por modelo (USD)';

  // Una torta no puede dibujar valores negativos: una porcion con perdida ocupa 0 en el grafico
  // pero conserva su valor real en la lista
  const datosGrafico = (graficoPorMes ? gananciaPorMes : gananciaPorModelo)
    .map((d, i) => ({ ...d, valor: Math.max(0, d.Ganancia), color: COLORES_GRAFICO[i % COLORES_GRAFICO.length] }));
  const totalGrafico = datosGrafico.reduce((acc, d) => acc + d.Ganancia, 0);
  const totalTorta = datosGrafico.reduce((acc, d) => acc + d.valor, 0);

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 bg-gray-50">Cargando...</div>;
  }

  const claseTab = (tab) =>
    'py-2.5 px-3 md:px-6 text-sm font-bold rounded-xl border transition ' +
    (activeTab === tab ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50');

  const claseBotonAgregar = 'flex-1 bg-blue-600 text-white py-3 md:py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition text-sm disabled:opacity-60';

  return (
    <div className="min-h-screen p-3 md:p-8 text-gray-800 bg-gray-50 overflow-x-hidden">
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
        {/* Dos cotizaciones: la de venta (precios y cobros) y la de costo (mercaderia). La de costo
            vacia usa la de venta. */}
        <div className="grid grid-cols-2 md:flex gap-2 md:gap-3 items-stretch">
          <label className="flex items-center min-w-0 bg-white p-1.5 rounded-xl shadow-sm border border-gray-200" title="Cotizacion del dolar para los precios de venta, los cobros y el catalogo">
            <span className="font-semibold px-2 text-green-600 text-[11px] md:text-xs uppercase whitespace-nowrap">Venta $</span>
            <input
              type="number"
              min="0"
              aria-label="Cotizacion de venta"
              value={cotizacion}
              onChange={(e) => setCotizacion(e.target.value)}
              className="flex-1 min-w-0 md:flex-none md:w-20 border-l pl-2 py-1 outline-none font-bold text-base md:text-sm text-gray-700 bg-transparent"
            />
          </label>
          <label className="flex items-center min-w-0 bg-white p-1.5 rounded-xl shadow-sm border border-gray-200" title="Cotizacion del dolar para el costo de la mercaderia. Vacia = la misma que la de venta">
            <span className="font-semibold px-2 text-red-500 text-[11px] md:text-xs uppercase whitespace-nowrap">Costo $</span>
            <input
              type="number"
              min="0"
              aria-label="Cotizacion de costo"
              value={cotizacionCosto}
              placeholder={String(cotizacion)}
              onChange={(e) => setCotizacionCosto(e.target.value)}
              className="flex-1 min-w-0 md:flex-none md:w-20 border-l pl-2 py-1 outline-none font-bold text-base md:text-sm text-gray-700 bg-transparent"
            />
          </label>
          <button
            onClick={conBloqueo(handleActualizarConfiguracion)}
            className="col-span-2 md:col-span-1 bg-gray-900 text-white px-4 py-2.5 md:py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 md:gap-8 max-w-6xl mx-auto w-full">
        {/* TABS */}
        <div className="grid grid-cols-2 md:flex gap-2">
          <button onClick={() => cambiarTab('celulares')} className={claseTab('celulares')}>Celulares</button>
          <button onClick={() => cambiarTab('accesorios')} className={claseTab('accesorios')}>Accesorios</button>
          <button onClick={() => cambiarTab('revendedores')} className={claseTab('revendedores')}>
            Revendedores{enRevendedor.length > 0 ? ' (' + enRevendedor.length + ')' : ''}
          </button>
          <button onClick={() => cambiarTab('senas')} className={claseTab('senas')}>
            Señas{enSena.length > 0 ? ' (' + enSena.length + ')' : ''}
          </button>
          <button onClick={() => cambiarTab('ventas')} className={claseTab('ventas') + ' col-span-2 md:col-span-1'}>Ventas</button>
        </div>

        {/* ===================== TAB CELULARES ===================== */}
        {activeTab === 'celulares' && (
          <div className="space-y-4 md:space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => setFormAbierto(!formVisible)}
                aria-expanded={formVisible}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <span className="text-lg font-bold text-gray-800">Nuevo Ingreso de Celular</span>
                <span className="shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
                  {formVisible ? 'Cerrar' : '+ Agregar'}
                </span>
              </button>
              {formVisible && (
              <div className="mt-4 md:mt-5">
              <form onSubmit={conBloqueo(handleGuardarCelular)} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input required name="modelo" value={formCelular.modelo} onChange={handleChangeCelular} type="text" placeholder="Mod. (Ej: 14 PRO)" className={claseInput} />
                  <input required name="capacidad" value={formCelular.capacidad} onChange={handleChangeCelular} type="text" placeholder="Cap. (Ej: 128)" className={claseInput} />
                  <ListaConOtro
                    key={'color-celular-' + ingresosGuardados}
                    opciones={COLORES}
                    valor={formCelular.color}
                    onCambio={(color) => setFormCelular({ ...formCelular, color })}
                    clase={claseInput}
                    vacio="Color..."
                    otro="Otro (escribir)"
                    placeholderOtro="Escribi el color"
                    ariaLabel="Color"
                    requerido
                  />
                  <input required name="bateria" value={formCelular.bateria} onChange={handleChangeCelular} type="number" min="0" max="100" placeholder="Bateria %" className={claseInput} />
                  <div className="flex flex-col min-w-0">
                    <input required name="costo_usd" value={formCelular.costo_usd} onChange={handleChangeCelular} type="number" min="0" step="any" placeholder="Costo (USD)" className={claseInput} />
                    <PesosDe usd={formCelular.costo_usd} cot={cotCosto} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <input required name="precio_usd" value={formCelular.precio_usd} onChange={handleChangeCelular} type="number" min="0" step="any" placeholder="Venta (USD)" className={claseInput} />
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
              )}
            </div>

            <ResumenStock etiqueta="Total Celulares" stats={statsCelulares} />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <EncabezadoStock titulo="Stock de Celulares" columna="Equipo" stats={statsCelulares} lotes={stockCelulares.length} busqueda={busquedaStock} onBusqueda={setBusquedaStock} />
              <div className="divide-y divide-gray-100 md:max-h-[400px] md:overflow-y-auto">
                {agruparFamilias(celularesVisibles, (c) => familiaDeModelo(c.modelo)).map((familia) => {
                  const abierta = familiaAbierta('celulares', familia.clave);
                  return (
                    <Fragment key={familia.clave}>
                      <EncabezadoFamilia
                        familia={familia}
                        abierta={abierta}
                        cot={cot}
                        onAlternar={() => alternarFamilia('celulares', familia.clave, abierta)}
                      />
                      {abierta && familia.items.map((celu) =>
                  editandoCelularId === idDeFila(celu) ? (
                    <div key={idDeFila(celu)} className="p-3 md:p-4 bg-blue-50/40">
                      {celu.cantidad === 0 && <AvisoEdicionFuera />}
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
                        <Campo etiqueta="Costo USD">
                          <input className={claseInputEdicion} name="costo_usd" type="number" min="0" step="any" value={formEdicionCelular.costo_usd ?? ''} onChange={handleChangeEdicionCelular} />
                          <PesosDe usd={formEdicionCelular.costo_usd} cot={cotCosto} />
                        </Campo>
                        <Campo etiqueta="Venta USD">
                          <input className={claseInputEdicion} name="precio_usd" type="number" min="0" step="any" value={formEdicionCelular.precio_usd ?? ''} onChange={handleChangeEdicionCelular} />
                          <PesosDe usd={formEdicionCelular.precio_usd} cot={cot} />
                        </Campo>
                        <Campo etiqueta="Detalles" className="col-span-2">
                          <input className={claseInputEdicion} name="detalles" value={formEdicionCelular.detalles || ''} onChange={handleChangeEdicionCelular} />
                        </Campo>
                        <SelectorColor
                          etiqueta="Color"
                          valor={formEdicionCelular.color}
                          onCambio={(color) => setFormEdicionCelular({ ...formEdicionCelular, color })}
                        />
                      </div>
                      <AccionesEdicion
                        cantidad={idsEditables(celu).length}
                        valor={formEdicionCelular.cantidadAEditar}
                        onChange={handleChangeEdicionCelular}
                        onGuardar={conBloqueo(guardarEdicionCelular)}
                        onCancelar={() => setEditandoCelularId(null)}
                      />
                    </div>
                  ) : (
                    <FilaStock
                      key={idDeFila(celu)}
                      item={celu}
                      titulo={celu.modelo + ' ' + (celu.capacidad || '')}
                      subtitulo={['Bateria ' + celu.bateria + '%', celu.detalles].filter(Boolean)}
                      cot={cot}
                      cotCosto={cotCosto}
                      onOpciones={(e) => abrirMenu(e, celu, 'celulares')}
                    />
                  )
                )}
                    </Fragment>
                  );
                })}
              </div>
              {celularesVisibles.length === 0 && (
                <p className="text-center p-8 text-gray-500">
                  {busquedaStock.trim() ? 'Ningun equipo coincide con la busqueda.' : 'No hay celulares en stock.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB ACCESORIOS ===================== */}
        {activeTab === 'accesorios' && (
          <div className="space-y-4 md:space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => setFormAbierto(!formVisible)}
                aria-expanded={formVisible}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <span className="text-lg font-bold text-gray-800">Nuevo Ingreso de Accesorio</span>
                <span className="shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
                  {formVisible ? 'Cerrar' : '+ Agregar'}
                </span>
              </button>
              {formVisible && (
              <div className="mt-4 md:mt-5">
              <form onSubmit={conBloqueo(handleGuardarAccesorio)} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <input required name="tipo" value={formAccesorio.tipo} onChange={handleChangeAccesorio} type="text" placeholder="Tipo (Ej: Funda)" className={claseInput} />
                  <input required name="modelo" value={formAccesorio.modelo} onChange={handleChangeAccesorio} type="text" placeholder="Mod. (Ej: iPhone 13)" className={claseInput} />
                  <ListaConOtro
                    key={'color-accesorio-' + ingresosGuardados}
                    opciones={COLORES}
                    valor={formAccesorio.color}
                    onCambio={(color) => setFormAccesorio({ ...formAccesorio, color })}
                    clase={claseInput}
                    vacio="Color / Diseno..."
                    otro="Otro (escribir)"
                    placeholderOtro="Escribi el color o diseno"
                    ariaLabel="Color o diseno"
                    requerido
                  />
                  <div className="flex flex-col min-w-0">
                    <input required name="costo_usd" value={formAccesorio.costo_usd} onChange={handleChangeAccesorio} type="number" min="0" step="any" placeholder="Costo (USD)" className={claseInput} />
                    <PesosDe usd={formAccesorio.costo_usd} cot={cotCosto} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <input required name="precio_usd" value={formAccesorio.precio_usd} onChange={handleChangeAccesorio} type="number" min="0" step="any" placeholder="Venta (USD)" className={claseInput} />
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
              )}
            </div>

            <ResumenStock etiqueta="Total Accesorios" stats={statsAccesorios} />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <EncabezadoStock titulo="Stock de Accesorios" columna="Accesorio" stats={statsAccesorios} lotes={stockAccesorios.length} busqueda={busquedaStock} onBusqueda={setBusquedaStock} />
              <div className="divide-y divide-gray-100 md:max-h-[400px] md:overflow-y-auto">
                {agruparFamilias(accesoriosVisibles, (x) => x.tipo).map((familia) => {
                  const abierta = familiaAbierta('accesorios', familia.clave);
                  return (
                    <Fragment key={familia.clave}>
                      <EncabezadoFamilia
                        familia={familia}
                        abierta={abierta}
                        cot={cot}
                        onAlternar={() => alternarFamilia('accesorios', familia.clave, abierta)}
                      />
                      {abierta && familia.items.map((acc) =>
                  editandoAccesorioId === idDeFila(acc) ? (
                    <div key={idDeFila(acc)} className="p-3 md:p-4 bg-blue-50/40">
                      {acc.cantidad === 0 && <AvisoEdicionFuera />}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <Campo etiqueta="Tipo">
                          <input className={claseInputEdicion} name="tipo" value={formEdicionAccesorio.tipo || ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <Campo etiqueta="Modelo">
                          <input className={claseInputEdicion} name="modelo" value={formEdicionAccesorio.modelo || ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <Campo etiqueta="Costo USD">
                          <input className={claseInputEdicion} name="costo_usd" type="number" min="0" step="any" value={formEdicionAccesorio.costo_usd ?? ''} onChange={handleChangeEdicionAccesorio} />
                          <PesosDe usd={formEdicionAccesorio.costo_usd} cot={cotCosto} />
                        </Campo>
                        <Campo etiqueta="Venta USD">
                          <input className={claseInputEdicion} name="precio_usd" type="number" min="0" step="any" value={formEdicionAccesorio.precio_usd ?? ''} onChange={handleChangeEdicionAccesorio} />
                          <PesosDe usd={formEdicionAccesorio.precio_usd} cot={cot} />
                        </Campo>
                        <Campo etiqueta="Detalles">
                          <input className={claseInputEdicion} name="detalles" value={formEdicionAccesorio.detalles || ''} onChange={handleChangeEdicionAccesorio} />
                        </Campo>
                        <SelectorColor
                          etiqueta="Color / Diseno"
                          valor={formEdicionAccesorio.color}
                          onCambio={(color) => setFormEdicionAccesorio({ ...formEdicionAccesorio, color })}
                        />
                      </div>
                      <AccionesEdicion
                        cantidad={idsEditables(acc).length}
                        valor={formEdicionAccesorio.cantidadAEditar}
                        onChange={handleChangeEdicionAccesorio}
                        onGuardar={conBloqueo(guardarEdicionAccesorio)}
                        onCancelar={() => setEditandoAccesorioId(null)}
                      />
                    </div>
                  ) : (
                    <FilaStock
                      key={idDeFila(acc)}
                      item={acc}
                      titulo={acc.tipo + ' - ' + acc.modelo}
                      subtitulo={[acc.detalles, (escalas[claveAccesorio(acc)] || []).length > 0 ? 'Con precios por cantidad' : ''].filter(Boolean)}
                      cot={cot}
                      cotCosto={cotCosto}
                      onOpciones={(e) => abrirMenu(e, acc, 'accesorios')}
                    />
                  )
                )}
                    </Fragment>
                  );
                })}
              </div>
              {accesoriosVisibles.length === 0 && (
                <p className="text-center p-8 text-gray-500">
                  {busquedaStock.trim() ? 'Ningun accesorio coincide con la busqueda.' : 'No hay accesorios en stock.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB REVENDEDORES Y TAB SENAS ===================== */}
        {(activeTab === 'revendedores' || activeTab === 'senas') && (
          <div className="space-y-4 md:space-y-6">
            <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border-l-4 border-gray-400 pl-3 min-w-0">
                <p className="text-gray-500 text-[11px] md:text-xs font-semibold uppercase tracking-wider mb-1">{textosTab.unidadesTotales}</p>
                <p className="font-black text-lg md:text-2xl text-gray-800">{unidadesTab}</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-3 min-w-0">
                <p className="text-gray-500 text-[11px] md:text-xs font-semibold uppercase tracking-wider mb-1">Total equipos</p>
                <p className="font-black text-base md:text-xl text-gray-800 break-words">ARS $ {fmt(Math.round(totalEnLaCalleUsd * cot))}</p>
                <p className="text-[11px] font-semibold text-gray-500">USD {fmt(totalEnLaCalleUsd)}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3 min-w-0">
                <p className="text-gray-500 text-[11px] md:text-xs font-semibold uppercase tracking-wider mb-1">Entregado a cuenta</p>
                <p className="font-black text-base md:text-xl text-green-600 break-words">ARS $ {fmt(Math.round(totalEntregadoArs))}</p>
                <p className="text-[11px] font-semibold text-gray-500">USD {fmt(totalEntregadoUsd)}</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-3 min-w-0">
                <p className="text-gray-500 text-[11px] md:text-xs font-semibold uppercase tracking-wider mb-1">Saldo pendiente</p>
                <p className="font-black text-base md:text-xl text-purple-700 break-words">ARS $ {fmt(Math.round(saldoPendienteUsd * cot))}</p>
                <p className="text-[11px] font-semibold text-gray-500">USD {fmt(saldoPendienteUsd)}</p>
              </div>
              <p className="col-span-2 md:col-span-4 text-[11px] text-gray-400">
                {textosTab.explicacion}
              </p>
            </div>

            {cuentaTab === 'revendedor' && (
              <button
                type="button"
                onClick={abrirAltaRevendedor}
                className="w-full md:w-auto bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-purple-700 transition"
              >
                + Agregar revendedor
              </button>
            )}

            {gruposTab.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
                <p className="text-center p-8 text-gray-500">{textosTab.sinCuentas}</p>
              </div>
            )}

            {gruposTab.map((g) => {
              const abierto = revAbiertos[claveDesplegable(g)] === true;
              return (
              <div key={g.nombre} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => alternarRevendedor(g)}
                  aria-expanded={abierto}
                  className={
                    'w-full px-3 md:px-4 py-3 bg-purple-50 hover:bg-purple-100 flex items-center gap-3 text-left transition' +
                    (abierto ? ' border-b border-gray-200' : '')
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold text-gray-900 break-words leading-tight">{g.nombre}</span>
                    <span className="block text-xs font-semibold text-gray-500 mt-0.5">
                      {g.unidades}{textosTab.enSuPoder}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                      {g.saldoUsd < -0.005 ? 'A su favor' : 'Saldo pendiente'}
                    </span>
                    <span className="block text-base md:text-lg font-black text-purple-700">ARS $ {fmt(Math.round(Math.abs(g.saldoUsd) * cot))}</span>
                    <span className="block text-xs font-bold text-gray-500">USD {fmt(Math.abs(g.saldoUsd))}</span>
                  </span>
                  <IconoFlecha abierto={abierto} />
                </button>
                {abierto && (
                <Fragment>
                {g.celular && (
                  <div className="px-3 md:px-4 py-2 border-b border-gray-200 text-xs font-semibold text-gray-600">
                    Celular:{' '}
                    <a href={'tel:' + g.celular.replace(/[^\d+]/g, '')} className="font-bold text-blue-600 hover:underline">
                      {g.celular}
                    </a>
                  </div>
                )}
                {tieneMovimientos(g) && (
                <div className="px-3 md:px-4 py-2 border-b border-gray-200 grid grid-cols-2 gap-2 text-xs font-semibold text-gray-600">
                  <span>
                    Total equipos: <span className="font-bold text-gray-900">ARS $ {fmt(Math.round(g.totalUsd * cot))}</span>
                  </span>
                  <span className="text-right">
                    Entregado a cuenta: <span className="font-bold text-gray-900">ARS $ {fmt(Math.round(Math.max(0, g.creditoArs)))}</span>
                    {g.pagos > 0 ? ' (' + g.pagos + ' pago(s))' : ''}
                  </span>
                  {g.aplicadoArs > 0 && (
                    <span className="col-span-2 text-[11px] font-medium text-gray-500">
                      Ya aplicado a equipos pagados: ARS $ {fmt(Math.round(g.aplicadoArs))} (pasaron al historial de ventas)
                    </span>
                  )}
                </div>
                )}
                {g.movimientos.length > 0 && (
                  <div className="px-3 md:px-4 py-2 border-b border-gray-200">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Pagos registrados</p>
                    <ul className="mt-1 divide-y divide-gray-100">
                      {g.movimientos.map((m) =>
                        m.usd < 0 || m.ars < 0 ? (
                          <li key={m.id} className="py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs font-medium text-gray-500">
                            <span>{fechaCorta(m.fecha)} - Usado en equipos marcados como pagados</span>
                            <span className="font-bold">- ARS $ {fmt(Math.round(-m.ars))}</span>
                          </li>
                        ) : (
                          <li key={m.id} className="py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                            <span className="font-semibold text-gray-600">{fechaCorta(m.fecha)}</span>
                            <span className="flex-1 font-bold text-gray-900">
                              ARS $ {fmt(Math.round(m.ars))}
                              <span className="font-medium text-gray-500"> (USD {fmt(m.usd)})</span>
                            </span>
                            <span className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => setEdicionPago({ cuenta: g.cuenta, nombre: g.nombre, pago: m, monto: Math.round(m.ars) })}
                                className="font-bold text-blue-600 hover:underline py-1"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => pedirEliminarPago(g, m)}
                                className="font-bold text-red-500 hover:underline py-1"
                              >
                                Eliminar
                              </button>
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
                <div className="px-3 md:px-4 py-2 border-b border-gray-200 flex flex-wrap gap-2">
                  {tieneMovimientos(g) && (
                    <button
                      type="button"
                      onClick={() => setPagoRevendedor({ cuenta: g.cuenta, nombre: g.nombre, monto: '' })}
                      className="flex-1 md:flex-none bg-green-600 text-white px-3 py-2.5 md:py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition"
                    >
                      Registrar pago
                    </button>
                  )}
                  {saldoCubierto(g.saldoUsd) && (
                    <button
                      type="button"
                      onClick={() => confirmarCierreCuenta(g)}
                      className="flex-1 md:flex-none bg-gray-900 text-white px-3 py-2.5 md:py-1.5 rounded-lg text-xs font-bold hover:bg-gray-800 transition"
                    >
                      Cerrar cuenta
                    </button>
                  )}
                  {cuentaTab === 'revendedor' && (
                    <Fragment>
                      <button
                        type="button"
                        onClick={() => abrirEdicionRevendedor(g)}
                        className="flex-1 md:flex-none bg-white border border-gray-300 text-gray-800 px-3 py-2.5 md:py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
                      >
                        Editar datos
                      </button>
                      <button
                        type="button"
                        onClick={() => pedirEliminarRevendedor(g)}
                        className="flex-1 md:flex-none bg-white border border-gray-300 text-red-500 px-3 py-2.5 md:py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 transition"
                      >
                        Eliminar
                      </button>
                    </Fragment>
                  )}
                </div>
                {g.lotes.length === 0 && <p className="px-3 md:px-4 py-3 text-xs text-gray-500">{textosTab.sinEquipos}</p>}
                <div className="divide-y divide-gray-100">
                  {g.lotes.map((lote) => (
                    <div key={lote.tabla + '-' + lote.ids[0]} className="p-3 md:px-4 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                      <div className="min-w-0 md:flex-1">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 bg-purple-600 text-white px-2 py-0.5 rounded text-xs font-bold shadow-sm">{lote.cantidad} u.</span>
                          <span className="min-w-0 break-words font-bold text-gray-900 text-sm leading-tight">
                            {lote.tabla === 'celulares' ? lote.modelo + ' ' + (lote.capacidad || '') : lote.tipo + ' - ' + lote.modelo}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-gray-600">
                          {lote.color && (
                            <span className="inline-flex items-center gap-1">
                              <CirculoColor color={lote.color} soloCirculo />
                              {lote.color}
                            </span>
                          )}
                          {lote.tabla === 'celulares' && <span>Bateria {lote.bateria}%</span>}
                          {lote.detalles && <span className="break-words min-w-0">{lote.detalles}</span>}
                        </div>
                        {lote.fecha_revendedor && (
                          <p className="mt-1 text-[11px] font-semibold text-purple-700">
                            {textosTab.desde}{diaEntrega(lote)} (hace {diasDesde(lote.fecha_revendedor)} dia(s))
                          </p>
                        )}
                      </div>
                      <div className="text-sm font-bold text-gray-800 md:text-right md:w-44">
                        USD {fmt(lote.precioTotal)}
                        <span className="block text-[11px] font-semibold text-gray-500">ARS $ {fmt(Math.round(lote.precioTotal * cot))}</span>
                        {lote.cantidad > 1 && (
                          <span className="block text-[11px] font-semibold text-gray-400">USD {fmt(lote.precioUnidad)} c/u</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => confirmarResolucion(lote, 'vendido')}
                          className="flex-1 md:flex-none bg-green-600 text-white px-3 py-2.5 md:py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition"
                        >
                          Pagado
                        </button>
                        <button
                          onClick={() => confirmarResolucion(lote, 'disponible')}
                          className="flex-1 md:flex-none bg-gray-200 text-gray-800 px-3 py-2.5 md:py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300 transition"
                        >
                          {textosTab.devolver}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                </Fragment>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* ===================== TAB VENTAS ===================== */}
        {activeTab === 'ventas' && (
        <div className="space-y-4">
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
              <p className="text-gray-500 text-xs md:text-sm font-medium">Ganancia (ARS)</p>
              <p className="text-xl md:text-3xl font-black mt-1 text-emerald-600 break-words">$ {fmt(gananciaVentasARS)}</p>
            </div>
          </div>

          {cobrosFiltrados.length > 0 && (
            <p className="text-[11px] md:text-xs font-medium text-gray-500">
              La ganancia incluye USD {fmt(gananciaCobrosUSD)} estimados por cobros a cuenta de revendedores y señas. Se calculan con el margen
              de los equipos de cada cuenta y se reemplazan por las ventas reales cuando se cierra.
            </p>
          )}

          {hayCotizacionCosto && (
            <p className="text-[11px] md:text-xs font-medium text-gray-500">
              La ganancia descuenta el costo a la cotizacion de costo del dia de cada venta, y se muestra en dolares a la cotizacion de venta.
            </p>
          )}

          {resumenMensual.length > 0 && (
            <div>
              <h3 className="text-xs md:text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Total vendido por mes</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {resumenMensual.map((r) => (
                  <button
                    key={r.mes}
                    type="button"
                    onClick={() => { setMesSeleccionado(mesSeleccionado === r.mes ? 'todos' : r.mes); setPaginaActual(1); }}
                    className={
                      'min-w-0 text-left bg-white p-3 md:p-4 rounded-2xl shadow-sm border transition ' +
                      (mesSeleccionado === r.mes ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300')
                    }
                  >
                    <span className="block text-[11px] md:text-xs font-bold text-gray-500 uppercase tracking-wide">{formatearNombreMes(r.mes)}</span>
                    <span className="block text-base md:text-xl font-black text-gray-900 mt-1 break-words">ARS $ {fmt(Math.round(r.totalArs))}</span>
                    <span className="block text-[11px] font-semibold text-gray-500 mt-0.5">USD {fmt(r.totalUsd)} - {r.unidades} venta(s)</span>
                    {r.cobrosArs > 0 && (
                      <span className="block text-[10px] font-semibold text-purple-700 mt-0.5">
                        Incluye ARS $ {fmt(Math.round(r.cobrosArs))} cobrados a cuenta
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Pesos a la cotizacion del dia de cada venta (las ventas sin ese dato usan la cotizacion actual). Los cobros a cuenta de revendedores y las señas cuentan en el mes en que se cobraron. Toca un mes para filtrar el historial.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {datosGrafico.length > 0 && (
              <div className="min-w-0 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-xs md:text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider text-center">
                  {tituloGrafico}
                </h3>
                <div className="relative h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosGrafico}
                        dataKey="valor"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="92%"
                        paddingAngle={datosGrafico.length > 1 ? 2 : 0}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {datosGrafico.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(valor, nombre, entrada) => ['USD ' + fmt(entrada.payload.Ganancia), nombre]}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total</span>
                    <span className="text-lg font-black text-gray-800">$ {fmt(totalGrafico)}</span>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {datosGrafico.map((d) => (
                    <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 min-w-0 font-semibold text-gray-700">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="font-bold text-gray-900 whitespace-nowrap">
                        USD {fmt(d.Ganancia)}{' '}
                        <span className="font-semibold text-gray-400">
                          ({totalTorta > 0 ? Math.round((d.valor / totalTorta) * 100) : 0}%)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              className={
                'min-w-0 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col ' +
                (datosGrafico.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3')
              }
            >
              <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-100 content-start">
                {ventasPaginadas.map((item) => {
                  const ganancia = gananciaDe(item);
                  return (
                    <div key={item.claveGrupo} className="p-3 bg-white flex items-center justify-between gap-3 hover:bg-gray-50 transition">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                          {item.categoria === 'cobro' ? CUENTAS[item.cuenta].cobro : item.categoria} - {item.fecha_venta ? new Date(item.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha'}
                        </span>
                        <div className="font-semibold text-gray-800 text-sm break-words">
                          {item.cantidad > 1 && (
                            <span className="mr-1.5 px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-gray-900 text-xs font-black whitespace-nowrap">
                              {item.cantidad} x
                            </span>
                          )}
                          {item.categoria === 'celular'
                            ? item.modelo + ' ' + (item.capacidad || '')
                            : item.categoria === 'cobro'
                            ? item.revendedor
                            : item.tipo + ' - ' + item.modelo}
                          <CirculoColor color={item.color} />
                        </div>
                        {/* Total de la venta, en pesos a la cotizacion de ese dia y en dolares.
                            En una permuta se muestra lo cobrado en plata y, aparte, el equipo recibido. */}
                        <div className="text-[11px] font-semibold text-gray-500">
                          {item.categoria === 'cobro' || permutaDe(item) > 0 ? 'Cobrado' : 'Venta'}:{' '}
                          <span className="font-bold text-gray-800">ARS $ {fmt(Math.round(cobradoDe(item) * cotizacionDe(item)))}</span>
                          {' - USD '}
                          {fmt(cobradoDe(item))}
                          {item.cantidad > 1 ? ' (USD ' + fmt(item.precioUnidadUsd) + ' c/u)' : ''}
                          {item.categoria === 'cobro' ? ' - ganancia estimada' : ''}
                        </div>
                        {permutaDe(item) > 0 && (
                          <div className="text-[11px] font-semibold text-purple-700">
                            Permuta: mas un equipo tomado en ARS $ {fmt(Math.round(permutaDe(item) * cotizacionDe(item)))}. Precio total ARS ${' '}
                            {fmt(Math.round(item.precio_usd * cotizacionDe(item)))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Ganancia USD</span>
                        <span
                          className={
                            'font-bold text-sm px-2 py-1 rounded whitespace-nowrap ' +
                            (ganancia < 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50')
                          }
                        >
                          {ganancia < 0 ? '-' : '+'} $ {fmt(Math.abs(ganancia))}
                        </span>
                        {item.categoria === 'cobro' ? (
                          <span className="flex items-center gap-3 py-1 text-[11px] font-bold">
                            <span className="text-purple-700">Estimado</span>
                            <button onClick={() => verPagosDe(item)} className="text-blue-600 hover:underline">
                              Ver pagos
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-3 py-1 text-[11px] font-bold">
                            <button onClick={() => abrirEdicionVenta(item)} className="text-blue-600 hover:underline">
                              Editar
                            </button>
                            <button onClick={() => confirmarAnulacion(item)} className="text-gray-400 hover:text-red-500 hover:underline">
                              Anular venta
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {ventasFiltradas.length === 0 && <p className="sm:col-span-2 bg-white text-center p-8 text-gray-500">No hay ventas registradas.</p>}
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
        )}
      </div>

      {/* FOOTER: ocupa todo el ancho, por fuera del margen de la pagina */}
      <FirmaLambda
        className="mt-12 -mx-3 -mb-3 md:-mx-8 md:-mb-8"
        ancho="max-w-6xl"
        espacioInferior={carrito.length > 0 && !carritoAbierto}
      />

      {/* MENU DESPLEGABLE DE OPCIONES (posicion fija, no se recorta por el scroll de la lista) */}
      {menu && (
        <Fragment>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className={'fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden ' + (menu.item.cantidad === 0 ? 'w-52' : 'w-40')}
            style={{ top: menu.top, right: menu.right }}
          >
            {menu.item.cantidad === 0 ? (
              /* Lote sin unidades en el local: se puede reponer, corregir sus datos o ir a quien lo tiene.
                 Vender y borrar actuan sobre unidades del local, asi que aca no aparecen. */
              <div className="flex flex-col">
                <button
                  onClick={() => {
                    const { item, tabla } = menu;
                    setMenu(null);
                    setSuma({ item, tabla, cantidad: 1 });
                  }}
                  className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
                >
                  Sumar stock
                </button>
                <button
                  onClick={() => {
                    const { item, tabla } = menu;
                    setMenu(null);
                    if (tabla === 'celulares') iniciarEdicionCelular(item);
                    else iniciarEdicionAccesorio(item);
                  }}
                  className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
                >
                  Editar
                </button>
                {menu.item.fuera.revendedor > 0 && (
                  <button
                    onClick={() => {
                      const { item, tabla } = menu;
                      setMenu(null);
                      verQuienLoTiene(item, tabla, 'revendedor');
                    }}
                    className="px-4 py-3 text-sm font-bold text-purple-700 bg-white hover:bg-purple-50 text-left border-b border-gray-50"
                  >
                    Ver en Revendedores ({menu.item.fuera.revendedor})
                  </button>
                )}
                {menu.item.fuera.sena > 0 && (
                  <button
                    onClick={() => {
                      const { item, tabla } = menu;
                      setMenu(null);
                      verQuienLoTiene(item, tabla, 'sena');
                    }}
                    className="px-4 py-3 text-sm font-bold text-amber-700 bg-white hover:bg-amber-50 text-left border-b border-gray-50"
                  >
                    Ver en Señas ({menu.item.fuera.sena})
                  </button>
                )}
                <p className="px-4 py-2.5 text-[11px] font-medium text-gray-500 leading-snug bg-gray-50">
                  Para vender o borrar estas unidades, primero marcalas como devueltas (o cancela la seña): vuelven al stock con todas las opciones.
                </p>
              </div>
            ) : (
            <div className="flex flex-col">
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  if (tabla === 'celulares') iniciarEdicionCelular(item);
                  else iniciarEdicionAccesorio(item);
                }}
                className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
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
                  setSuma({ item, tabla, cantidad: 1 });
                }}
                className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
              >
                Sumar stock
              </button>
              {menu.tabla === 'accesorios' && (
                <button
                  onClick={() => {
                    const { item } = menu;
                    setMenu(null);
                    abrirEditorEscala(item);
                  }}
                  className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
                >
                  Precios por cantidad
                </button>
              )}
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  agregarAlCarrito(item, tabla);
                }}
                className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
              >
                Al carrito revendedor
              </button>
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  agregarAlCarrito(item, tabla, 'sena');
                }}
                className="px-4 py-3 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 text-left border-b border-gray-50"
              >
                Señar
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
            )}
          </div>
        </Fragment>
      )}

      {/* BOTON FLOTANTE DEL CARRITO */}
      {carrito.length > 0 && !carritoAbierto && (
        <button
          type="button"
          onClick={() => setCarritoAbierto(true)}
          className="fixed bottom-4 right-4 z-30 bg-gray-900 text-white px-4 py-3 rounded-full shadow-xl text-sm font-bold hover:bg-gray-800 transition"
        >
          {textosCarrito.carrito} ({unidadesCarrito})
        </button>
      )}

      {/* MODAL: CARRITO (REVENDEDOR O SENA) */}
      {carritoAbierto && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(confirmarCarrito)}
            autoComplete="off"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">{textosCarrito.carrito}</h2>

            <label className="text-xs font-bold text-gray-600 mt-4 mb-1 block">{textosCarrito.etiquetaNombre}</label>
            {/* En una seña suele ser una persona nueva: arranca listo para escribir el nombre */}
            <ListaConOtro
              opciones={gruposDe(carritoCuenta).map((g) => g.nombre)}
              valor={carritoNombre}
              onCambio={setCarritoNombre}
              clase={claseInputModal}
              vacio={textosCarrito.elegirNombre}
              otro={textosCarrito.nombreNuevo}
              placeholderOtro={textosCarrito.faltaNombre}
              ariaLabel={textosCarrito.etiquetaNombre}
              requerido
              empezarEscribiendo={carritoCuenta === 'sena'}
            />

            {carritoCuenta === 'revendedor' && carritoNombre.trim() && !grupoCarrito && (
              <Fragment>
                <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">Celular del revendedor (opcional)</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={carritoCelular}
                  onChange={(e) => setCarritoCelular(e.target.value)}
                  placeholder="Ej: 388 5123456"
                  className={claseInputModal}
                />
                <p className="text-[11px] font-medium text-gray-500 mt-1">Es un revendedor nuevo: queda guardado en la lista.</p>
              </Fragment>
            )}

            {itemsCarrito.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                {textosCarrito.carritoVacio}
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {itemsCarrito.map((i) => (
                  <li key={i.tabla + '-' + i.id} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-xs font-bold text-gray-800 break-words">
                        {nombreItem(i.lote, i.tabla)}
                        <span className="block text-[11px] font-semibold text-gray-500">
                          Lista: ARS $ {fmt(Math.round(i.lote.precio_usd * cot))} c/u - hay {i.lote.cantidad} en stock
                        </span>
                      </span>
                      <button type="button" onClick={() => quitarDelCarrito(i)} className="shrink-0 text-xs font-bold text-red-500 hover:underline px-1">
                        Quitar
                      </button>
                    </div>
                    <div className="mt-2 flex items-stretch gap-2">
                      <div className="shrink-0 inline-flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
                        <button
                          type="button"
                          aria-label="Restar una unidad"
                          disabled={i.cantidad <= 1}
                          onClick={() => cambiarItemCarrito(i, { cantidad: i.cantidad - 1 })}
                          className="w-8 h-9 font-black text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="min-w-7 px-1 text-center text-sm font-bold text-gray-800">{i.cantidad}</span>
                        <button
                          type="button"
                          aria-label="Sumar una unidad"
                          disabled={i.cantidad >= i.lote.cantidad}
                          onClick={() => cambiarItemCarrito(i, { cantidad: i.cantidad + 1 })}
                          className="w-8 h-9 font-black text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                      <InputPesos
                        value={i.precio}
                        onChange={(precio) => cambiarItemCarrito(i, { precio })}
                        aria-label="Precio acordado por unidad, en pesos"
                        placeholder="Precio por unidad (ARS)"
                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 bg-white text-base md:text-sm font-bold text-gray-800 outline-none focus:border-blue-500"
                      />
                    </div>
                    <p className="mt-1.5 text-right text-xs font-bold text-gray-700">
                      {i.cantidad} x $ {fmt(i.valido ? i.precioArs : 0)} = ARS $ {fmt(Math.round((i.valido ? i.precioArs : 0) * i.cantidad))}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-1">
              <div className="flex justify-between gap-2 text-base font-black text-purple-800">
                <span>Total ({unidadesCarrito} u.)</span>
                <span>ARS $ {fmt(Math.round(totalCarritoArs))}</span>
              </div>
              <p className="text-right text-xs font-bold text-gray-500">{cot ? 'USD ' + fmt(totalCarritoArs / cot) : ''}</p>
            </div>

            <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">{textosCarrito.etiquetaMonto}</label>
            <InputPesos
              value={carritoEntregado}
              onChange={setCarritoEntregado}
              placeholder={textosCarrito.ayudaMonto}
              className={claseInputModal + ' font-bold'}
            />

            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1 text-xs font-semibold text-gray-600">
              {grupoCarrito && (
                <div className="flex justify-between gap-2">
                  <span>Saldo que ya tenia {grupoCarrito.nombre}</span>
                  <span>ARS $ {fmt(Math.round(saldoPrevioArs))}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 text-base font-black text-gray-900">
                <span>Saldo pendiente</span>
                <span>ARS $ {fmt(Math.round(saldoPrevioArs + totalCarritoArs - entregadoCarritoArs))}</span>
              </div>
              <p className="text-[11px] font-medium text-gray-500">
                {textosCarrito.notaCarrito}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setCarrito([]); setCarritoAbierto(false); }}
                className="flex-1 bg-white border border-gray-300 text-red-500 px-3 py-2.5 rounded-lg text-sm font-bold hover:bg-red-50 transition"
              >
                Vaciar
              </button>
              <button
                type="button"
                onClick={() => setCarritoAbierto(false)}
                className="flex-1 bg-gray-200 text-gray-800 px-3 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-300 transition"
              >
                Seguir agregando
              </button>
              <button
                type="submit"
                disabled={guardando || itemsCarrito.length === 0}
                className="disabled:opacity-60 w-full bg-purple-600 text-white px-4 py-3 rounded-lg font-bold shadow-sm hover:bg-purple-700 transition"
              >
                {textosCarrito.confirmar}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PAGO A CUENTA (REVENDEDOR O SENA) */}
      {pagoRevendedor && grupoPago && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(confirmarPagoRevendedor)}
            autoComplete="off"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">Registrar pago</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">{grupoPago.nombre}</p>

            <div className="mt-3 flex justify-between gap-2 text-sm font-semibold text-gray-600">
              <span>Saldo actual</span>
              <span className="font-black text-gray-900">ARS $ {fmt(Math.round(grupoPago.saldoUsd * cot))}</span>
            </div>

            <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">Monto que entrega (pesos ARS)</label>
            <InputPesos
              required
              autoFocus
              value={pagoRevendedor.monto}
              onChange={(monto) => setPagoRevendedor({ ...pagoRevendedor, monto })}
              className={claseInputModal + ' font-bold'}
            />
            {grupoPago.saldoUsd > 0 && (
              <button
                type="button"
                onClick={() => setPagoRevendedor({ ...pagoRevendedor, monto: Math.round(grupoPago.saldoUsd * cot) })}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline py-1"
              >
                Paga todo el saldo
              </button>
            )}

            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex justify-between gap-2 text-base font-black text-gray-900">
                <span>{saldoTrasPagoUsd < -0.005 ? 'Queda a su favor' : 'Saldo despues del pago'}</span>
                <span>ARS $ {fmt(Math.round(Math.abs(saldoTrasPagoUsd) * cot))}</span>
              </div>
              <p className="text-[11px] font-medium text-gray-500 mt-1">
                {saldoCubierto(saldoTrasPagoUsd) && grupoPago.unidades > 0
                  ? 'Con este pago el saldo queda cubierto: sus equipos pasan al historial de ventas.'
                  : 'El pago se guarda con la cotizacion de hoy.'}
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setPagoRevendedor(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-green-700 transition">
                Registrar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PAGA O DEVUELVE (REVENDEDOR) / PAGA O CANCELA (SENA) */}
      {resolucion && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800">
              {resolucion.destino === 'vendido' ? 'Marcar como pagado' : CUENTAS[resolucion.lote.cuenta].tituloDevolucion}
            </h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">
              {resolucion.lote.revendedor}: {nombreItem(resolucion.lote, resolucion.lote.tabla)}
            </p>

            <label className="text-xs font-bold text-gray-600 mt-4 mb-1 block">
              {resolucion.destino === 'vendido' ? 'Cuantas unidades pago?' : CUENTAS[resolucion.lote.cuenta].preguntaDevolucion} (son {resolucion.lote.cantidad})
            </label>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-label="Restar una unidad"
                onClick={() => setResolucion({ ...resolucion, cantidad: Math.max(1, cantidadResolucion - 1) })}
                disabled={cantidadResolucion <= 1}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max={resolucion.lote.cantidad}
                value={resolucion.cantidad}
                onChange={(e) => setResolucion({ ...resolucion, cantidad: e.target.value })}
                onBlur={() => setResolucion({ ...resolucion, cantidad: cantidadResolucion })}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2.5 text-center text-lg font-black text-gray-800 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                aria-label="Sumar una unidad"
                onClick={() => setResolucion({ ...resolucion, cantidad: Math.min(resolucion.lote.cantidad, cantidadResolucion + 1) })}
                disabled={cantidadResolucion >= resolucion.lote.cantidad}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                +
              </button>
            </div>
            {resolucion.lote.cantidad > 1 && (
              <button
                type="button"
                onClick={() => setResolucion({ ...resolucion, cantidad: resolucion.lote.cantidad })}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline py-1"
              >
                Todas ({resolucion.lote.cantidad})
              </button>
            )}

            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              {resolucion.destino === 'vendido' ? (
                <Fragment>
                  <div className="flex justify-between gap-2 text-xs font-semibold text-gray-600">
                    <span>Valor de {cantidadResolucion} unidad(es)</span>
                    <span>ARS $ {fmt(Math.round(valorResolucionUsd * cot))}</span>
                  </div>
                  {aplicaCreditoUsd > 0.005 && (
                    <div className="flex justify-between gap-2 mt-0.5 text-xs font-semibold text-gray-600">
                      <span>Ya entregado a cuenta</span>
                      <span>- ARS $ {fmt(Math.round(aplicaCreditoArs))}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 mt-1 text-base font-black text-gray-800">
                    <span>Cobras ahora</span>
                    <span>ARS $ {fmt(Math.round(cobroAhoraArs))}</span>
                  </div>
                  <p className="text-[11px] font-medium text-gray-500 mt-2">
                    Pasa al historial de ventas con la fecha de hoy, al precio acordado.
                    {aplicaCreditoUsd > 0.005 ? ' Lo que ya entrego a cuenta se descuenta de este pago.' : ''}
                  </p>
                </Fragment>
              ) : (
                <Fragment>
                  <div className="flex justify-between gap-2 text-base font-black text-gray-800">
                    <span>Deja de deber ({cantidadResolucion} u.)</span>
                    <span>ARS $ {fmt(Math.round(valorResolucionUsd * cot))}</span>
                  </div>
                  <p className="text-[11px] font-medium text-gray-500 mt-2">
                    {CUENTAS[resolucion.lote.cuenta].notaDevolucion}
                  </p>
                </Fragment>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setResolucion(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={conBloqueo(ejecutarResolucion)}
                className={
                  'disabled:opacity-60 flex-1 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm transition ' +
                  (resolucion.destino === 'vendido' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800')
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CORREGIR UN PAGO YA REGISTRADO */}
      {edicionPago && grupoEdicionPago && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(guardarEdicionPago)}
            autoComplete="off"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">Corregir pago</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">
              {grupoEdicionPago.nombre} - pago del {fechaCorta(edicionPago.pago.fecha)}
            </p>

            <div className="mt-3 flex justify-between gap-2 text-sm font-semibold text-gray-600">
              <span>Monto anotado</span>
              <span className="font-black text-gray-900">ARS $ {fmt(Math.round(edicionPago.pago.ars))}</span>
            </div>

            <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">Monto correcto (pesos ARS)</label>
            <InputPesos
              required
              autoFocus
              value={edicionPago.monto}
              onChange={(monto) => setEdicionPago({ ...edicionPago, monto })}
              className={claseInputModal + ' font-bold'}
            />

            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex justify-between gap-2 text-base font-black text-gray-900">
                <span>{saldoTrasEdicionUsd < -0.005 ? 'Queda a su favor' : 'Saldo despues de corregir'}</span>
                <span>ARS $ {fmt(Math.round(Math.abs(saldoTrasEdicionUsd) * cot))}</span>
              </div>
              <p className="text-[11px] font-medium text-gray-500 mt-1">
                {saldoCubierto(saldoTrasEdicionUsd) && grupoEdicionPago.unidades > 0
                  ? 'Con este monto el saldo queda cubierto: sus equipos pasan al historial de ventas.'
                  : 'Se mantiene la cotizacion del dia del pago ($ ' + fmt(cotEdicionPago) + ').'}
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setEdicionPago(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CORREGIR EL PRECIO DE UNA VENTA */}
      {edicionVenta && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(guardarEdicionVenta)}
            autoComplete="off"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">Corregir venta</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">
              {edicionVenta.item.cantidad > 1 ? edicionVenta.item.cantidad + ' x ' : ''}
              {nombreItem(edicionVenta.item, edicionVenta.item.categoria === 'celular' ? 'celulares' : 'accesorios')} - venta del{' '}
              {fechaCorta(edicionVenta.item.fecha_venta)}
            </p>

            <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">
              Precio de venta{edicionVenta.item.cantidad > 1 ? ' por unidad' : ''} (pesos ARS)
            </label>
            <InputPesos
              required
              autoFocus
              value={edicionVenta.precio}
              onChange={(precio) => setEdicionVenta({ ...edicionVenta, precio })}
              className={claseInputModal + ' font-bold'}
            />

            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              {edicionVenta.item.cantidad > 1 && (
                <div className="flex justify-between gap-2 text-base font-black text-gray-900">
                  <span>Total ({edicionVenta.item.cantidad} u.)</span>
                  <span>ARS $ {fmt(Math.round((precioEdicionVentaArs || 0) * edicionVenta.item.cantidad))}</span>
                </div>
              )}
              <p className="text-[11px] font-medium text-gray-500 mt-1">
                Se usa la cotizacion del dia de la venta ($ {fmt(cotizacionDe(edicionVenta.item))}). La ganancia se recalcula sola.
                {permutaDe(edicionVenta.item) > 0 ? ' En una permuta este es el precio total del equipo: lo cobrado es ese precio menos el equipo recibido.' : ''}
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setEdicionVenta(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: AGREGAR O EDITAR REVENDEDOR */}
      {revForm && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(guardarRevendedor)}
            autoComplete="off"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">
              {revForm.id || revForm.bloqueaNombre ? 'Datos del revendedor' : 'Agregar revendedor'}
            </h2>

            <label className="text-xs font-bold text-gray-600 mt-4 mb-1 block">Nombre del revendedor</label>
            <input
              required
              autoFocus={!revForm.bloqueaNombre}
              type="text"
              value={revForm.nombre}
              disabled={revForm.bloqueaNombre}
              onChange={(e) => setRevForm({ ...revForm, nombre: e.target.value })}
              placeholder="Coloque nombre del revendedor"
              className={claseInputModal + (revForm.bloqueaNombre ? ' opacity-60' : '')}
            />
            {revForm.bloqueaNombre && (
              <p className="text-[11px] font-medium text-gray-500 mt-1">
                El nombre no se puede cambiar mientras tenga equipos o pagos sin cerrar.
              </p>
            )}

            <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">Celular</label>
            <input
              type="tel"
              inputMode="tel"
              value={revForm.celular}
              onChange={(e) => setRevForm({ ...revForm, celular: e.target.value })}
              placeholder="Ej: 388 5123456"
              className={claseInputModal}
            />

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setRevForm(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-purple-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-purple-700 transition">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PRECIOS POR CANTIDAD DE UN ACCESORIO */}
      {editorEscala && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(guardarEscala)}
            autoComplete="off"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">Precios por cantidad</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">{nombreItem(editorEscala.lote, 'accesorios')}</p>
            <p className="text-[11px] font-medium text-gray-500 mt-1">
              Precio de lista: ARS $ {fmt(Math.round(editorEscala.lote.precio_usd * cot))} por unidad. Cada tramo vale desde la cantidad indicada hasta que empieza el siguiente. Las cantidades que no entran en ningun tramo se venden a precio de lista.
            </p>

            {stockAccesorios.some((l) => l !== editorEscala.lote && (escalas[claveAccesorio(l)] || []).length > 0) && (
              <select
                value=""
                onChange={(e) => copiarEscalaDe(e.target.value)}
                aria-label="Copiar los tramos de otro accesorio"
                className={claseInputModal + ' mt-3 text-gray-700'}
              >
                <option value="">Copiar los tramos de otro accesorio...</option>
                {stockAccesorios
                  .filter((l) => l !== editorEscala.lote && (escalas[claveAccesorio(l)] || []).length > 0)
                  .map((l) => (
                    <option key={l.ids[0]} value={claveAccesorio(l)}>
                      {nombreItem(l, 'accesorios')}
                    </option>
                  ))}
              </select>
            )}

            <ul className="mt-3 space-y-2">
              {editorEscala.filas.map((f, i) => {
                const valor = parseFloat(f.precio);
                return (
                  <li key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{rangoEscala(editorEscala.filas, i)}</span>
                      <button type="button" onClick={() => quitarFilaEscala(i)} className="shrink-0 text-xs font-bold text-red-500 hover:underline px-1">
                        Quitar
                      </button>
                    </div>
                    <div className="mt-1 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                      <Campo etiqueta="Desde (u.)">
                        <input
                          className={claseInputEdicion}
                          type="number"
                          min="1"
                          step="1"
                          value={f.desde}
                          onChange={(e) => cambiarFilaEscala(i, { desde: e.target.value })}
                        />
                      </Campo>
                      <Campo etiqueta={'Precio por unidad (' + (f.moneda === 'ars' ? 'pesos' : 'dolares') + ')'}>
                        {f.moneda === 'ars' ? (
                          <InputPesos className={claseInputEdicion} value={f.precio} onChange={(precio) => cambiarFilaEscala(i, { precio })} />
                        ) : (
                          <input
                            className={claseInputEdicion}
                            type="number"
                            min="0"
                            step="any"
                            value={f.precio}
                            onChange={(e) => cambiarFilaEscala(i, { precio: e.target.value })}
                          />
                        )}
                      </Campo>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="inline-flex shrink-0 border border-gray-300 rounded-lg overflow-hidden" role="group" aria-label="Moneda del precio">
                        {['ars', 'usd'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={f.moneda === m}
                            onClick={() => cambiarMonedaFilaEscala(i, m)}
                            className={'px-3 py-1.5 text-xs font-bold ' + (f.moneda === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100')}
                          >
                            {m === 'ars' ? 'Pesos' : 'Dolares'}
                          </button>
                        ))}
                      </div>
                      <span className="min-w-0 text-right text-[11px] font-bold text-green-600">
                        {valor >= 0 && cot > 0
                          ? (f.moneda === 'ars' ? 'USD ' + fmt(valor / cot) : 'ARS $ ' + fmt(Math.round(valor * cot))) +
                            ' (dolar a $ ' + fmt(cot) + ')'
                          : ''}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={agregarFilaEscala}
              className="mt-2 w-full border border-dashed border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-bold hover:bg-gray-50 transition"
            >
              + Agregar tramo
            </button>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setEditorEscala(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SUMAR STOCK */}
      {suma && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <form
            onSubmit={conBloqueo(sumarStock)}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800">Sumar stock</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">{nombreItem(suma.item, suma.tabla)}</p>

            <label className="text-xs font-bold text-gray-600 mt-4 mb-1 block">
              Cantidad a ingresar (hoy hay {suma.item.cantidad} en stock)
            </label>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-label="Restar una unidad"
                onClick={() => setSuma({ ...suma, cantidad: Math.max(1, cantidadSuma - 1) })}
                disabled={cantidadSuma <= 1}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                autoFocus
                value={suma.cantidad}
                onChange={(e) => setSuma({ ...suma, cantidad: e.target.value })}
                onBlur={() => setSuma({ ...suma, cantidad: cantidadSuma })}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2.5 text-center text-lg font-black text-gray-800 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                aria-label="Sumar una unidad"
                onClick={() => setSuma({ ...suma, cantidad: cantidadSuma + 1 })}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300"
              >
                +
              </button>
            </div>

            <p className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-semibold text-gray-600">
              Se cargan con los mismos datos del lote: costo USD {fmt(suma.item.costo_usd)} y venta USD {fmt(suma.item.precio_usd)} por unidad. El lote pasa a tener {suma.item.cantidad + cantidadSuma} unidades. Si esta compra tuvo otro costo, usa "Nuevo Ingreso" para que se promedie.
            </p>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setSuma(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="disabled:opacity-60 flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition">
                Sumar {cantidadSuma}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: BORRAR DEL STOCK */}
      {borrado && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 md:p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800">Borrar del stock</h2>
            <p className="text-sm font-semibold text-gray-600 mt-1 break-words">{nombreItem(borrado.item, borrado.tabla)}</p>

            <label className="text-xs font-bold text-gray-600 mt-4 mb-1 block">
              Cuantas unidades queres borrar? (hay {borrado.item.cantidad} en stock)
            </label>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-label="Restar una unidad"
                onClick={() => setBorrado({ ...borrado, cantidad: Math.max(1, cantidadBorrado - 1) })}
                disabled={cantidadBorrado <= 1}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max={borrado.item.cantidad}
                value={borrado.cantidad}
                onChange={(e) => setBorrado({ ...borrado, cantidad: e.target.value })}
                onBlur={() => setBorrado({ ...borrado, cantidad: cantidadBorrado })}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2.5 text-center text-lg font-black text-gray-800 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                aria-label="Sumar una unidad"
                onClick={() => setBorrado({ ...borrado, cantidad: Math.min(borrado.item.cantidad, cantidadBorrado + 1) })}
                disabled={cantidadBorrado >= borrado.item.cantidad}
                className="w-12 shrink-0 bg-gray-200 text-gray-800 rounded-lg font-black text-xl hover:bg-gray-300 disabled:opacity-40"
              >
                +
              </button>
            </div>
            {borrado.item.cantidad > 1 && (
              <button
                type="button"
                onClick={() => setBorrado({ ...borrado, cantidad: borrado.item.cantidad })}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline py-1"
              >
                Todas ({borrado.item.cantidad})
              </button>
            )}

            <p className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 text-xs font-semibold text-red-700">
              Se van a borrar {cantidadBorrado} unidad(es) de forma definitiva. Esta accion no se puede deshacer.
            </p>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setBorrado(null)} className="flex-1 bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg font-bold hover:bg-gray-300 transition">
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={conBloqueo(confirmarBorradoElegido)}
                className="disabled:opacity-60 flex-1 bg-red-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-red-700 transition"
              >
                Borrar {cantidadBorrado}
              </button>
            </div>
          </div>
        </div>
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
                Vender todas ({venta.item.cantidad})
              </button>
            )}

            {venta.tabla === 'celulares' && (
              <Fragment>
                <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">
                  Precio final del celular (pesos ARS por unidad)
                </label>
                <InputPesos
                  value={venta.precio}
                  onChange={(precio) => setVenta({ ...venta, precio })}
                  className={claseInputModal + ' font-bold'}
                />
                <p className="text-[11px] font-medium text-gray-500 mt-1">
                  Precio de lista: ARS $ {fmt(Math.round(venta.item.precio_usd * cot))}. Cambialo si lo vendiste a otro precio.
                  {cantidadVenta > 1 ? ' Se aplica a cada una de las ' + cantidadVenta + ' unidades.' : ''}
                </p>

                <label className="text-xs font-bold text-gray-600 mt-3 mb-1 block">
                  Accesorios que se llevo con el celular (opcional)
                </label>
                <select
                  value=""
                  onChange={(e) => agregarAccesorioVenta(e.target.value)}
                  className={claseInputModal + ' text-gray-700'}
                >
                  <option value="">{stockAccesorios.length === 0 ? 'No hay accesorios en stock' : 'Agregar un accesorio...'}</option>
                  {stockAccesorios.map((lote) => {
                    const elegido = accesoriosVenta.find((x) => x.lote === lote);
                    const restantes = lote.cantidad - (elegido ? elegido.cantidad : 0);
                    return (
                      <option key={lote.ids[0]} value={lote.ids[0]} disabled={restantes <= 0}>
                        {lote.tipo} {lote.modelo} {lote.color} - ARS $ {fmt(Math.round(lote.precio_usd * cot))} ({restantes} u.)
                      </option>
                    );
                  })}
                </select>
                {accesoriosVenta.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {accesoriosVenta.map((x) => (
                      <li key={x.id} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-xs font-bold text-gray-800 break-words">
                            {x.lote.tipo} {x.lote.modelo}
                            <span className="block text-[11px] font-semibold text-gray-500">
                              Lista: ARS $ {fmt(Math.round(x.lote.precio_usd * cot))} c/u
                              {x.escala && x.escala.tramo ? ' - por cantidad: ARS $ ' + fmt(Math.round(x.escala.unitarioArs)) + ' c/u' : ''}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => quitarAccesorioVenta(x.id)}
                            className="shrink-0 text-xs font-bold text-red-500 hover:underline px-1"
                          >
                            Quitar
                          </button>
                        </div>
                        <div className="mt-2 flex items-stretch gap-2">
                          <div className="shrink-0 inline-flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
                            <button
                              type="button"
                              aria-label="Restar una unidad"
                              disabled={x.cantidad <= 1}
                              onClick={() => cambiarAccesorioVenta(x.id, { cantidad: x.cantidad - 1 })}
                              className="w-8 h-9 font-black text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                            >
                              -
                            </button>
                            <span className="min-w-7 px-1 text-center text-sm font-bold text-gray-800">{x.cantidad}</span>
                            <button
                              type="button"
                              aria-label="Sumar una unidad"
                              disabled={x.cantidad >= x.lote.cantidad}
                              onClick={() => cambiarAccesorioVenta(x.id, { cantidad: x.cantidad + 1 })}
                              className="w-8 h-9 font-black text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                          <select
                            value={x.modo}
                            onChange={(e) => cambiarAccesorioVenta(x.id, { modo: e.target.value })}
                            aria-label="Precio del accesorio"
                            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 bg-white text-sm font-semibold text-gray-800 outline-none"
                          >
                            <option value="lista">Lista / por cantidad</option>
                            <option value="especial">Precio especial</option>
                            <option value="gratis">Gratis (regalo)</option>
                          </select>
                        </div>
                        {x.modo === 'especial' && (
                          <InputPesos
                            value={x.precio}
                            onChange={(precio) => cambiarAccesorioVenta(x.id, { precio })}
                            placeholder="Precio especial en pesos por unidad"
                            aria-label="Precio especial en pesos por unidad"
                            className="mt-2 border border-gray-300 rounded-lg p-2 w-full min-w-0 bg-white text-sm font-bold text-gray-800 outline-none focus:border-blue-500"
                          />
                        )}
                        <p className="mt-1.5 text-right text-xs font-bold text-gray-700">
                          {x.modo === 'gratis'
                            ? 'Gratis'
                            : 'ARS $ ' + fmt(Math.round((x.precioUsd || 0) * cot * x.cantidad)) + (x.modo === 'especial' ? ' (precio especial)' : '')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] font-medium text-gray-500 mt-1">
                  Al confirmar, cada accesorio elegido se descuenta del stock y queda como vendido al precio indicado (los regalos, a $ 0).
                </p>
              </Fragment>
            )}

            {venta.tabla === 'accesorios' && (escalas[claveAccesorio(venta.item)] || []).length > 0 && (
              <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-3 text-xs font-semibold text-green-700">
                <p className="font-bold">Precios por cantidad de este accesorio</p>
                <ul className="mt-1 space-y-0.5">
                  {describirTramos(escalas[claveAccesorio(venta.item)], venta.item.precio_usd, cot).map((f) => (
                    <li key={f.rango}>
                      {f.rango}: ARS $ {fmt(f.ars)} c/u
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {venta.tabla === 'celulares' ? (
              <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-3">
                <div className="flex justify-between gap-2 text-xs font-semibold text-gray-600">
                  <span>Celular ({cantidadVenta} u.)</span>
                  <span>ARS $ {fmt(Math.round(precioVenta * cantidadVenta * cot))}</span>
                </div>
                {accesoriosVenta.length > 0 && (
                  <div className="flex justify-between gap-2 mt-0.5 text-xs font-semibold text-gray-600">
                    <span>Accesorios ({accesoriosVenta.reduce((acc, a) => acc + a.cantidad, 0)} u.)</span>
                    <span>ARS $ {fmt(Math.round(totalAccesoriosUsd * cot))}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 mt-1 text-base font-black text-green-700">
                  <span>Total a cobrar</span>
                  <span>ARS $ {fmt(totalOperacionArs)}</span>
                </div>
                <p className="text-right text-xs font-bold text-gray-500 mt-0.5">
                  USD {fmt(precioVenta * cantidadVenta + totalAccesoriosUsd)}
                </p>
              </div>
            ) : (
              <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-3">
                {escalaVenta && escalaVenta.tramo && redondear(escalaVenta.unitarioUsd) !== redondear(venta.item.precio_usd) && (
                  <div className="flex justify-between gap-2 text-xs font-semibold text-gray-500">
                    <span>Precio de lista por unidad</span>
                    <span className="line-through">USD {fmt(venta.item.precio_usd)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 text-xs font-semibold text-gray-600">
                  <span>{escalaVenta && escalaVenta.tramo ? 'Precio por cantidad (por unidad)' : 'Precio por unidad'}</span>
                  <span>USD {fmt(precioVenta)}</span>
                </div>
                <div className="flex justify-between gap-2 mt-1 text-base font-black text-green-700">
                  <span>Total ({cantidadVenta} u.)</span>
                  <span>USD {fmt(precioVenta * cantidadVenta)}</span>
                </div>
                <p className="text-right text-xs font-bold text-gray-500 mt-0.5">ARS $ {fmt(Math.round(precioVenta * cantidadVenta * cot))}</p>
              </div>
            )}

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
                <ListaConOtro
                  opciones={COLORES}
                  valor={formPermuta.color}
                  onCambio={(color) => setFormPermuta({ ...formPermuta, color })}
                  clase={claseInputModal}
                  vacio="Elegir color..."
                  otro="Otro (escribir)"
                  placeholderOtro="Escribi el color"
                  ariaLabel="Color"
                  requerido
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Detalles (estado, rayas, caja, etc.)</label>
                <input name="detalles" value={formPermuta.detalles} onChange={handleChangePermuta} type="text" placeholder="Ej: Detalle en pantalla, sin caja" className={claseInputModal} />
              </div>
              <div className="col-span-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="text-xs font-bold text-blue-800 mb-1 block">Precio tomado (Pesos ARS)</label>
                <InputPesos required name="precio_ars" value={formPermuta.precio_ars} onChange={(v) => setFormPermuta({ ...formPermuta, precio_ars: v })} placeholder="Ej: 450.000" className="border border-blue-200 p-2.5 rounded-lg w-full bg-white outline-none font-bold text-gray-800" />
                <p className="text-xs text-blue-600 mt-2 font-bold text-right">
                  Costo: USD {formPermuta.precio_ars && cotCosto ? (formPermuta.precio_ars / cotCosto).toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="col-span-2 bg-green-50 p-3 rounded-lg border border-green-100">
                <label className="text-xs font-bold text-green-800 mb-1 block">Precio de venta (Pesos ARS) - opcional</label>
                <InputPesos name="precio_venta_ars" value={formPermuta.precio_venta_ars} onChange={(v) => setFormPermuta({ ...formPermuta, precio_venta_ars: v })} placeholder="Vacio = igual al costo" className="border border-green-200 p-2.5 rounded-lg w-full bg-white outline-none font-bold text-gray-800" />
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
                    <p className="mt-2 font-medium text-gray-500">
                      Al guardar, una unidad de este equipo queda como vendida. En Ventas cuenta como cobrada solo la diferencia; el
                      equipo que recibis suma cuando lo vendas.
                    </p>
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
