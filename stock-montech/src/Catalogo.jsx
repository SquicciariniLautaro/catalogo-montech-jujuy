import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function Catalogo() {
const [celularesAgrupados, setCelularesAgrupados] = useState([])
const [cotizacion, setCotizacion] = useState(1250)
const [cargando, setCargando] = useState(true)
const [esAdmin, setEsAdmin] = useState(false)

useEffect(() => {
    document.title = "Montech | Catálogo"
    
    async function cargarDatos() {
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setEsAdmin(true)

        const { data: configData } = await supabase.from('configuracion').select('cotizacion_dolar').eq('id', 1).single()
        if (configData) setCotizacion(configData.cotizacion_dolar)

        const { data: celularesData } = await supabase
        .from('celulares')
        .select('*')
        .eq('estado', 'disponible')
        .order('modelo', { ascending: true })

        if (celularesData) {
        const agrupados = celularesData.reduce((acc, celu) => {
            const key = `${celu.modelo}-${celu.capacidad}-${celu.color}-${celu.bateria}-${celu.precio_usd}-${celu.detalles}`
            
            if (!acc[key]) {
            acc[key] = { ...celu, cantidad: 1 }
            } else {
            acc[key].cantidad += 1
            }
            return acc
        }, {})

        setCelularesAgrupados(Object.values(agrupados))
        }
    } catch (error) {
        console.error("Error al cargar datos:", error.message)
    } finally {
        setCargando(false)
    }
    }
    cargarDatos()
}, [])

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

if (cargando) return <div className="p-10 text-center font-bold text-gray-600">Cargando catálogo...</div>

return (
    <div className="relative p-2 max-w-xl mx-auto font-sans bg-white pb-6 min-h-screen flex flex-col">
    
    {esAdmin && (
        <a href="/admin" className="absolute top-3 right-3 bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-md hover:bg-gray-800 transition">
        Volver al Panel
        </a>
    )}

      {/* Título y Logo del cliente */}
    <div className="flex justify-center items-center gap-3 mb-4 mt-4">
        {/* Busca la imagen en la carpeta public */}
        <img src="/logo.png" alt="Logo" className="h-8 object-contain rounded-md" onError={(e) => e.target.style.display = 'none'} />
        <h1 className="text-2xl font-extrabold text-black tracking-wider uppercase m-0">MONTECH</h1>
    </div>
    
    <div className="overflow-hidden shadow-sm border border-gray-300 rounded-lg flex-grow">
        <table className="w-full border-collapse text-sm">
        <thead>
            <tr className="bg-[#e4ecfa] border-b border-gray-300 text-gray-900 text-[11px] uppercase font-bold tracking-wider">
            <th className="p-2 text-left w-1/12">Cant</th>
            <th className="p-2 border-r border-gray-300 text-left">Modelo / Color</th>
            <th className="p-2 border-r border-gray-300 text-center">Batería</th>
            <th className="p-2 border-r border-gray-300 text-right">Precio Contado</th>
            <th className="p-2 text-left">Detalles</th>
            </tr>
        </thead>
        <tbody>
            {celularesAgrupados.length === 0 && (
            <tr>
                <td colSpan="5" className="text-center p-4 text-gray-500">No hay celulares en stock.</td>
            </tr>
            )}

            {celularesAgrupados.map((celu, index) => {
              const precioPesos = celu.precio_usd * cotizacion

            return (
                <tr 
                key={index} 
                className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                >
                <td className="p-2 text-center font-bold text-blue-600 bg-blue-50 border-r border-blue-100">
                    {celu.cantidad}
                </td>
                <td className="p-2 border-r border-gray-200 font-bold whitespace-nowrap text-gray-800 text-[13px]">
                    {celu.modelo} <span className="font-medium text-gray-500 text-xs ml-1">{celu.capacidad}</span> {renderizarCirculoColor(celu.color)}
                </td>
                <td className="p-2 border-r border-gray-200 text-center font-semibold text-gray-700">
                    {celu.bateria}%
                </td>
                <td className="p-2 border-r border-gray-200 text-right font-black text-gray-900 text-[14px]">
                    $ {precioPesos.toLocaleString("es-AR")}
                </td>
                <td className="p-2 text-[11px] text-gray-600 font-medium uppercase leading-tight">
                    {celu.detalles}
                </td>
                </tr>
            )
            })}
        </tbody>
        </table>
    </div>
    
    <div className="mt-3 text-right text-[11px] text-gray-400 font-semibold px-2 mb-6">
        Cotización de referencia USD: ${cotizacion}
    </div>

{/* FOOTER PROFESIONAL */}
    <div className="mt-auto pt-8 pb-4 flex flex-col items-center w-full relative">
        
        {/* Enlace al Instagram del Cliente */}
        <a href="https://www.instagram.com/montech.jujuy/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-gray-700 hover:text-black transition mb-5 bg-gray-50 px-4 py-2 rounded-full border border-gray-200 shadow-sm">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
        </svg>
        <span className="font-bold text-xs tracking-wide">@montech.jujuy</span>
        </a>

        <div className="w-[80%] border-t border-gray-200 mb-4"></div>

        {/* Firma de Lambda Soluciones + Botón Secreto de Login (Más visible) */}
        <div className="flex flex-col items-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Desarrollado por
        </span>
        <div className="flex items-center gap-3">
            <a href="https://www.instagram.com/lambdasoluciones/" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
            </svg>
            <span className="font-bold text-[11px] uppercase tracking-wider">Lambda Soluciones</span>
            </a>
            
            {!esAdmin && (
            <a href="/admin" className="text-gray-400 hover:text-gray-800 transition p-1" title="Acceso Administrativo">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
            </a>
            )}
        </div>
        </div>
    </div>
    </div>
)
}

export default Catalogo