import React, { useState, useEffect, Fragment } from 'react';
import { supabase } from './supabase';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORES = [
  ['Negro', 'Negro'],
  ['Blanco', 'Blanco'],
  ['Plata', 'Plata'],
  ['Gris', 'Gris'],
  ['Oro', 'Oro'],
  ['Rosa', 'Rosa'],
  ['Azul', 'Azul'],
  ['Morado', 'Morado / Purpura'],
  ['Verde', 'Verde'],
  ['Amarillo', 'Amarillo'],
  ['Naranja', 'Naranja'],
  ['Rojo', 'Rojo'],
  ['Titanio', 'Titanio Natural'],
  ['Titanio del Desierto', 'Titanio del Desierto'],
];

function IconoChevron() {
  return (
    <svg className="w-3 h-3 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

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

// Devuelve el nombre canonico del color si coincide con la lista (sin importar mayusculas)
const colorCanonico = (valor) => {
  const v = String(valor || '').trim().toLowerCase();
  const encontrado = COLORES.find(([clave]) => clave.toLowerCase() === v);
  return encontrado ? encontrado[0] : String(valor || '').trim();
};

// La clave de lote NO incluye el costo: el costo se promedia
const claveCelular = (c) =>
  [
    normalizar(c.modelo),
    normalizar(c.capacidad),
    normalizar(c.color),
    Number(c.bateria) || 0,
    Number(c.precio_usd) || 0,
    normalizar(c.detalles),
  ].join('|');

const claveAccesorio = (a) =>
  [
    normalizar(a.tipo),
    normalizar(a.modelo),
    normalizar(a.color),
    Number(a.precio_usd) || 0,
    normalizar(a.detalles),
  ].join('|');

// Agrupa filas iguales y muestra el costo promedio ponderado del lote
const agruparStock = (filas, claveFn) => {
  const grupos = {};
  filas.forEach((f) => {
    const k = claveFn(f);
    if (!grupos[k]) grupos[k] = { ...f, cantidad: 0, ids: [], costoTotal: 0 };
    grupos[k].cantidad += 1;
    grupos[k].ids.push(f.id);
    grupos[k].costoTotal += Number(f.costo_usd) || 0;
  });
  return Object.values(grupos).map((g) => {
    const promedio = parseFloat((g.costoTotal / g.cantidad).toFixed(2));
    const { costoTotal, ...resto } = g;
    return { ...resto, costo_usd: promedio };
  });
};

// Inserta unidades nuevas y unifica el costo del lote con el promedio ponderado
async function guardarLoteConPromedio(tabla, filaBase, cantidad, claveFn) {
  const costoNuevo = Number(filaBase.costo_usd);

  const { data: existentes, error: errorBusqueda } = await supabase
    .from(tabla)
    .select('*')
    .eq('estado', 'disponible');
  if (errorBusqueda) return { error: errorBusqueda };

  const claveNueva = claveFn(filaBase);
  const mismos = (existentes || []).filter((e) => claveFn(e) === claveNueva);
  const costoActual = mismos.reduce((acc, e) => acc + (Number(e.costo_usd) || 0), 0);
  const promedio = parseFloat(((costoActual + costoNuevo * cantidad) / (mismos.length + cantidad)).toFixed(2));

  const nuevos = Array.from({ length: cantidad }, () => ({
    ...filaBase,
    costo_usd: promedio,
    estado: 'disponible',
  }));

  const { error } = await supabase.from(tabla).insert(nuevos);
  if (error) return { error };

  const idsDesactualizados = mismos.filter((e) => Number(e.costo_usd) !== promedio).map((e) => e.id);
  if (idsDesactualizados.length > 0) {
    const { error: errorUpdate } = await supabase
      .from(tabla)
      .update({ costo_usd: promedio })
      .in('id', idsDesactualizados);
    if (errorUpdate) return { error: errorUpdate };
  }

  return { error: null, promedio, unificadas: mismos.length };
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
  const estadoInicialPermuta = { modelo: '', capacidad: '', color: '', bateria: '', detalles: '', precio_ars: '', precio_venta_ars: '' };

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
  const ventasPorPagina = 10;

  const cot = Number(cotizacion) || 0;

  useEffect(() => {
    document.title = 'Montech | Admin';
    cargarDatos(true);
  }, []);

  useEffect(() => {
    setPaginaActual(1);
  }, [mesSeleccionado]);

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

    const { data: config } = await supabase.from('configuracion').select('*').eq('id', 1).single();
    if (config) {
      setCotizacion(config.cotizacion_dolar);
      if (config.descuento_mayorista !== null && config.descuento_mayorista !== undefined) {
        setDescuentoMayorista(config.descuento_mayorista);
      }
    }

    const { data: celDisponibles } = await supabase
      .from('celulares').select('*').eq('estado', 'disponible').order('fecha_ingreso', { ascending: false });
    if (celDisponibles) {
      setStockCelulares(agruparStock(celDisponibles, claveCelular));
    }

    const { data: accDisponibles } = await supabase
      .from('accesorios').select('*').eq('estado', 'disponible').order('fecha_ingreso', { ascending: false });
    if (accDisponibles) {
      setStockAccesorios(agruparStock(accDisponibles, claveAccesorio));
    }

    const { data: celVendidos } = await supabase.from('celulares').select('*').eq('estado', 'vendido');
    const { data: accVendidos } = await supabase.from('accesorios').select('*').eq('estado', 'vendido');

    let ventasUnificadas = [];
    if (celVendidos) ventasUnificadas = [...ventasUnificadas, ...celVendidos.map((v) => ({ ...v, categoria: 'celular' }))];
    if (accVendidos) ventasUnificadas = [...ventasUnificadas, ...accVendidos.map((v) => ({ ...v, categoria: 'accesorio' }))];
    ventasUnificadas.sort((a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta));
    setVentasGlobales(ventasUnificadas);

    if (mostrarLoader) setCargando(false);
  }

  async function handleActualizarConfiguracion() {
    const { error } = await supabase
      .from('configuracion')
      .update({
        cotizacion_dolar: parseFloat(cotizacion),
        descuento_mayorista: parseFloat(descuentoMayorista),
      })
      .eq('id', 1);
    if (!error) toast.success('Configuracion global actualizada');
    else toast.error('Error al guardar: ' + error.message);
  }

  // Formatea capacidad: agrega GB solo si el valor es numerico
  const formatearCapacidad = (valor) => {
    const v = String(valor || '').trim().toUpperCase();
    if (/^\d+$/.test(v)) return v + 'GB';
    return v;
  };

  // ---------- CSV ----------
  const escaparCsv = (valor) => '"' + String(valor === null || valor === undefined ? '' : valor).replace(/"/g, '""') + '"';

  const exportarCSV = () => {
    let csv = '\ufeffCategoria,Producto,Color,Fecha Venta,Costo USD,Venta USD,Ganancia USD\n';
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

  async function handleGuardarCelular(e) {
    e.preventDefault();
    const cantidad = parseInt(formCelular.cantidad) || 1;
    const filaBase = {
      modelo: formCelular.modelo.trim().toUpperCase(),
      capacidad: formatearCapacidad(formCelular.capacidad),
      color: formCelular.color,
      bateria: parseInt(formCelular.bateria),
      costo_usd: parseFloat(formCelular.costo_usd),
      precio_usd: parseFloat(formCelular.precio_usd),
      detalles: formCelular.detalles.trim(),
    };

    const { error, promedio, unificadas } = await guardarLoteConPromedio('celulares', filaBase, cantidad, claveCelular);
    if (!error) {
      if (unificadas > 0) {
        toast.success(cantidad + ' equipo(s) sumado(s) al lote existente. Costo promedio: USD ' + promedio);
      } else {
        toast.success(cantidad + ' equipo(s) agregado(s)');
      }
      setFormCelular({ ...formCelular, cantidad: 1, color: '' });
      cargarDatos(false);
    } else toast.error('Error al guardar: ' + error.message);
  }

  async function handleGuardarAccesorio(e) {
    e.preventDefault();
    const cantidad = parseInt(formAccesorio.cantidad) || 1;
    const filaBase = {
      tipo: formAccesorio.tipo.trim(),
      modelo: formAccesorio.modelo.trim(),
      color: formAccesorio.color.trim(),
      costo_usd: parseFloat(formAccesorio.costo_usd),
      precio_usd: parseFloat(formAccesorio.precio_usd),
      detalles: formAccesorio.detalles.trim(),
    };

    const { error, promedio, unificadas } = await guardarLoteConPromedio('accesorios', filaBase, cantidad, claveAccesorio);
    if (!error) {
      if (unificadas > 0) {
        toast.success(cantidad + ' accesorio(s) sumado(s) al lote existente. Costo promedio: USD ' + promedio);
      } else {
        toast.success(cantidad + ' accesorio(s) agregado(s)');
      }
      setFormAccesorio({ ...formAccesorio, cantidad: 1, color: '' });
      cargarDatos(false);
    } else toast.error('Error al guardar: ' + error.message);
  }

  async function handleGuardarPermuta(e) {
    e.preventDefault();
    if (!cot) {
      toast.error('La cotizacion debe ser mayor a cero');
      return;
    }
    const costoUsd = parseFloat((parseFloat(formPermuta.precio_ars) / cot).toFixed(2));
    // Si no se indica precio de venta, queda igualado al costo
    const ventaUsd = formPermuta.precio_venta_ars
      ? parseFloat((parseFloat(formPermuta.precio_venta_ars) / cot).toFixed(2))
      : costoUsd;

    const filaBase = {
      modelo: formPermuta.modelo.trim().toUpperCase(),
      capacidad: formatearCapacidad(formPermuta.capacidad),
      color: formPermuta.color,
      bateria: parseInt(formPermuta.bateria),
      costo_usd: costoUsd,
      precio_usd: ventaUsd,
      detalles: formPermuta.detalles.trim(),
    };

    const { error } = await guardarLoteConPromedio('celulares', filaBase, 1, claveCelular);
    if (!error) {
      toast.success('Permuta registrada correctamente');
      setShowPermutaModal(false);
      setFormPermuta(estadoInicialPermuta);
      cargarDatos(false);
    } else toast.error('Error al registrar permuta: ' + error.message);
  }

  // ---------- Menu de opciones ----------
  const abrirMenu = (e, item, tabla) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const key = tabla + '-' + item.ids[0];
    if (menu && menu.key === key) {
      setMenu(null);
      return;
    }
    setMenu({ key, item, tabla, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  // ---------- Ventas ----------
  const confirmarVenta = (item, tabla) => {
    const esAccesorioMultiple = tabla === 'accesorios' && item.cantidad > 1;

    toast(
      (t) => (
        <div>
          <p className="font-bold text-gray-800 text-sm mb-3">Opciones de Venta</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { toast.dismiss(t.id); ejecutarVenta([item.ids[0]], tabla, false, item.precio_usd); }}
              className="bg-green-500 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-600 transition"
            >
              {esAccesorioMultiple ? 'Vender 1 (Precio Contado)' : 'Confirmar venta (Precio Contado)'}
            </button>
            {esAccesorioMultiple && (
              <button
                onClick={() => { toast.dismiss(t.id); ejecutarVenta(item.ids, tabla, true, item.precio_usd); }}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition"
              >
                Vender TODOS ({item.cantidad}) Mayorista -{descuentoMayorista}%
              </button>
            )}
            <button
              onClick={() => toast.dismiss(t.id)}
              className="bg-gray-200 text-gray-800 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-300 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: Infinity, id: 'confirm-venta' }
    );
  };

  async function ejecutarVenta(idsArray, tabla, esMayorista, precioOriginal) {
    const updates = { estado: 'vendido', fecha_venta: new Date().toISOString() };
    if (esMayorista) {
      updates.precio_usd = parseFloat((precioOriginal * (1 - Number(descuentoMayorista) / 100)).toFixed(2));
    }
    const { error } = await supabase.from(tabla).update(updates).in('id', idsArray);
    if (error) {
      toast.error('Error al registrar la venta: ' + error.message);
      return;
    }
    toast.success(idsArray.length + ' venta(s) registrada(s)');
    cargarDatos(false);
  }

  // ---------- Borrado ----------
  const confirmarBorrado = (item, tabla) => {
    toast(
      (t) => (
        <div>
          <p className="font-bold text-gray-800 text-sm mb-3">Cuantas unidades queres borrar?</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { toast.dismiss(t.id); ejecutarBorrado([item.ids[0]], tabla); }}
              className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600"
            >
              Borrar 1
            </button>
            {item.cantidad > 1 && (
              <button
                onClick={() => { toast.dismiss(t.id); ejecutarBorrado(item.ids, tabla); }}
                className="bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-800"
              >
                Borrar TODOS
              </button>
            )}
            <button
              onClick={() => toast.dismiss(t.id)}
              className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: Infinity, id: 'confirm-borrar' }
    );
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
    setFormEdicionCelular({
      ...celular,
      color: colorCanonico(celular.color),
      cantidadAEditar: celular.cantidad,
    });
  };
  const handleChangeEdicionCelular = (e) => setFormEdicionCelular({ ...formEdicionCelular, [e.target.name]: e.target.value });

  // Opciones del desplegable de color en edicion: si el color actual no esta en la lista,
  // se conserva como opcion para no perderlo
  const opcionesColorEdicion = (valorActual) => {
    const lista = COLORES.map(([valor, etiqueta]) => ({ valor, etiqueta }));
    const actual = String(valorActual || '').trim();
    if (actual && !COLORES.some(([valor]) => valor === actual)) {
      lista.unshift({ valor: actual, etiqueta: actual + ' (actual)' });
    }
    return lista;
  };

  async function guardarEdicionCelular() {
    const colorFinal = String(formEdicionCelular.color || '').trim();
    if (!colorFinal) {
      toast.error('Elegi un color antes de guardar');
      return;
    }
    const idsToUpdate = formEdicionCelular.ids.slice(0, parseInt(formEdicionCelular.cantidadAEditar));
    const { error } = await supabase
      .from('celulares')
      .update({
        modelo: String(formEdicionCelular.modelo || '').trim().toUpperCase(),
        capacidad: formatearCapacidad(formEdicionCelular.capacidad),
        color: colorFinal,
        bateria: parseInt(formEdicionCelular.bateria) || 0,
        costo_usd: parseFloat(formEdicionCelular.costo_usd),
        precio_usd: parseFloat(formEdicionCelular.precio_usd),
        detalles: String(formEdicionCelular.detalles || '').trim(),
      })
      .in('id', idsToUpdate);

    if (!error) {
      toast.success(idsToUpdate.length + ' equipo(s) actualizado(s)');
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
    const colorFinal = String(formEdicionAccesorio.color || '').trim();
    if (!colorFinal) {
      toast.error('Indica un color o diseno antes de guardar');
      return;
    }
    const idsToUpdate = formEdicionAccesorio.ids.slice(0, parseInt(formEdicionAccesorio.cantidadAEditar));
    const { error } = await supabase
      .from('accesorios')
      .update({
        tipo: String(formEdicionAccesorio.tipo || '').trim(),
        modelo: String(formEdicionAccesorio.modelo || '').trim(),
        color: colorFinal,
        costo_usd: parseFloat(formEdicionAccesorio.costo_usd),
        precio_usd: parseFloat(formEdicionAccesorio.precio_usd),
        detalles: String(formEdicionAccesorio.detalles || '').trim(),
      })
      .in('id', idsToUpdate);

    if (!error) {
      toast.success(idsToUpdate.length + ' accesorio(s) actualizado(s)');
      setEditandoAccesorioId(null);
      cargarDatos(false);
    } else toast.error('Error al actualizar: ' + error.message);
  }

  // ---------- Utilidades de vista ----------
  const renderizarCirculoColor = (valorColor) => {
    if (!valorColor) return null;
    const c = sinTildes(valorColor);
    let claseColor = '';
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
      const textoLimpio = String(valorColor).replace(/[^\w\sñÑáéíóúÁÉÍÓÚ-]/gi, '').trim();
      if (!textoLimpio) return null;
      return <span className="ml-1 text-xs text-gray-600 font-medium uppercase">{textoLimpio}</span>;
    }
    return (
      <span
        className={'inline-block w-3.5 h-3.5 rounded-full ml-1.5 align-middle shadow-sm ' + claseColor + (conBorde ? ' border border-gray-300' : '')}
      />
    );
  };

  const calcularStats = (arrayStock) => {
    const totalQty = arrayStock.reduce((acc, item) => acc + item.cantidad, 0);
    const totalCosto = arrayStock.reduce((acc, item) => acc + item.costo_usd * item.cantidad, 0);
    const totalVenta = arrayStock.reduce((acc, item) => acc + item.precio_usd * item.cantidad, 0);
    const gananciaUsd = totalVenta - totalCosto;
    const gananciaArs = gananciaUsd * cot;
    return { totalQty, totalCosto, totalVenta, gananciaUsd, gananciaArs };
  };

  const fmt = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  const statsCelulares = calcularStats(stockCelulares);
  const statsAccesorios = calcularStats(stockAccesorios);

  const obtenerMesAnio = (fechaISO) => {
    if (!fechaISO) return 'Sin fecha';
    const fecha = new Date(fechaISO);
    return fecha.getFullYear() + '-' + (fecha.getMonth() + 1).toString().padStart(2, '0');
  };

  const formatearNombreMes = (yyyyMm) => {
    if (yyyyMm === 'Sin fecha') return 'Sin fecha';
    const [year, month] = yyyyMm.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[parseInt(month) - 1] + ' ' + year;
  };

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

  const indiceUltimoItem = paginaActual * ventasPorPagina;
  const indicePrimerItem = indiceUltimoItem - ventasPorPagina;
  const ventasPaginadas = ventasFiltradas.slice(indicePrimerItem, indiceUltimoItem);
  const totalPaginas = Math.ceil(ventasFiltradas.length / ventasPorPagina);

  const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const datosGrafico = mesesDisponibles
    .slice(0, 6)
    .reverse()
    .map((mes) => {
      const ventasMes = ventasGlobales.filter((v) => obtenerMesAnio(v.fecha_venta) === mes);
      const ganancia = ventasMes.reduce((acc, c) => acc + (c.precio_usd - c.costo_usd), 0);
      const [, month] = mes.split('-');
      return { name: mesesCortos[parseInt(month) - 1], Ganancia: parseFloat(ganancia.toFixed(2)) };
    });

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 bg-gray-50">Cargando...</div>;
  }

  const claseInput = 'border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none';
  const claseInputModal = 'border border-gray-300 p-2.5 rounded-lg w-full bg-gray-50 focus:bg-white outline-none';

  return (
    <div className="min-h-screen p-4 md:p-8 text-gray-800 bg-gray-50">
      {/* Lista de colores sugeridos para el campo de color de accesorios */}
      <datalist id="lista-colores">
        {COLORES.map(([valor]) => (
          <option key={valor} value={valor} />
        ))}
      </datalist>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center max-w-6xl mx-auto mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Panel de Control</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <button onClick={() => supabase.auth.signOut()} className="text-sm font-bold text-red-500 hover:underline">
              Cerrar Sesion
            </button>
            <span className="text-gray-300">|</span>
            <a href="/" target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600 hover:underline">
              Ver Catalogo Publico
            </a>
            <span className="text-gray-300">|</span>
            <button onClick={() => setShowPermutaModal(true)} className="text-sm font-bold text-purple-600 hover:underline">
              Registrar Permuta
            </button>
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-3 items-center">
          <div className="flex items-center bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
            <span className="font-semibold px-2 text-green-600 text-xs uppercase">Cotizacion $</span>
            <input
              type="number"
              value={cotizacion}
              onChange={(e) => setCotizacion(e.target.value)}
              className="w-20 border-l pl-2 py-1 outline-none font-bold text-sm text-gray-700 bg-transparent"
            />
          </div>
          <div className="flex items-center bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
            <span className="font-semibold px-2 text-blue-600 text-xs uppercase">Desc. Mayorista %</span>
            <input
              type="number"
              value={descuentoMayorista}
              onChange={(e) => setDescuentoMayorista(e.target.value)}
              className="w-16 border-l pl-2 py-1 outline-none font-bold text-sm text-gray-700 bg-transparent"
            />
          </div>
          <button
            onClick={handleActualizarConfiguracion}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full">
        {/* TABS */}
        <div className="flex space-x-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('celulares')}
            className={
              'py-3 px-6 text-sm font-bold rounded-t-lg transition ' +
              (activeTab === 'celulares' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100')
            }
          >
            Celulares
          </button>
          <button
            onClick={() => setActiveTab('accesorios')}
            className={
              'py-3 px-6 text-sm font-bold rounded-t-lg transition ' +
              (activeTab === 'accesorios' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100')
            }
          >
            Accesorios
          </button>
        </div>

        {/* ===================== TAB CELULARES ===================== */}
        {activeTab === 'celulares' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-5 text-gray-800">Nuevo Ingreso de Celular</h2>
              <form onSubmit={handleGuardarCelular} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input required name="modelo" value={formCelular.modelo} onChange={handleChangeCelular} type="text" placeholder="Mod. (Ej: 14 PRO)" className={claseInput} />
                  <input required name="capacidad" value={formCelular.capacidad} onChange={handleChangeCelular} type="text" placeholder="Cap. (Ej: 128)" className={claseInput} />
                  <select required name="color" value={formCelular.color} onChange={handleChangeCelular} className={claseInput + ' text-gray-700'}>
                    <option value="" disabled>Color...</option>
                    {COLORES.map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                  <input required name="bateria" value={formCelular.bateria} onChange={handleChangeCelular} type="number" min="0" max="100" placeholder="Bateria %" className={claseInput} />
                  <input required name="costo_usd" value={formCelular.costo_usd} onChange={handleChangeCelular} type="number" min="0" step="0.01" placeholder="Costo (USD)" className={claseInput} />
                  <div className="flex flex-col">
                    <input required name="precio_usd" value={formCelular.precio_usd} onChange={handleChangeCelular} type="number" min="0" step="0.01" placeholder="Venta (USD)" className={claseInput + ' w-full'} />
                    <span className="text-[10px] text-green-600 font-bold mt-1 ml-1 h-3">
                      {formCelular.precio_usd ? 'ARS $ ' + fmt(formCelular.precio_usd * cot) : ''}
                    </span>
                  </div>
                  <input name="detalles" value={formCelular.detalles} onChange={handleChangeCelular} type="text" placeholder="Detalles (Opcional)" className={claseInput + ' md:col-span-2'} />
                </div>
                <div className="flex flex-col gap-2 md:w-32">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                    <input required name="cantidad" value={formCelular.cantidad} onChange={handleChangeCelular} type="number" min="1" className={claseInput + ' pl-12 w-full font-bold'} />
                  </div>
                  <button type="submit" className="bg-blue-600 text-white py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition h-full text-sm">
                    Agregar
                  </button>
                </div>
              </form>
              <p className="text-[11px] text-gray-400 mt-3">
                Si el modelo, capacidad, color, bateria, precio de venta y detalles coinciden con un lote existente, las unidades se suman a ese lote y el costo se recalcula como promedio.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border-l-4 border-gray-400 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Celulares</p>
                <p className="font-black text-2xl text-gray-800">{statsCelulares.totalQty}</p>
              </div>
              <div className="border-l-4 border-red-400 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Costo Invertido</p>
                <p className="font-black text-2xl text-gray-800">$ {fmt(statsCelulares.totalCosto)}</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Valor de Venta</p>
                <p className="font-black text-2xl text-blue-600">$ {fmt(statsCelulares.totalVenta)}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Ganancia Esperada</p>
                <p className="font-black text-xl text-green-600 leading-tight">
                  $ {fmt(statsCelulares.gananciaUsd)}
                  <span className="text-[10px] text-gray-500 block font-semibold mt-0.5">ARS $ {fmt(statsCelulares.gananciaArs)}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
              <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[560px]">
                  <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 shadow-sm z-10">
                    <tr className="text-gray-500">
                      <th className="p-4 font-semibold w-2/5">Equipo</th>
                      <th className="p-4 font-semibold w-1/5">Costo / Venta</th>
                      <th className="p-4 text-right font-semibold w-2/5">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockCelulares.map((celu) => (
                      <tr key={celu.ids[0]} className="hover:bg-gray-50 transition">
                        {editandoCelularId === celu.ids[0] ? (
                          <Fragment>
                            <td className="p-2 space-y-1">
                              <div className="flex gap-1">
                                <input className="border border-gray-300 p-1 w-24 text-xs rounded" name="modelo" value={formEdicionCelular.modelo} onChange={handleChangeEdicionCelular} placeholder="Modelo" />
                                <input className="border border-gray-300 p-1 w-16 text-xs rounded" name="capacidad" value={formEdicionCelular.capacidad} onChange={handleChangeEdicionCelular} placeholder="Cap." />
                              </div>
                              <div className="flex gap-1">
                                <input className="border border-gray-300 p-1 w-14 text-xs rounded" name="bateria" type="number" min="0" max="100" value={formEdicionCelular.bateria} onChange={handleChangeEdicionCelular} placeholder="Bat %" />
                                <select
                                  className="border border-gray-300 p-1 w-32 text-xs rounded bg-white text-gray-800"
                                  name="color"
                                  value={formEdicionCelular.color || ''}
                                  onChange={handleChangeEdicionCelular}
                                >
                                  <option value="" disabled>Elegir color...</option>
                                  {opcionesColorEdicion(formEdicionCelular.color).map((op) => (
                                    <option key={op.valor} value={op.valor}>{op.etiqueta}</option>
                                  ))}
                                </select>
                              </div>
                              <input className="border border-gray-300 p-1 w-full text-xs rounded" name="detalles" value={formEdicionCelular.detalles || ''} onChange={handleChangeEdicionCelular} placeholder="Detalles" />
                              <div className="flex items-center gap-2 mt-2 bg-blue-50 p-1.5 rounded border border-blue-100">
                                <span className="text-xs text-blue-700 font-bold">Aplicar a:</span>
                                <select name="cantidadAEditar" value={formEdicionCelular.cantidadAEditar} onChange={handleChangeEdicionCelular} className="border border-gray-300 p-1 text-xs rounded bg-white text-gray-800">
                                  {Array.from({ length: celu.cantidad }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>{n} unidad(es)</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="p-2">
                              <input className="border border-gray-300 p-1 w-16 text-xs rounded mb-1" name="costo_usd" type="number" min="0" step="0.01" value={formEdicionCelular.costo_usd} onChange={handleChangeEdicionCelular} placeholder="Costo" />
                              <br />
                              <input className="border border-gray-300 p-1 w-16 text-xs rounded" name="precio_usd" type="number" min="0" step="0.01" value={formEdicionCelular.precio_usd} onChange={handleChangeEdicionCelular} placeholder="Venta" />
                            </td>
                            <td className="p-2 text-right space-x-1">
                              <button onClick={guardarEdicionCelular} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-blue-700">Guardar</button>
                              <button onClick={() => setEditandoCelularId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-bold hover:bg-gray-400">Cancelar</button>
                            </td>
                          </Fragment>
                        ) : (
                          <Fragment>
                            <td className="p-4 font-semibold text-gray-800">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm">x{celu.cantidad}</span>
                                <span className="whitespace-nowrap">{celu.modelo} {celu.capacidad}</span>
                                {renderizarCirculoColor(celu.color)}
                              </div>
                              <div className="text-xs font-medium text-gray-500 mt-1">Bat: {celu.bateria}% | {celu.detalles}</div>
                            </td>
                            <td className="p-4">
                              <span className="text-red-500 font-medium">$ {celu.costo_usd}</span> /{' '}
                              <span className="text-green-600 font-bold">$ {celu.precio_usd}</span>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={(e) => abrirMenu(e, celu, 'celulares')}
                                className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-300 transition text-xs shadow-sm"
                              >
                                Opciones
                                <IconoChevron />
                              </button>
                            </td>
                          </Fragment>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stockCelulares.length === 0 && <p className="text-center p-8 text-gray-500">No hay celulares en stock.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB ACCESORIOS ===================== */}
        {activeTab === 'accesorios' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-5 text-gray-800">Nuevo Ingreso de Accesorio</h2>
              <form onSubmit={handleGuardarAccesorio} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <input required name="tipo" value={formAccesorio.tipo} onChange={handleChangeAccesorio} type="text" placeholder="Tipo (Ej: Funda, Vidrio)" className={claseInput} />
                  <input required name="modelo" value={formAccesorio.modelo} onChange={handleChangeAccesorio} type="text" placeholder="Mod. (Ej: iPhone 13)" className={claseInput} />
                  <input required name="color" list="lista-colores" value={formAccesorio.color} onChange={handleChangeAccesorio} type="text" placeholder="Color / Diseno" className={claseInput} />
                  <input required name="costo_usd" value={formAccesorio.costo_usd} onChange={handleChangeAccesorio} type="number" min="0" step="0.01" placeholder="Costo (USD)" className={claseInput} />
                  <div className="flex flex-col">
                    <input required name="precio_usd" value={formAccesorio.precio_usd} onChange={handleChangeAccesorio} type="number" min="0" step="0.01" placeholder="Venta (USD)" className={claseInput + ' w-full'} />
                    <span className="text-[10px] text-green-600 font-bold mt-1 ml-1 h-3">
                      {formAccesorio.precio_usd ? 'ARS $ ' + fmt(formAccesorio.precio_usd * cot) : ''}
                    </span>
                  </div>
                  <input name="detalles" value={formAccesorio.detalles} onChange={handleChangeAccesorio} type="text" placeholder="Detalles extra" className={claseInput} />
                </div>
                <div className="flex flex-col gap-2 md:w-32">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                    <input required name="cantidad" value={formAccesorio.cantidad} onChange={handleChangeAccesorio} type="number" min="1" className={claseInput + ' pl-12 w-full font-bold'} />
                  </div>
                  <button type="submit" className="bg-blue-600 text-white py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition h-full text-sm">
                    Agregar
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border-l-4 border-gray-400 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Accesorios</p>
                <p className="font-black text-2xl text-gray-800">{statsAccesorios.totalQty}</p>
              </div>
              <div className="border-l-4 border-red-400 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Costo Invertido</p>
                <p className="font-black text-2xl text-gray-800">$ {fmt(statsAccesorios.totalCosto)}</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Valor de Venta</p>
                <p className="font-black text-2xl text-blue-600">$ {fmt(statsAccesorios.totalVenta)}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Ganancia Esperada</p>
                <p className="font-black text-xl text-green-600 leading-tight">
                  $ {fmt(statsAccesorios.gananciaUsd)}
                  <span className="text-[10px] text-gray-500 block font-semibold mt-0.5">ARS $ {fmt(statsAccesorios.gananciaArs)}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
              <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[560px]">
                  <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 shadow-sm z-10">
                    <tr className="text-gray-500">
                      <th className="p-4 font-semibold w-2/5">Accesorio</th>
                      <th className="p-4 font-semibold w-1/5">Costo / Venta</th>
                      <th className="p-4 text-right font-semibold w-2/5">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockAccesorios.map((acc) => (
                      <tr key={acc.ids[0]} className="hover:bg-gray-50 transition">
                        {editandoAccesorioId === acc.ids[0] ? (
                          <Fragment>
                            <td className="p-2 space-y-1">
                              <div className="flex gap-1">
                                <input className="border border-gray-300 p-1 w-24 text-xs rounded" name="tipo" value={formEdicionAccesorio.tipo} onChange={handleChangeEdicionAccesorio} placeholder="Tipo" />
                                <input className="border border-gray-300 p-1 w-24 text-xs rounded" name="modelo" value={formEdicionAccesorio.modelo} onChange={handleChangeEdicionAccesorio} placeholder="Modelo" />
                              </div>
                              <div className="flex gap-1">
                                <input className="border border-gray-300 p-1 w-full text-xs rounded" name="color" list="lista-colores" value={formEdicionAccesorio.color || ''} onChange={handleChangeEdicionAccesorio} placeholder="Color" />
                                <input className="border border-gray-300 p-1 w-full text-xs rounded" name="detalles" value={formEdicionAccesorio.detalles || ''} onChange={handleChangeEdicionAccesorio} placeholder="Detalles" />
                              </div>
                              <div className="flex items-center gap-2 mt-2 bg-blue-50 p-1.5 rounded border border-blue-100">
                                <span className="text-xs text-blue-700 font-bold">Aplicar a:</span>
                                <select name="cantidadAEditar" value={formEdicionAccesorio.cantidadAEditar} onChange={handleChangeEdicionAccesorio} className="border border-gray-300 p-1 text-xs rounded bg-white text-gray-800">
                                  {Array.from({ length: acc.cantidad }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>{n} unidad(es)</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="p-2">
                              <input className="border border-gray-300 p-1 w-16 text-xs rounded mb-1" name="costo_usd" type="number" min="0" step="0.01" value={formEdicionAccesorio.costo_usd} onChange={handleChangeEdicionAccesorio} placeholder="Costo" />
                              <br />
                              <input className="border border-gray-300 p-1 w-16 text-xs rounded" name="precio_usd" type="number" min="0" step="0.01" value={formEdicionAccesorio.precio_usd} onChange={handleChangeEdicionAccesorio} placeholder="Venta" />
                            </td>
                            <td className="p-2 text-right space-x-1">
                              <button onClick={guardarEdicionAccesorio} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-blue-700">Guardar</button>
                              <button onClick={() => setEditandoAccesorioId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-bold hover:bg-gray-400">Cancelar</button>
                            </td>
                          </Fragment>
                        ) : (
                          <Fragment>
                            <td className="p-4 font-semibold text-gray-800">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm">x{acc.cantidad}</span>
                                <span className="whitespace-nowrap">{acc.tipo} - {acc.modelo}</span>
                                {renderizarCirculoColor(acc.color)}
                              </div>
                              <div className="text-xs font-medium text-gray-500 mt-1">{acc.detalles}</div>
                            </td>
                            <td className="p-4">
                              <span className="text-red-500 font-medium">$ {acc.costo_usd}</span> /{' '}
                              <span className="text-green-600 font-bold">$ {acc.precio_usd}</span>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={(e) => abrirMenu(e, acc, 'accesorios')}
                                className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-300 transition text-xs shadow-sm"
                              >
                                Opciones
                                <IconoChevron />
                              </button>
                            </td>
                          </Fragment>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stockAccesorios.length === 0 && <p className="text-center p-8 text-gray-500">No hay accesorios en stock.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ===================== HISTORIAL GLOBAL ===================== */}
        <div className="space-y-4 pt-8 border-t border-gray-200 mt-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
            <h2 className="text-2xl font-bold text-gray-800">Historial Global de Ventas</h2>
            <div className="flex flex-wrap gap-2">
              {ventasFiltradas.length > 0 && (
                <button
                  onClick={exportarCSV}
                  className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 text-sm shadow-sm transition"
                >
                  Descargar CSV
                </button>
              )}
              {mesesDisponibles.length > 0 && (
                <select
                  value={mesSeleccionado}
                  onChange={(e) => setMesSeleccionado(e.target.value)}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold bg-white text-gray-700 outline-none shadow-sm cursor-pointer hover:bg-gray-50 transition"
                >
                  <option value="todos">Historico Total</option>
                  {mesesDisponibles.map((mes) => (
                    <option key={mes} value={mes}>{formatearNombreMes(mes)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
              <p className="text-gray-500 text-sm font-medium">Items Vendidos</p>
              <p className="text-3xl font-black mt-1 text-gray-800">{totalVendidos}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-green-500">
              <p className="text-gray-500 text-sm font-medium">Ganancia Neta (USD)</p>
              <p className="text-3xl font-black mt-1 text-green-600">$ {gananciaVentasUSD.toFixed(2)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-emerald-400 col-span-2 md:col-span-1">
              <p className="text-gray-500 text-sm font-medium">Ganancia (ARS)</p>
              <p className="text-3xl font-black mt-1 text-emerald-600">$ {fmt(gananciaVentasARS)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {datosGrafico.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider text-center">
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
              <div className="flex-grow overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-500">
                      <th className="p-4 font-semibold">Producto</th>
                      <th className="p-4 font-semibold text-center">Fecha</th>
                      <th className="p-4 text-right font-semibold">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventasPaginadas.map((item) => (
                      <tr key={item.categoria + '-' + item.id} className="hover:bg-gray-50 transition">
                        <td className="p-4 font-semibold text-gray-800">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">{item.categoria}</span>
                          {item.categoria === 'celular' ? item.modelo + ' ' + item.capacidad : item.tipo + ' - ' + item.modelo}
                          {renderizarCirculoColor(item.color)}
                        </td>
                        <td className="p-4 text-center text-gray-500 text-xs font-medium">
                          {item.fecha_venta ? new Date(item.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha'}
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded whitespace-nowrap">
                            + $ {(item.precio_usd - item.costo_usd).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ventasFiltradas.length === 0 && <p className="text-center p-8 text-gray-500">No hay ventas registradas.</p>}
              </div>
              {totalPaginas > 1 && (
                <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between items-center mt-auto">
                  <button
                    onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                    disabled={paginaActual === 1}
                    className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="text-xs font-medium text-gray-600">Pag {paginaActual} de {totalPaginas}</span>
                  <button
                    onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaActual === totalPaginas}
                    className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
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

      {/* MENU DESPLEGABLE DE OPCIONES (posicion fija, no se recorta por el scroll de la tabla) */}
      {menu && (
        <Fragment>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-32 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
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
                className="px-4 py-2.5 text-xs font-bold text-blue-600 bg-white hover:bg-blue-50 text-left border-b border-gray-50"
              >
                Editar
              </button>
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  confirmarVenta(item, tabla);
                }}
                className="px-4 py-2.5 text-xs font-bold text-green-700 bg-white hover:bg-green-50 text-left border-b border-gray-50"
              >
                Vendido
              </button>
              <button
                onClick={() => {
                  const { item, tabla } = menu;
                  setMenu(null);
                  confirmarBorrado(item, tabla);
                }}
                className="px-4 py-2.5 text-xs font-bold text-red-500 bg-white hover:bg-red-50 text-left"
              >
                Borrar
              </button>
            </div>
          </div>
        </Fragment>
      )}

      {/* MODAL DE PERMUTAS */}
      {showPermutaModal && (
        <div className="fixed inset-0 bg-gray-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Registrar Equipo en Permuta</h2>
            <form onSubmit={handleGuardarPermuta} autoComplete="off" className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Modelo del equipo usado</label>
                <input required name="modelo" value={formPermuta.modelo} onChange={handleChangePermuta} type="text" placeholder="Ej: 11 PRO" className={claseInputModal} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Capacidad</label>
                <input required name="capacidad" value={formPermuta.capacidad} onChange={handleChangePermuta} type="text" placeholder="Ej: 64" className={claseInputModal} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Bateria %</label>
                <input required name="bateria" value={formPermuta.bateria} onChange={handleChangePermuta} type="number" min="0" max="100" placeholder="Ej: 82" className={claseInputModal} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Color</label>
                <select required name="color" value={formPermuta.color} onChange={handleChangePermuta} className={claseInputModal + ' text-gray-700'}>
                  <option value="" disabled>Color...</option>
                  {COLORES.map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>{etiqueta}</option>
                  ))}
                </select>
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
                <input name="precio_venta_ars" value={formPermuta.precio_venta_ars} onChange={handleChangePermuta} type="number" min="0" placeholder="Si lo dejas vacio, se iguala al costo" className="border border-green-200 p-2.5 rounded-lg w-full bg-white outline-none font-bold text-gray-800" />
                <p className="text-xs text-green-700 mt-2 font-bold text-right">
                  Venta: USD{' '}
                  {formPermuta.precio_venta_ars && cot
                    ? (formPermuta.precio_venta_ars / cot).toFixed(2)
                    : formPermuta.precio_ars && cot
                    ? (formPermuta.precio_ars / cot).toFixed(2)
                    : '0.00'}
                </p>
              </div>
              <div className="col-span-2 flex justify-end gap-3 mt-1">
                <button type="button" onClick={() => setShowPermutaModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition">
                  Cancelar
                </button>
                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-purple-700 transition">
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