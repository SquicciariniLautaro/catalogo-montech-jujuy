import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function Catalogo() {
  const [celularesAgrupados, setCelularesAgrupados] = useState([])
  const [cotizacion, setCotizacion] = useState(1250)
  const [descuentoMayorista, setDescuentoMayorista] = useState(5) // Nuevo estado
  const [cargando, setCargando] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)
  
  // Nuevo: Estado para la búsqueda
  const [busqueda, setBusqueda] = useState("")

  const numeroMontech = "5493885265866"

  useEffect(() => {
    document.title = "Montech | Catálogo"
    async function cargarDatos() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setEsAdmin(true)

        // Traemos cotización y el porcentaje de descuento
        const { data: configData } = await supabase.from('configuracion').select('cotizacion_dolar, descuento_mayorista').eq('id', 1).single()
        if (configData) {
          setCotizacion(configData.cotizacion_dolar)
          if(configData.descuento_mayorista) setDescuentoMayorista(configData.descuento_mayorista)
        }

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
    let claseColor = ""; let conBorde = false;
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

  // Filtrado en tiempo real
  const celularesFiltrados = celularesAgrupados.filter(celu => {
    const termino = busqueda.toLowerCase();
    return celu.modelo.toLowerCase().includes(termino) || 
           celu.color.toLowerCase().includes(termino) ||
           celu.capacidad.toLowerCase().includes(termino);
  });

  if (cargando) return <div className="p-10 text-center font-bold text-gray-600">Cargando catálogo...</div>

  return (
    <div className="relative p-2 md:p-4 max-w-4xl mx-auto font-sans bg-white pb-6 min-h-screen flex flex-col">
      {esAdmin && (
        <a href="/admin" className="absolute top-3 right-3 bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-md hover:bg-gray-800 transition">
          Volver al Panel
        </a>
      )}

      <div className="flex justify-center items-center mb-4 mt-6">
        <img src="/logo.png" alt="Montech Jujuy" className="h-28 md:h-36 object-contain drop-shadow-xl" onError={(e) => e.target.style.display = 'none'} />
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="mb-6 relative">
        <input 
          type="text" 
          placeholder="Buscar por modelo (Ej: 14 Pro), color o capacidad..." 
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 p-3 pl-10 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none transition"
        />
        <svg className="w-5 h-5 absolute left-3 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
      </div>
      
      <div className="overflow-x-auto shadow-sm border border-gray-300 rounded-lg flex-grow w-full">
        <table className="w-full border-collapse text-sm min-w-[850px]">
          <thead>
            <tr className="bg-[#e4ecfa] border-b border-gray-300 text-gray-900 text-[11px] uppercase font-bold tracking-wider">
              <th className="p-3 text-center w-1/12">Cant</th>
              <th className="p-3 border-r border-gray-300 text-left">Modelo / Color</th>
              <th className="p-3 border-r border-gray-300 text-center">Batería</th>
              <th className="p-3 border-r border-gray-300 text-right">Precio Contado</th>
              <th className="p-3 border-r border-gray-300 text-right text-blue-700">Mayorista (-{descuentoMayorista}%)</th>
              <th className="p-3 text-left border-r border-gray-300">Detalles</th>
              <th className="p-3 text-center w-1/12">Consultar</th>
            </tr>
          </thead>
          <tbody>
            {celularesFiltrados.length === 0 && (
              <tr><td colSpan="7" className="text-center p-6 text-gray-500">No se encontraron equipos con esa búsqueda.</td></tr>
            )}

            {celularesFiltrados.map((celu, index) => {
              const precioPesos = celu.precio_usd * cotizacion
              const multiplicadorDescuento = (100 - descuentoMayorista) / 100
              const precioMayoristaPesos = precioPesos * multiplicadorDescuento
              
              const colorLimpio = celu.color.replace(/[^\w\sñÑáéíóúÁÉÍÓÚ]/gi, '').trim()
              const textoWsp = `Hola Montech! 👋 Vi en tu catálogo el *${celu.modelo} ${celu.capacidad}* (${colorLimpio}) a *$${precioPesos.toLocaleString("es-AR")}*. ¿Tenés stock?`
              const linkWsp = `https://wa.me/${numeroMontech}?text=${encodeURIComponent(textoWsp)}`

              return (
                <tr key={index} className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition`}>
                  <td className="p-3 text-center font-bold text-blue-600 bg-blue-50 border-r border-blue-100">{celu.cantidad}</td>
                  <td className="p-3 border-r border-gray-200 font-bold whitespace-nowrap text-gray-800 text-[13px]">
                    {celu.modelo} <span className="font-medium text-gray-500 text-xs ml-1">{celu.capacidad}</span> {renderizarCirculoColor(celu.color)}
                  </td>
                  <td className="p-3 border-r border-gray-200 text-center font-semibold text-gray-700">{celu.bateria}%</td>
                  <td className="p-3 border-r border-gray-200 text-right font-black text-gray-900 text-[14px] whitespace-nowrap">$ {precioPesos.toLocaleString("es-AR")}</td>
                  <td className="p-3 border-r border-gray-200 text-right font-black text-blue-700 text-[14px] whitespace-nowrap">$ {precioMayoristaPesos.toLocaleString("es-AR")}</td>
                  <td className="p-3 text-[11px] text-gray-600 font-medium uppercase leading-relaxed border-r border-gray-200">{celu.detalles}</td>
                  <td className="p-2 text-center">
                    <a href={linkWsp} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-green-500 hover:bg-green-600 text-white p-2 rounded-full transition shadow-sm" title="Consultar por WhatsApp">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      
      <div className="mt-3 text-right text-[11px] text-gray-400 font-semibold px-2 mb-8">Cotización de referencia USD: ${cotizacion}</div>
    </div>
  )
}
export default Catalogo