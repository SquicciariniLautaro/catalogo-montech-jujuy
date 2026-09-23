import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import toast from 'react-hot-toast'

function Admin() {
 const [cotizacion, setCotizacion] = useState(1250)
const [stock, setStock] = useState([])
const [vendidos, setVendidos] = useState([])
const [cargando, setCargando] = useState(true)

const estadoInicialForm = {
    modelo: '', capacidad: '', color: '', bateria: '', costo_usd: '', precio_usd: '', detalles: '', cantidad: 1
}
const [form, setForm] = useState(estadoInicialForm)

const [editandoId, setEditandoId] = useState(null)
const [formEdicion, setFormEdicion] = useState({})

//Estado para el filtro de meses
const [mesSeleccionado, setMesSeleccionado] = useState('todos')

useEffect(() => {
    document.title = "Montech | Admin"
    cargarDatos()
}, [])

async function cargarDatos() {
    setCargando(true)
    const { data: config } = await supabase.from('configuracion').select('cotizacion_dolar').eq('id', 1).single()
    if (config) setCotizacion(config.cotizacion_dolar)

    const { data: disponibles } = await supabase.from('celulares').select('*').eq('estado', 'disponible').order('fecha_ingreso', { ascending: false })
    
    if (disponibles) {
    const agrupados = disponibles.reduce((acc, celu) => {
        const key = `${celu.modelo}-${celu.capacidad}-${celu.color}-${celu.bateria}-${celu.costo_usd}-${celu.precio_usd}-${celu.detalles}`
        if (!acc[key]) {
        acc[key] = { ...celu, cantidad: 1, ids: [celu.id] }
        } else {
        acc[key].cantidad += 1
        acc[key].ids.push(celu.id)
        }
        return acc
    }, {})
    setStock(Object.values(agrupados))
    }

    const { data: vendidosData } = await supabase.from('celulares').select('*').eq('estado', 'vendido').order('fecha_venta', { ascending: false })
    if (vendidosData) setVendidos(vendidosData)

    setCargando(false)
}

const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

async function handleActualizarDolar() {
    const { error } = await supabase.from('configuracion').update({ cotizacion_dolar: cotizacion }).eq('id', 1)
    if (!error) toast.success("Cotización actualizada")
}

async function handleGuardarCelular(e) {
    e.preventDefault()
    const cantidad = parseInt(form.cantidad) || 1;
    
    let capacidadFormat = form.capacidad.trim().toUpperCase();
    if (capacidadFormat && !capacidadFormat.includes('GB') && !capacidadFormat.includes('TB')) {
    capacidadFormat += 'GB';
    }
    
    const nuevosCelulares = Array.from({ length: cantidad }, () => ({
    modelo: form.modelo,
    capacidad: capacidadFormat,
    color: form.color,
    bateria: parseInt(form.bateria),
    costo_usd: parseFloat(form.costo_usd),
    precio_usd: parseFloat(form.precio_usd),
    detalles: form.detalles
    }));

    const { error } = await supabase.from('celulares').insert(nuevosCelulares)
    
    if (!error) {
    toast.success(`${cantidad} equipo(s) agregado(s) al catálogo`)
    setForm({ ...form, cantidad: 1, color: '' }) 
    cargarDatos()
    } else {
    toast.error("Error al guardar: " + error.message)
    }
}

const confirmarVenta = (ids) => {
    toast((t) => (
    <div>
        <p className="font-bold text-white text-sm mb-3">¿Registrar venta de UNA unidad?</p>
        <div className="flex justify-end gap-2">
        <button onClick={() => { toast.dismiss(t.id); ejecutarVenta(ids); }} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-green-700">Sí, vender</button>
        <button onClick={() => toast.dismiss(t.id)} className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300">Cancelar</button>
        </div>
    </div>
    ), { duration: Infinity, id: 'confirm-venta' });
}

async function ejecutarVenta(ids) {
    await supabase.from('celulares').update({ estado: 'vendido', fecha_venta: new Date().toISOString() }).eq('id', ids[0])
    toast.success("¡Venta registrada con éxito!")
    cargarDatos()
}

const confirmarBorrado = (ids) => {
    toast((t) => (
    <div>
        <p className="font-bold text-white text-sm mb-3">¿Eliminar UNA unidad del sistema?</p>
        <div className="flex justify-end gap-2">
        <button onClick={() => { toast.dismiss(t.id); ejecutarBorrado(ids); }} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-red-600">Sí, borrar</button>
        <button onClick={() => toast.dismiss(t.id)} className="bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-300">Cancelar</button>
        </div>
    </div>
    ), { duration: Infinity, id: 'confirm-borrar' });
}

async function ejecutarBorrado(ids) {
    await supabase.from('celulares').delete().eq('id', ids[0])
    toast.success("Equipo eliminado")
    cargarDatos()
}

const iniciarEdicion = (celular) => {
    setEditandoId(celular.ids[0])
    setFormEdicion(celular)
}

const handleChangeEdicion = (e) => setFormEdicion({ ...formEdicion, [e.target.name]: e.target.value })

async function guardarEdicion(id_unico) {
    let capacidadFormat = formEdicion.capacidad.trim().toUpperCase();
    if (capacidadFormat && !capacidadFormat.includes('GB') && !capacidadFormat.includes('TB')) {
    capacidadFormat += 'GB';
    }

    const { error } = await supabase.from('celulares').update({
    modelo: formEdicion.modelo,
    capacidad: capacidadFormat,
    color: formEdicion.color,
    bateria: parseInt(formEdicion.bateria),
    costo_usd: parseFloat(formEdicion.costo_usd),
    precio_usd: parseFloat(formEdicion.precio_usd),
    detalles: formEdicion.detalles
    }).eq('id', id_unico)

    if (!error) {
    toast.success("Cambios guardados")
    setEditandoId(null)
    cargarDatos()
    } else {
    toast.error("Error al actualizar: " + error.message)
    }
}

const renderizarCirculoColor = (valorColor) => {
    if (!valorColor) return null;
    const c = valorColor.toLowerCase();
    let claseColor = "";
    let conBorde = false;

    if (c.includes('\u26AB') || c.includes('negro') || c.includes('medianoche')) claseColor = "bg-gray-900";
    else if (c.includes('\u26AA') || c.includes('blanco') || c.includes('estelar')) { claseColor = "bg-white"; conBorde = true; }
    else if (c.includes('plata') || c.includes('silver')) claseColor = "bg-gray-200";
    else if (c.includes('gris') || c.includes('grafito')) claseColor = "bg-gray-600";
    else if (c.includes('oro rosa') || c.includes('rosa')) claseColor = "bg-pink-300";
    else if (c.includes('oro') || c.includes('desierto')) claseColor = "bg-yellow-200"; 
    else if (c.includes('\uD83D\uDD35') || c.includes('azul')) claseColor = "bg-blue-500";
    else if (c.includes('\uD83D\uDC9C') || c.includes('morado') || c.includes('violeta') || c.includes('purpura')) claseColor = "bg-purple-600";
    else if (c.includes('verde')) claseColor = "bg-emerald-500";
    else if (c.includes('amarillo')) claseColor = "bg-yellow-400";
    else if (c.includes('naranja')) claseColor = "bg-orange-500"; 
    else if (c.includes('rojo') || c.includes('red')) claseColor = "bg-red-600";
    else if (c.includes('titanio')) claseColor = "bg-stone-400"; 
    else return <span className="ml-1 text-xs text-gray-600 font-medium">{valorColor}</span>;

    return <span className={`inline-block w-3.5 h-3.5 rounded-full ml-1.5 align-middle shadow-sm ${claseColor} ${conBorde ? 'border border-gray-300' : ''}`} />;
};

  // --- LÓGICA DE FILTRADO POR MESES ---
const obtenerMesAnio = (fechaISO) => {
    if (!fechaISO) return 'Sin fecha';
    const fecha = new Date(fechaISO);
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}`;
};

const formatearNombreMes = (yyyyMm) => {
    if (yyyyMm === 'Sin fecha') return 'Sin fecha';
    const [year, month] = yyyyMm.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[parseInt(month) - 1]} ${year}`;
};

