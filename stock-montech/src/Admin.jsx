import React, { useState, useEffect, Fragment } from 'react';
import { supabase } from './supabase';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

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
  const estadoInicialPermuta = { modelo: '', detalles: '', precio_ars: '' };

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
  const [menuAbierto, setMenuAbierto] = useState(null);
  const ventasPorPagina = 10;

  useEffect(() => {
    document.title = "Montech | Admin";
    cargarDatos(true);
  }, []);

  useEffect(() => {
    setPaginaActual(1);
  }, [mesSeleccionado]);

  async function cargarDatos(mostrarLoader = false) {
    if (mostrarLoader) setCargando(true);
    const { data: config } = await supabase.from('configuracion').select('*').eq('id', 1).single();
    if (config) {
      setCotizacion(config.cotizacion_dolar);
      if(config.descuento_mayorista) setDescuentoMayorista(config.descuento_mayorista);
    }

    const { data: celDisponibles } = await supabase.from('celulares').select('*').eq('estado', 'disponible').order('fecha_ingreso', { ascending: false });
    if (celDisponibles) {
      const agrupadosCel = celDisponibles.reduce((acc, celu) => {
        const key = celu.modelo + "-" + celu.capacidad + "-" + celu.color + "-" + celu.bateria + "-" + celu.costo_usd + "-" + celu.precio_usd + "-" + celu.detalles;
        if (!acc[key]) acc[key] = { ...celu, cantidad: 1, ids: [celu.id] };
        else { acc[key].cantidad += 1; acc[key].ids.push(celu.id); }
        return acc;
      }, {});
      setStockCelulares(Object.values(agrupadosCel));
    }

    const { data: accDisponibles } = await supabase.from('accesorios').select('*').eq('estado', 'disponible').order('fecha_ingreso', { ascending: false });
    if (accDisponibles) {
      const agrupadosAcc = accDisponibles.reduce((acc, item) => {
        const key = item.tipo + "-" + item.modelo + "-" + item.color + "-" + item.costo_usd + "-" + item.precio_usd + "-" + item.detalles;
        if (!acc[key]) acc[key] = { ...item, cantidad: 1, ids: [item.id] };
        else { acc[key].cantidad += 1; acc[key].ids.push(item.id); }
        return acc;
      }, {});
      setStockAccesorios(Object.values(agrupadosAcc));
    }

    const { data: celVendidos } = await supabase.from('celulares').select('*').eq('estado', 'vendido');
    const { data: accVendidos } = await supabase.from('accesorios').select('*').eq('estado', 'vendido');
    
    let ventasUnificadas = [];
    if (celVendidos) ventasUnificadas = [...ventasUnificadas, ...celVendidos.map(v => ({ ...v, categoria: 'celular' }))];
    if (accVendidos) ventasUnificadas = [...ventasUnificadas, ...accVendidos.map(v => ({ ...v, categoria: 'accesorio' }))];
    
    ventasUnificadas.sort((a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta));
    setVentasGlobales(ventasUnificadas);

    if (mostrarLoader) setCargando(false);
  }

  async function handleActualizarConfiguracion() {
    const { error } = await supabase.from('configuracion').update({ 
      cotizacion_dolar: cotizacion,
      descuento_mayorista: descuentoMayorista 
    }).eq('id', 1);
    if (!error) toast.success("Configuración global actualizada");
  }

  const exportarExcelNativo = () => {
    let csvContent = "\ufeffCategoria,Producto,Color,Fecha Venta,Costo USD,Venta USD,Ganancia USD\n";
    ventasFiltradas.forEach(v => {
      const fecha = v.fecha_venta ? new Date(v.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha';
      const ganancia = (v.precio_usd - v.costo_usd).toFixed(2);
      const cat = v.categoria === 'celular' ? 'Celular' : 'Accesorio';
      const producto = v.categoria === 'celular' ? `\({v.modelo}\){v.capacidad}` : `\({v.tipo}\){v.modelo}`;
      const productoLimpio = producto.replace(/,/g, '');
      const colorLimpio = (v.color || '').replace(/,/g, '');
      
      csvContent += `\({cat},\){productoLimpio},\({colorLimpio},\){fecha},\({v.costo_usd},\){v.precio_usd},${ganancia}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Reporte_Ventas_Montech_" + mesSeleccionado + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleChangeCelular = (e) => setFormCelular({ ...formCelular, [e.target.name]: e.target.value });
  const handleChangeAccesorio = (e) => setFormAccesorio({ ...formAccesorio, [e.target.name]: e.target.value });
  const handleChangePermuta = (e) => setFormPermuta({ ...formPermuta, [e.target.name]: e.target.value });

  async function handleGuardarCelular(e) {
    e.preventDefault();
    const cantidad = parseInt(formCelular.cantidad) || 1;
    let capacidadFormat = formCelular.capacidad.trim().toUpperCase();
    if (capacidadFormat && !capacidadFormat.includes('GB') && !capacidadFormat.includes('TB')) capacidadFormat += 'GB';
    
    const nuevosCelulares = Array.from({ length: cantidad }, () => ({
      modelo: formCelular.modelo, capacidad: capacidadFormat, color: formCelular.color, bateria: parseInt(formCelular.bateria),
      costo_usd: parseFloat(formCelular.costo_usd), precio_usd: parseFloat(formCelular.precio_usd), detalles: formCelular.detalles
    }));

    const { error } = await supabase.from('celulares').insert(nuevosCelulares);
    if (!error) {
      toast.success(cantidad + " equipo(s) agregado(s)");
      setFormCelular({ ...formCelular, cantidad: 1, color: '' });
      cargarDatos(false);
    } else toast.error("Error al guardar: " + error.message);
  }

  async function handleGuardarAccesorio(e) {
    e.preventDefault();
    const cantidad = parseInt(formAccesorio.cantidad) || 1;
    
    const nuevosAccesorios = Array.from({ length: cantidad }, () => ({
      tipo: formAccesorio.tipo, modelo: formAccesorio.modelo, color: formAccesorio.color,
      costo_usd: parseFloat(formAccesorio.costo_usd), precio_usd: parseFloat(formAccesorio.precio_usd), detalles: formAccesorio.detalles
    }));

    const { error } = await supabase.from('accesorios').insert(nuevosAccesorios);
    if (!error) {
      toast.success(cantidad + " accesorio(s) agregado(s)");
      setFormAccesorio({ ...formAccesorio, cantidad: 1, color: '' });
      cargarDatos(false);
    } else toast.error("Error al guardar: " + error.message);
  }

  async function handleGuardarPermuta(e) {
    e.preventDefault();
    const precioUsdCalculado = parseFloat((formPermuta.precio_ars / cotizacion).toFixed(2));
    const nuevaPermuta = {
      modelo: formPermuta.modelo, capacidad: 'N/A', color: 'Usado', bateria: 0,
      costo_usd: precioUsdCalculado, precio_usd: precioUsdCalculado, detalles: formPermuta.detalles, estado: 'disponible'
    };
    const { error } = await supabase.from('celulares').insert([nuevaPermuta]);
    if (!error) {
      toast.success("Permuta registrada correctamente");
      setShowPermutaModal(false);
      setFormPermuta(estadoInicialPermuta);
      cargarDatos(false);
    } else toast.error("Error al registrar permuta: " + error.message);
  }

  const confirmarVenta = (item, tabla) => {
    toast((t) => (
      <div>
        <p className="font-bold text-gray-800 text-sm mb-3">Opciones de Venta</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => { toast.dismiss(t.id); ejecutarVenta([item.ids[0]], tabla, false, item.precio_usd); }} className="bg-green-500 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-600 transition">
            Vender 1 (Precio Contado)
          </button>
          <button onClick={() => { toast.dismiss(t.id); ejecutarVenta([item.ids[0]], tabla, true, item.precio_usd); }} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition">
            Vender 1 (Mayorista -{descuentoMayorista}%)
          </button>
          {item.cantidad > 1 && (
            <button onClick={() => { toast.dismiss(t.id); ejecutarVenta(item.ids, tabla, false, item.precio_usd); }} className="bg-green-800 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-900 transition">
              Vender TODOS ({item.cantidad} Contado)
            </button>
          )}
          <button onClick={() => toast.dismiss(t.id)} className="bg-gray-200 text-gray-800 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-300 transition">
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: Infinity, id: 'confirm-venta' });
  };

  async function ejecutarVenta(idsArray, tabla, esMayorista, precioOriginal) {
    const updates = { estado: 'vendido', fecha_venta: new Date().toISOString() };
    if (esMayorista) {
      updates.precio_usd = parseFloat((precioOriginal * (1 - descuentoMayorista / 100)).toFixed(2));
    }
    await supabase.from(tabla).update(updates).in('id', idsArray);
    toast.success("¡" + idsArray.length + " venta(s) registrada(s)!");
    cargarDatos(false);
  }

const confirmarBorrado = (item, tabla) => {
    toast((t) => (
      <div>
        <p className="font-bold text-gray-800 text-sm mb-3">¿Cuántas unidades querés borrar?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => { toast.dismiss(t.id); ejecutarBorrado([ item.ids[0] ], tabla); }} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600">Borrar 1</button>
          {item.cantidad > 1 && <button onClick={() => { toast.dismiss(t.id); ejecutarBorrado(item.ids, tabla); }} className="bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-800">Borrar TODOS</button>}
          <button onClick={() => toast.dismiss(t.id)} className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300">Cancelar</button>
        </div>
      </div>
    ), { duration: Infinity, id: 'confirm-borrar' });
  };

  async function ejecutarBorrado(idsArray, tabla) {
    await supabase.from(tabla).delete().in('id', idsArray);
    toast.success(idsArray.length + " item(s) eliminado(s)");
    cargarDatos(false);
  }

  const iniciarEdicionCelular = (celular) => {
    setEditandoCelularId(celular.ids[0]);
    setFormEdicionCelular({ ...celular, cantidadAEditar: celular.cantidad });
  };
  const handleChangeEdicionCelular = (e) => setFormEdicionCelular({ ...formEdicionCelular, [e.target.name]: e.target.value });

  async function guardarEdicionCelular() {
    let capacidadFormat = formEdicionCelular.capacidad.trim().toUpperCase();
    if (capacidadFormat && !capacidadFormat.includes('GB') && !capacidadFormat.includes('TB')) capacidadFormat += 'GB';
    const idsToUpdate = formEdicionCelular.ids.slice(0, parseInt(formEdicionCelular.cantidadAEditar));

    const { error } = await supabase.from('celulares').update({
      modelo: formEdicionCelular.modelo, capacidad: capacidadFormat, color: formEdicionCelular.color, bateria: parseInt(formEdicionCelular.bateria),
      costo_usd: parseFloat(formEdicionCelular.costo_usd), precio_usd: parseFloat(formEdicionCelular.precio_usd), detalles: formEdicionCelular.detalles
    }).in('id', idsToUpdate);

    if (!error) {
      toast.success(idsToUpdate.length + " equipo(s) actualizado(s)");
      setEditandoCelularId(null);
      cargarDatos(false);
    } else toast.error("Error al actualizar: " + error.message);
  }

  const iniciarEdicionAccesorio = (acc) => {
    setEditandoAccesorioId(acc.ids[0]);
    setFormEdicionAccesorio({ ...acc, cantidadAEditar: acc.cantidad });
  };
  const handleChangeEdicionAccesorio = (e) => setFormEdicionAccesorio({ ...formEdicionAccesorio, [e.target.name]: e.target.value });

  async function guardarEdicionAccesorio() {
    const idsToUpdate = formEdicionAccesorio.ids.slice(0, parseInt(formEdicionAccesorio.cantidadAEditar));
    const { error } = await supabase.from('accesorios').update({
      tipo: formEdicionAccesorio.tipo, modelo: formEdicionAccesorio.modelo, color: formEdicionAccesorio.color,
      costo_usd: parseFloat(formEdicionAccesorio.costo_usd), precio_usd: parseFloat(formEdicionAccesorio.precio_usd), detalles: formEdicionAccesorio.detalles
    }).in('id', idsToUpdate);

    if (!error) {
      toast.success(idsToUpdate.length + " accesorio(s) actualizado(s)");
      setEditandoAccesorioId(null);
      cargarDatos(false);
    } else toast.error("Error al actualizar: " + error.message);
  }

  const renderizarCirculoColor = (valorColor) => {
    if (!valorColor) return null;
    const c = valorColor.toLowerCase();
    let claseColor = ""; let conBorde = false;
    if (c.includes('negro') || c.includes('medianoche')) claseColor = "bg-gray-900";
    else if (c.includes('blanco') || c.includes('estelar')) { claseColor = "bg-white"; conBorde = true; }
    else if (c.includes('plata') || c.includes('silver') || c.includes('titanio')) claseColor = "bg-gray-300";
    else if (c.includes('gris') || c.includes('grafito')) claseColor = "bg-gray-600";
    else if (c.includes('oro rosa') || c.includes('rosa')) claseColor = "bg-pink-300";
    else if (c.includes('oro') || c.includes('desierto')) claseColor = "bg-yellow-200"; 
    else if (c.includes('azul')) claseColor = "bg-blue-500";
    else if (c.includes('morado') || c.includes('violeta') || c.includes('purpura')) claseColor = "bg-purple-600";
    else if (c.includes('verde')) claseColor = "bg-emerald-500";
    else if (c.includes('amarillo')) claseColor = "bg-yellow-400";
    else if (c.includes('naranja')) claseColor = "bg-orange-500"; 
    else if (c.includes('rojo') || c.includes('red')) claseColor = "bg-red-600";
    else {
      const textoLimpio = valorColor.replace(/[^\w\sñÑáéíóúÁÉÍÓÚ-]/gi, '').trim();
      if (!textoLimpio) return null;
      return <span className="ml-1 text-xs text-gray-600 font-medium uppercase"> {textoLimpio} </span>;
    }
    return <span className={"inline-block w-3.5 h-3.5 rounded-full ml-1.5 align-middle shadow-sm " + claseColor + (conBorde ? " border border-gray-300" : "")} />;
  };

  const calcularStats = (arrayStock) => {
    const totalQty = arrayStock.reduce((acc, item) => acc + item.cantidad, 0);
    const totalCosto = arrayStock.reduce((acc, item) => acc + (item.costo_usd * item.cantidad), 0);
    const totalVenta = arrayStock.reduce((acc, item) => acc + (item.precio_usd * item.cantidad), 0);
    const gananciaUsd = totalVenta - totalCosto;
    const gananciaArs = gananciaUsd * cotizacion;
    return { totalQty, totalCosto, totalVenta, gananciaUsd, gananciaArs };
  };

  const statsCelulares = calcularStats(stockCelulares);
  const statsAccesorios = calcularStats(stockAccesorios);

  const obtenerMesAnio = (fechaISO) => {
    if (!fechaISO) return 'Sin fecha';
    const fecha = new Date(fechaISO);
    return fecha.getFullYear() + "-" + (fecha.getMonth() + 1).toString().padStart(2, '0');
  };

  const formatearNombreMes = (yyyyMm) => {
    if (yyyyMm === 'Sin fecha') return 'Sin fecha';
    const [year, month] = yyyyMm.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[parseInt(month) - 1] + " " + year;
  };

  const mesesDisponibles = [...new Set(ventasGlobales.map(v => obtenerMesAnio(v.fecha_venta)))].filter(m => m !== 'Sin fecha').sort().reverse();
  const ventasFiltradas = mesSeleccionado === 'todos' ? ventasGlobales : ventasGlobales.filter(v => obtenerMesAnio(v.fecha_venta) === mesSeleccionado);
  const totalVendidos = ventasFiltradas.length;
  const gananciaVentasUSD = ventasFiltradas.reduce((acc, item) => acc + (item.precio_usd - item.costo_usd), 0);
  const gananciaVentasARS = gananciaVentasUSD * cotizacion;
  
  const indiceUltimoItem = paginaActual * ventasPorPagina;
  const indicePrimerItem = indiceUltimoItem - ventasPorPagina;
  const ventasPaginadas = ventasFiltradas.slice(indicePrimerItem, indiceUltimoItem);
  const totalPaginas = Math.ceil(ventasFiltradas.length / ventasPorPagina);

  const datosGrafico = mesesDisponibles.slice(0, 6).reverse().map(mes => {
    const ventasMes = ventasGlobales.filter(v => obtenerMesAnio(v.fecha_venta) === mes);
    const ganancia = ventasMes.reduce((acc, c) => acc + (c.precio_usd - c.costo_usd), 0);
    const [year, month] = mes.split('-');
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return { name: mesesCortos[parseInt(month) - 1], Ganancia: ganancia };
  });

  if (cargando) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 bg-gray-50">Cargando...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 text-gray-800 bg-gray-50">
      
      <div className="flex flex-col md:flex-row justify-between items-center max-w-6xl mx-auto mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Panel de Control</h1>
          <div className="flex items-center gap-4 mt-1">
            <button onClick={() => supabase.auth.signOut()} className="text-sm font-bold text-red-500 hover:underline">Cerrar Sesión</button>
            <span className="text-gray-300">|</span>
            <a href="/" target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600 hover:underline">Ver Catálogo Público ↗</a>
            <span className="text-gray-300">|</span>
            <button onClick={() => setShowPermutaModal(true)} className="text-sm font-bold text-purple-600 hover:underline">Registrar Permuta ↻</button>
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-3 items-center">
          <div className="flex items-center bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
            <span className="font-semibold px-2 text-green-600 text-xs uppercase">Cotización $</span>
            <input type="number" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} className="w-20 border-l pl-2 py-1 outline-none font-bold text-sm text-gray-700 bg-transparent" />
          </div>
          <div className="flex items-center bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
            <span className="font-semibold px-2 text-blue-600 text-xs uppercase">Desc. Mayorista %</span>
            <input type="number" value={descuentoMayorista} onChange={(e) => setDescuentoMayorista(e.target.value)} className="w-16 border-l pl-2 py-1 outline-none font-bold text-sm text-gray-700 bg-transparent" />
          </div>
          <button onClick={handleActualizarConfiguracion} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
            Guardar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full">
        
        <div className="flex space-x-2 border-b border-gray-200">
          <button onClick={() => setActiveTab('celulares')} className={`py-3 px-6 text-sm font-bold rounded-t-lg transition ${activeTab === 'celulares' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}` }>
            Celulares
          </button>
          <button onClick={() => setActiveTab('accesorios')} className={`py-3 px-6 text-sm font-bold rounded-t-lg transition ${activeTab === 'accesorios' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}` }>
            Accesorios
          </button>
        </div>

        {activeTab === 'celulares' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-5 flex items-center text-gray-800">Nuevo Ingreso de Celular</h2>
              <form onSubmit={handleGuardarCelular} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input required name="modelo" value={formCelular.modelo} onChange={handleChangeCelular} type="text" placeholder="Mod. (Ej: 14 PRO)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <input required name="capacidad" value={formCelular.capacidad} onChange={handleChangeCelular} type="text" placeholder="Cap. (Ej: 128)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <select required name="color" value={formCelular.color} onChange={handleChangeCelular} className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none text-gray-700">
                    <option value="" disabled>Color...</option>
                    <option value="Negro">Negro</option><option value="Blanco">Blanco</option><option value="Plata">Plata</option>
                    <option value="Gris">Gris</option><option value="Oro">Oro</option><option value="Rosa">Rosa</option>
                    <option value="Azul">Azul</option><option value="Morado">Morado / Púrpura</option><option value="Verde">Verde</option>
                    <option value="Amarillo">Amarillo</option><option value="Naranja">Naranja</option><option value="Rojo">Rojo</option>
                    <option value="Titanio">Titanio Natural</option><option value="Titanio del Desierto">Titanio del Desierto</option>
                  </select>
                  <input required name="bateria" value={formCelular.bateria} onChange={handleChangeCelular} type="number" min="0" max="100" placeholder="Batería %" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <input required name="costo_usd" value={formCelular.costo_usd} onChange={handleChangeCelular} type="number" min="0" step="0.01" placeholder="Costo (USD)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <div className="flex flex-col">
                    <input required name="precio_usd" value={formCelular.precio_usd} onChange={handleChangeCelular} type="number" min="0" step="0.01" placeholder="Venta (USD)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none w-full" />
                    <span className="text-[10px] text-green-600 font-bold mt-1 ml-1 h-3">{formCelular.precio_usd ? "ARS $ " + (formCelular.precio_usd * cotizacion).toLocaleString('es-AR') : ''}</span>
                  </div>
                  <input name="detalles" value={formCelular.detalles} onChange={handleChangeCelular} type="text" placeholder="Detalles (Opcional)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none md:col-span-2" />
                </div>
                <div className="flex flex-col gap-2 md:w-32">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                    <input required name="cantidad" value={formCelular.cantidad} onChange={handleChangeCelular} type="number" min="1" className="border border-gray-200 p-2.5 pl-12 rounded-lg bg-gray-50 focus:bg-white outline-none w-full font-bold" />
                  </div>
                  <button type="submit" className="bg-blue-600 text-white py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition h-full text-sm">Agregar</button>
                </div>
              </form>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border-l-4 border-gray-400 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Celulares</p>
                <p className="font-black text-2xl text-gray-800">{statsCelulares.totalQty}</p>
              </div>
              <div className="border-l-4 border-red-400 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Costo Invertido</p>
                <p className="font-black text-2xl text-gray-800">$ {statsCelulares.totalCosto.toLocaleString('es-AR')}</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Valor de Venta</p>
                <p className="font-black text-2xl text-blue-600">$ {statsCelulares.totalVenta.toLocaleString('es-AR')}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Ganancia Esperada</p>
                <p className="font-black text-xl text-green-600 leading-tight">
                  $ {statsCelulares.gananciaUsd.toLocaleString('es-AR')} <span className="text-[10px] text-gray-500 block font-semibold mt-0.5">ARS $ {statsCelulares.gananciaArs.toLocaleString('es-AR')}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible">
              <div className="max-h-[400px] overflow-y-auto overflow-x-visible">
                <table className="w-full text-sm text-left min-w-[600px]">
                  <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 shadow-sm z-10"><tr className="text-gray-500"><th className="p-4 font-semibold w-2/5">Equipo</th><th className="p-4 font-semibold w-1/5">Costo / Venta</th><th className="p-4 text-right font-semibold w-2/5">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockCelulares.map((celu) => (
                      <tr key={celu.ids[0]} className="hover:bg-gray-50 transition">
                        {editandoCelularId === celu.ids[0] ? (
                          <Fragment>
                            <td className="p-2 space-y-1">
                              <div className="flex gap-1"><input className="border border-gray-300 p-1 w-24 text-xs rounded" name="modelo" value={formEdicionCelular.modelo} onChange={handleChangeEdicionCelular} /><input className="border border-gray-300 p-1 w-16 text-xs rounded" name="capacidad" value={formEdicionCelular.capacidad} onChange={handleChangeEdicionCelular} /></div>
                              <div className="flex gap-1"><input className="border border-gray-300 p-1 w-14 text-xs rounded" name="bateria" type="number" min="0" max="100" value={formEdicionCelular.bateria} onChange={handleChangeEdicionCelular} placeholder="Bat %" /><input className="border border-gray-300 p-1 w-28 text-xs rounded" name="color" value={formEdicionCelular.color} onChange={handleChangeEdicionCelular} placeholder="Color" /></div>
                              <input className="border border-gray-300 p-1 w-full text-xs rounded" name="detalles" value={formEdicionCelular.detalles} onChange={handleChangeEdicionCelular} placeholder="Detalles" />
                              <div className="flex items-center gap-2 mt-2 bg-blue-50 p-1.5 rounded border border-blue-100"><span className="text-xs text-blue-700 font-bold">Aplicar a:</span><select name="cantidadAEditar" value={formEdicionCelular.cantidadAEditar} onChange={handleChangeEdicionCelular} className="border border-gray-300 p-1 text-xs rounded bg-white text-gray-800">{Array.from({length: celu.cantidad}, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} unidad(es)</option>)}</select></div>
                            </td>
                            <td className="p-2"><input className="border border-gray-300 p-1 w-16 text-xs rounded mb-1" name="costo_usd" type="number" min="0" value={formEdicionCelular.costo_usd} onChange={handleChangeEdicionCelular} placeholder="Costo" /><br/><input className="border border-gray-300 p-1 w-16 text-xs rounded" name="precio_usd" type="number" min="0" value={formEdicionCelular.precio_usd} onChange={handleChangeEdicionCelular} placeholder="Venta" /></td>
                            <td className="p-2 text-right space-x-1"><button onClick={guardarEdicionCelular} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-blue-700">Guardar</button><button onClick={() => setEditandoCelularId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-bold hover:bg-gray-400">Cancelar</button></td>
                          </Fragment>
                        ) : (
                          <Fragment>
                            <td className="p-4 font-semibold text-gray-800"><div className="flex items-center gap-2 mb-1"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm">x{celu.cantidad}</span><span className="whitespace-nowrap">{celu.modelo} {celu.capacidad}</span> {renderizarCirculoColor(celu.color)}</div><div className="text-xs font-medium text-gray-500 mt-1">Bat: {celu.bateria}% | {celu.detalles}</div></td>
                            <td className="p-4"><span className="text-red-500 font-medium">$ {celu.costo_usd}</span> / <span className="text-green-600 font-bold">$ {celu.precio_usd}</span></td>
                            <td className="p-4 text-right">
                              <div className="relative inline-block text-left">
                                <button onClick={() => setMenuAbierto(menuAbierto === 'celular-'+celu.ids[0] ? null : 'celular-'+celu.ids[0])} className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-300 transition text-xs shadow-sm">
                                  Opciones ▾
                                </button>
                                {menuAbierto === 'celular-'+celu.ids[0] && (
                                  <div className="absolute right-0 mt-2 w-28 bg-white rounded-xl shadow-xl z-50 border border-gray-100 overflow-hidden">
                                    <div className="flex flex-col">
                                      <button onClick={() => { setMenuAbierto(null); iniciarEdicionCelular(celu); }} className="px-4 py-2.5 text-xs font-bold text-blue-600 bg-white hover:bg-blue-50 text-left border-b border-gray-50">Editar</button>
                                      <button onClick={() => { setMenuAbierto(null); confirmarVenta(celu, 'celulares'); }} className="px-4 py-2.5 text-xs font-bold text-green-700 bg-white hover:bg-green-50 text-left border-b border-gray-50">Vendido</button>
                                      <button onClick={() => { setMenuAbierto(null); confirmarBorrado(celu, 'celulares'); }} className="px-4 py-2.5 text-xs font-bold text-red-500 bg-white hover:bg-red-50 text-left">Borrar</button>
                                    </div>
                                  </div>
                                )}
                              </div>
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

        {activeTab === 'accesorios' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold mb-5 flex items-center text-gray-800">Nuevo Ingreso de Accesorio</h2>
              <form onSubmit={handleGuardarAccesorio} autoComplete="off" className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <input required name="tipo" value={formAccesorio.tipo} onChange={handleChangeAccesorio} type="text" placeholder="Tipo (Ej: Funda, Vidrio)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <input required name="modelo" value={formAccesorio.modelo} onChange={handleChangeAccesorio} type="text" placeholder="Mod. (Ej: iPhone 13)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <input required name="color" value={formAccesorio.color} onChange={handleChangeAccesorio} type="text" placeholder="Color / Diseño" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <input required name="costo_usd" value={formAccesorio.costo_usd} onChange={handleChangeAccesorio} type="number" min="0" step="0.01" placeholder="Costo (USD)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                  <div className="flex flex-col">
                    <input required name="precio_usd" value={formAccesorio.precio_usd} onChange={handleChangeAccesorio} type="number" min="0" step="0.01" placeholder="Venta (USD)" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none w-full" />
                    <span className="text-[10px] text-green-600 font-bold mt-1 ml-1 h-3">{formAccesorio.precio_usd ? "ARS $ " + (formAccesorio.precio_usd * cotizacion).toLocaleString('es-AR') : ''}</span>
                  </div>
                  <input name="detalles" value={formAccesorio.detalles} onChange={handleChangeAccesorio} type="text" placeholder="Detalles extra" className="border border-gray-200 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                </div>
                <div className="flex flex-col gap-2 md:w-32">
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                    <input required name="cantidad" value={formAccesorio.cantidad} onChange={handleChangeAccesorio} type="number" min="1" className="border border-gray-200 p-2.5 pl-12 rounded-lg bg-gray-50 focus:bg-white outline-none w-full font-bold" />
                  </div>
                  <button type="submit" className="bg-blue-600 text-white py-2.5 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition h-full text-sm">Agregar</button>
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
                <p className="font-black text-2xl text-gray-800">$ {statsAccesorios.totalCosto.toLocaleString('es-AR')}</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Valor de Venta</p>
                <p className="font-black text-2xl text-blue-600">$ {statsAccesorios.totalVenta.toLocaleString('es-AR')}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Ganancia Esperada</p>
                <p className="font-black text-xl text-green-600 leading-tight">
                  $ {statsAccesorios.gananciaUsd.toLocaleString('es-AR')} <span className="text-[10px] text-gray-500 block font-semibold mt-0.5">ARS $ {statsAccesorios.gananciaArs.toLocaleString('es-AR')}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible">
              <div className="max-h-[400px] overflow-y-auto overflow-x-visible">
                <table className="w-full text-sm text-left min-w-[600px]">
                  <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 shadow-sm z-10"><tr className="text-gray-500"><th className="p-4 font-semibold w-2/5">Accesorio</th><th className="p-4 font-semibold w-1/5">Costo / Venta</th><th className="p-4 text-right font-semibold w-2/5">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockAccesorios.map((acc) => (
                      <tr key={acc.ids[0]} className="hover:bg-gray-50 transition">
                        {editandoAccesorioId === acc.ids[0] ? (
                          <Fragment>
                            <td className="p-2 space-y-1">
                              <div className="flex gap-1"><input className="border border-gray-300 p-1 w-24 text-xs rounded" name="tipo" value={formEdicionAccesorio.tipo} onChange={handleChangeEdicionAccesorio} /><input className="border border-gray-300 p-1 w-24 text-xs rounded" name="modelo" value={formEdicionAccesorio.modelo} onChange={handleChangeEdicionAccesorio} /></div>
                              <div className="flex gap-1"><input className="border border-gray-300 p-1 w-full text-xs rounded" name="color" value={formEdicionAccesorio.color} onChange={handleChangeEdicionAccesorio} placeholder="Color" /><input className="border border-gray-300 p-1 w-full text-xs rounded" name="detalles" value={formEdicionAccesorio.detalles} onChange={handleChangeEdicionAccesorio} placeholder="Detalles" /></div>
                              <div className="flex items-center gap-2 mt-2 bg-blue-50 p-1.5 rounded border border-blue-100"><span className="text-xs text-blue-700 font-bold">Aplicar a:</span><select name="cantidadAEditar" value={formEdicionAccesorio.cantidadAEditar} onChange={handleChangeEdicionAccesorio} className="border border-gray-300 p-1 text-xs rounded bg-white text-gray-800">{Array.from({length: acc.cantidad}, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} unidad(es)</option>)}</select></div>
                            </td>
                            <td className="p-2"><input className="border border-gray-300 p-1 w-16 text-xs rounded mb-1" name="costo_usd" type="number" min="0" value={formEdicionAccesorio.costo_usd} onChange={handleChangeEdicionAccesorio} placeholder="Costo" /><br/><input className="border border-gray-300 p-1 w-16 text-xs rounded" name="precio_usd" type="number" min="0" value={formEdicionAccesorio.precio_usd} onChange={handleChangeEdicionAccesorio} placeholder="Venta" /></td>
                            <td className="p-2 text-right space-x-1"><button onClick={guardarEdicionAccesorio} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-blue-700">Guardar</button><button onClick={() => setEditandoAccesorioId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-bold hover:bg-gray-400">Cancelar</button></td>
                          </Fragment>
                        ) : (
                          <Fragment>
                            <td className="p-4 font-semibold text-gray-800"><div className="flex items-center gap-2 mb-1"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm">x{acc.cantidad}</span><span className="whitespace-nowrap">{acc.tipo} - {acc.modelo}</span> {renderizarCirculoColor(acc.color)}</div><div className="text-xs font-medium text-gray-500 mt-1">{acc.detalles}</div></td>
                            <td className="p-4"><span className="text-red-500 font-medium">$ {acc.costo_usd}</span> / <span className="text-green-600 font-bold">$ {acc.precio_usd}</span></td>
                            <td className="p-4 text-right">
                              <div className="relative inline-block text-left">
                                <button onClick={() => setMenuAbierto(menuAbierto === 'accesorio-'+acc.ids[0] ? null : 'accesorio-'+acc.ids[0])} className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-300 transition text-xs shadow-sm">
                                  Opciones ▾
                                </button>
                                {menuAbierto === 'accesorio-'+acc.ids[0] && (
                                  <div className="absolute right-0 mt-2 w-28 bg-white rounded-xl shadow-xl z-50 border border-gray-100 overflow-hidden">
                                    <div className="flex flex-col">
                                      <button onClick={() => { setMenuAbierto(null); iniciarEdicionAccesorio(acc); }} className="px-4 py-2.5 text-xs font-bold text-blue-600 bg-white hover:bg-blue-50 text-left border-b border-gray-50">Editar</button>
                                      <button onClick={() => { setMenuAbierto(null); confirmarVenta(acc, 'accesorios'); }} className="px-4 py-2.5 text-xs font-bold text-green-700 bg-white hover:bg-green-50 text-left border-b border-gray-50">Vendido</button>
                                      <button onClick={() => { setMenuAbierto(null); confirmarBorrado(acc, 'accesorios'); }} className="px-4 py-2.5 text-xs font-bold text-red-500 bg-white hover:bg-red-50 text-left">Borrar</button>
                                    </div>
                                  </div>
                                )}
                              </div>
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

        <div className="space-y-4 pt-8 border-t border-gray-200 mt-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
            <h2 className="text-2xl font-bold text-gray-800">Historial Global de Ventas</h2>
            <div className="flex gap-2">
               {ventasFiltradas.length > 0 && (
                <button onClick={exportarExcelNativo} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 text-sm shadow-sm flex items-center gap-2 transition">
                  Descargar CSV Global
                </button>
              )}
              {mesesDisponibles.length > 0 && (
                <select value={mesSeleccionado} onChange={(e) => setMesSeleccionado(e.target.value)} className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold bg-white text-gray-700 outline-none shadow-sm cursor-pointer hover:bg-gray-50 transition w-full md:w-auto">
                  <option value="todos">Histórico Total</option>
                  {mesesDisponibles.map(mes => (<option key={mes} value={mes}>{formatearNombreMes(mes)}</option>))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500"><p className="text-gray-500 text-sm font-medium">Items Vendidos</p><p className="text-3xl font-black mt-1 text-gray-800">{totalVendidos}</p></div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-green-500"><p className="text-gray-500 text-sm font-medium">Ganancia Neta (USD)</p><p className="text-3xl font-black mt-1 text-green-600">$ {gananciaVentasUSD.toFixed(2)}</p></div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-emerald-400 col-span-2 md:col-span-1"><p className="text-gray-500 text-sm font-medium">Ganancia (ARS)</p><p className="text-3xl font-black mt-1 text-emerald-600">$ {gananciaVentasARS.toLocaleString('es-AR')}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {datosGrafico.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider text-center">Ganancias Unificadas (Últimos 6 Meses)</h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGrafico}>
                      <XAxis dataKey="name" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none'}} />
                      <Bar dataKey="Ganancia" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
              <div className="flex-grow">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b border-gray-200"><tr className="text-gray-500"><th className="p-4 font-semibold">Producto</th><th className="p-4 font-semibold text-center">Fecha</th><th className="p-4 text-right font-semibold">Ganancia</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventasPaginadas.map((item) => (
                      <tr key={item.categoria + '-' + item.id} className="hover:bg-gray-50 transition">
                        <td className="p-4 font-semibold text-gray-800">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">{item.categoria}</span>
                          {item.categoria === 'celular' ? `\({item.modelo}\){item.capacidad}` : `\({item.tipo} -\){item.modelo}`} {renderizarCirculoColor(item.color)}
                        </td>
                        <td className="p-4 text-center text-gray-500 text-xs font-medium">{item.fecha_venta ? new Date(item.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha'}</td>
                        <td className="p-4 text-right"><span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">+ $ {(item.precio_usd - item.costo_usd).toFixed(2)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPaginas > 1 && (
                <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between items-center mt-auto">
                  <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50">Anterior</button>
                  <span className="text-xs font-medium text-gray-600">Pág {paginaActual} de {totalPaginas}</span>
                  <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50">Siguiente</button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      <div className="mt-12 text-center flex flex-col items-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Desarrollado por</span>
        <a href="https://www.instagram.com/lambdasoluciones/" target="_blank" rel="noreferrer" className="font-bold text-xs uppercase tracking-wide text-blue-600 hover:text-blue-800 transition">
          LAMBDA SOLUCIONES
        </a>
      </div>

      {showPermutaModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Registrar Equipo en Permuta</h2>
            <form onSubmit={handleGuardarPermuta} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Modelo del equipo usado</label>
                <input required name="modelo" value={formPermuta.modelo} onChange={handleChangePermuta} type="text" placeholder="Ej: iPhone 11 Pro" className="border border-gray-300 p-2.5 rounded-lg w-full bg-gray-50 focus:bg-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Detalles (Estado, batería, rayas)</label>
                <input required name="detalles" value={formPermuta.detalles} onChange={handleChangePermuta} type="text" placeholder="Ej: Batería 82%, detalle en pantalla" className="border border-gray-300 p-2.5 rounded-lg w-full bg-gray-50 focus:bg-white outline-none" />
              </div>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="text-xs font-bold text-blue-800 mb-1 block">Precio tomado (Pesos ARS)</label>
                <input required name="precio_ars" value={formPermuta.precio_ars} onChange={handleChangePermuta} type="number" min="0" placeholder="Ej: 450000" className="border border-blue-200 p-2.5 rounded-lg w-full bg-white outline-none font-bold text-gray-800" />
                <p className="text-xs text-blue-600 mt-2 font-bold text-right">
                  Equivale a: USD {formPermuta.precio_ars ? (formPermuta.precio_ars / cotizacion).toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setShowPermutaModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition">Cancelar</button>
                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-purple-700 transition">Guardar Permuta</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default Admin;