const mesesDisponibles = [...new Set(vendidos.map(v => obtenerMesAnio(v.fecha_venta)))].filter(m => m !== 'Sin fecha').sort().reverse();
const ventasFiltradas = mesSeleccionado === 'todos' ? vendidos : vendidos.filter(v => obtenerMesAnio(v.fecha_venta) === mesSeleccionado);

const totalVendidos = ventasFiltradas.length;
const gananciaTotalUSD = ventasFiltradas.reduce((acc, celu) => acc + (celu.precio_usd - celu.costo_usd), 0);
const gananciaTotalARS = gananciaTotalUSD * cotizacion;
// -------------------------------------

if (cargando) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Cargando datos...</div>

return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto text-gray-800 flex flex-col">
    <div className="flex flex-col md:flex-row justify-between items-center mb-8">
        <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Panel de Control</h1>
        <div className="flex items-center gap-4 mt-1">
            <button onClick={() => supabase.auth.signOut()} className="text-sm font-bold text-red-500 hover:underline">
            Cerrar Sesión
            </button>
            <span className="text-gray-300">|</span>
            <a href="/" target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600 hover:underline">
            Ver Catálogo Público ↗
            </a>
        </div>
        </div>
        
        <div className="mt-4 md:mt-0 flex items-center bg-white p-2 rounded-xl shadow-sm border border-gray-200">
        <span className="font-semibold px-3 text-green-600">USD</span>
        <input 
            type="number" min="0" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)}
            className="w-24 border-l pl-3 py-1 outline-none font-bold text-gray-700 bg-transparent"
        />
        <button onClick={handleActualizarDolar} className="ml-2 bg-gray-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
            Actualizar
        </button>
        </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow">
        
        {/* COLUMNA IZQUIERDA (Formulario) */}
        <div className="lg:col-span-4 space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold mb-5 flex items-center text-gray-800">
            <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
            </svg>
            Nuevo Ingreso
            </h2>
            
            <form onSubmit={handleGuardarCelular} autoComplete="off" className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
                <input required name="modelo" value={form.modelo} onChange={handleChange} type="text" placeholder="Mod. (Ej: 14 PRO)" className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                <input required name="capacidad" value={form.capacidad} onChange={handleChange} type="text" placeholder="Cap. (Ej: 128)" className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
                <select required name="color" value={form.color} onChange={handleChange} className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none text-gray-700">
                <option value="" disabled>Color...</option>
                <option value="Negro">Negro</option>
                <option value="Blanco">Blanco</option>
                <option value="Plata">Plata</option>
                <option value="Gris">Gris</option>
                <option value="Oro">Oro</option>
                <option value="Rosa">Rosa</option>
                <option value="Azul">Azul</option>
                <option value="Morado">Morado / Púrpura</option>
                <option value="Verde">Verde</option>
                <option value="Amarillo">Amarillo</option>
                <option value="Naranja">Naranja</option>
                <option value="Rojo">Rojo</option>
                <option value="Titanio">Titanio Natural</option>
                <option value="Titanio del Desierto">Titanio del Desierto</option>
                </select>
                <input required name="bateria" value={form.bateria} onChange={handleChange} type="number" min="0" max="100" placeholder="Batería %" className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
                <input required name="costo_usd" value={form.costo_usd} onChange={handleChange} type="number" min="0" step="0.01" placeholder="Costo (USD)" className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
                <input required name="precio_usd" value={form.precio_usd} onChange={handleChange} type="number" min="0" step="0.01" placeholder="Venta (USD)" className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none" />
            </div>
            
            <div className="flex gap-3">
                <input name="detalles" value={form.detalles} onChange={handleChange} type="text" placeholder="Detalles (Opcional)" className="border border-gray-300 p-2.5 rounded-lg bg-gray-50 focus:bg-white outline-none w-2/3" />
                <div className="w-1/3 relative">
                <span className="absolute left-3 top-3 text-gray-500 text-sm font-semibold">Cant:</span>
                <input required name="cantidad" value={form.cantidad} onChange={handleChange} type="number" min="1" className="border border-gray-300 p-2.5 pl-12 rounded-lg bg-gray-50 focus:bg-white outline-none w-full font-bold" />
                </div>
            </div>
            
            <button type="submit" className="mt-2 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition">
                Agregar al Catálogo
            </button>
            
            <button type="button" onClick={() => setForm(estadoInicialForm)} className="text-xs text-gray-500 font-semibold hover:underline text-center">
                Limpiar formulario
            </button>
            </form>
        </div>
        </div>

        {/* COLUMNA DERECHA (Tablas y Métricas) */}
        <div className="lg:col-span-8 space-y-6">
        
          {/* BARRA DE FILTRO POR MES */}
        <div className="flex justify-between items-end">
            <h2 className="text-xl font-bold text-gray-800">Resumen de Ventas</h2>
            {mesesDisponibles.length > 0 && (
            <select 
                value={mesSeleccionado} 
                onChange={(e) => setMesSeleccionado(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold bg-white text-gray-700 outline-none shadow-sm cursor-pointer hover:bg-gray-50 transition"
            >
                <option value="todos">Histórico Total</option>
                {mesesDisponibles.map(mes => (
                <option key={mes} value={mes}>{formatearNombreMes(mes)}</option>
                ))}
            </select>
            )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
            <p className="text-gray-500 text-sm font-medium">Equipos Vendidos</p>
            <p className="text-3xl font-black mt-1 text-gray-800">{totalVendidos}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-green-500">
            <p className="text-gray-500 text-sm font-medium">Ganancia Neta (USD)</p>
            <p className="text-3xl font-black mt-1 text-green-600">${gananciaTotalUSD.toFixed(2)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-emerald-400 col-span-2 md:col-span-1">
            <p className="text-gray-500 text-sm font-medium">Ganancia (ARS)</p>
            <p className="text-3xl font-black mt-1 text-emerald-600">${gananciaTotalARS.toLocaleString('es-AR')}</p>
            </div>
        </div>

          {/* TABLA: CONTROL DE STOCK ACTIVO */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">Control de Stock Activo</h2>
            </div>
            
            <div className="max-h-[350px] overflow-y-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-white sticky top-0 border-b border-gray-200 shadow-sm z-10">
                <tr className="text-gray-500">
                    <th className="p-4 font-semibold w-2/5">Equipo</th>
                    <th className="p-4 font-semibold w-1/5">Costo / Venta</th>
                    <th className="p-4 text-right font-semibold w-2/5">Acciones</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {stock.map((celu) => (
                    <tr key={celu.ids[0]} className="hover:bg-gray-50 transition">
                    {editandoId === celu.ids[0] ? (
                        <>
                        <td className="p-2 space-y-1">
                            <div className="flex gap-1">
                            <input className="border p-1 w-20 text-xs rounded" name="modelo" value={formEdicion.modelo} onChange={handleChangeEdicion} />
                            <input className="border p-1 w-16 text-xs rounded" name="capacidad" value={formEdicion.capacidad} onChange={handleChangeEdicion} />
                            </div>
                            <div className="flex gap-1">
                            <input className="border p-1 w-14 text-xs rounded" name="bateria" type="number" min="0" max="100" value={formEdicion.bateria} onChange={handleChangeEdicion} placeholder="Bat %" />
                            <select name="color" value={formEdicion.color} onChange={handleChangeEdicion} className="border p-1 w-28 text-xs rounded bg-white text-gray-700">
                                <option value="" disabled>Color...</option>
                                <option value="Negro">Negro</option>
                                <option value="Blanco">Blanco</option>
                                <option value="Plata">Plata</option>
                                <option value="Gris">Gris</option>
                                <option value="Oro">Oro</option>
                                <option value="Rosa">Rosa</option>
                                <option value="Azul">Azul /</option>
                                <option value="Morado">Morado / Púrpura</option>
                                <option value="Verde">Verde</option>
                                <option value="Amarillo">Amarillo</option>
                                <option value="Naranja">Naranja</option>
                                <option value="Rojo">Rojo</option>
                                <option value="Titanio">Titanio Natural</option>
                                <option value="Titanio del Desierto">Titanio del Desierto</option>
                            </select>
                            </div>
                            <input className="border p-1 w-full text-xs rounded" name="detalles" value={formEdicion.detalles} onChange={handleChangeEdicion} placeholder="Detalles" />
                        </td>
                        <td className="p-2">
                            <input className="border p-1 w-16 text-xs rounded mb-1" name="costo_usd" type="number" min="0" value={formEdicion.costo_usd} onChange={handleChangeEdicion} placeholder="Costo" /><br/>
                            <input className="border p-1 w-16 text-xs rounded" name="precio_usd" type="number" min="0" value={formEdicion.precio_usd} onChange={handleChangeEdicion} placeholder="Venta" />
                        </td>
                        <td className="p-2 text-right space-x-1">
                            <button onClick={() => guardarEdicion(celu.ids[0])} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-blue-700">Guardar</button>
                            <button onClick={() => setEditandoId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-bold hover:bg-gray-400">Cancelar</button>
                        </td>
                        </>
                    ) : (
                        <>
                        <td className="p-4 font-semibold text-gray-800">
                            <div className="flex items-center gap-2 mb-1">
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold shadow-sm" title="Cantidad en stock">x{celu.cantidad}</span>
                            <span>{celu.modelo} {celu.capacidad}</span> {renderizarCirculoColor(celu.color)}
                            </div>
                            <div className="text-xs font-medium text-gray-500 mt-1">
                            Bat: {celu.bateria}% | {celu.detalles}
                            </div>
                        </td>
                        <td className="p-4">
                            <span className="text-red-500 font-medium">${celu.costo_usd}</span> / <span className="text-green-600 font-bold">${celu.precio_usd}</span>
                        </td>
                        <td className="p-4 text-right space-x-1">
                            <button onClick={() => iniciarEdicion(celu)} className="bg-blue-50 text-blue-600 px-2 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition text-xs">
                            Editar
                            </button>
                            <button onClick={() => confirmarVenta(celu.ids)} className="bg-green-50 text-green-700 px-2 py-1.5 rounded-lg font-bold hover:bg-green-100 transition text-xs">
                            Vendido
                            </button>
                            <button onClick={() => confirmarBorrado(celu.ids)} className="bg-red-50 text-red-500 px-2 py-1.5 rounded-lg font-bold hover:bg-red-100 transition text-xs">
                            Borrar
                            </button>
                        </td>
                        </>
                    )}
                    </tr>
                ))}
                </tbody>
            </table>
            {stock.length === 0 && <p className="text-center p-8 text-gray-500">No hay equipos en stock.</p>}
            </div>
        </div>

          {/* TABLA: HISTORIAL DE VENTAS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-6">
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">
                {mesSeleccionado === 'todos' ? 'Historial Completo' : `Ventas de ${formatearNombreMes(mesSeleccionado)}`}
            </h2>
            </div>
            
            <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-white sticky top-0 border-b border-gray-200 shadow-sm z-10">
                <tr className="text-gray-500">
                    <th className="p-4 font-semibold">Equipo</th>
                    <th className="p-4 font-semibold text-center">Fecha</th>
                    <th className="p-4 text-right font-semibold">Ganancia</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {ventasFiltradas.map((celu) => (
                    <tr key={celu.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-semibold text-gray-800">
                        {celu.modelo} {celu.capacidad} {renderizarCirculoColor(celu.color)}
                    </td>
                    <td className="p-4 text-center text-gray-500 text-xs font-medium">
                        {celu.fecha_venta ? new Date(celu.fecha_venta).toLocaleDateString('es-AR') : 'Sin fecha'}
                    </td>
                    <td className="p-4 text-right">
                        <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">
                        + ${(celu.precio_usd - celu.costo_usd).toFixed(2)} USD
                        </span>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            {ventasFiltradas.length === 0 && <p className="text-center p-8 text-gray-500">No hay ventas en este período.</p>}
            </div>
        </div>

        </div>
    </div>

      {/* FIRMA DE AGENCIA (Con enlace a Instagram) */}
    <div className="mt-auto pt-10 text-center flex flex-col items-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
        Desarrollado por
        </span>
        <a href="https://www.instagram.com/lambdasoluciones/" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
        </svg>
        <span className="font-bold text-xs uppercase tracking-wide">Lambda Soluciones</span>
        </a>
    </div>
    </div>
)
}

export default Admin