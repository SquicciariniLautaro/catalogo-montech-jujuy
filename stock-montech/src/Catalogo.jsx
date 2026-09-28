import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';

function Catalogo() {
  const [celularesAgrupados, setCelularesAgrupados] = useState([]);
  const [cotizacion, setCotizacion] = useState(1250);
  const [cargando, setCargando] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const numeroMontech = "5493885265866";
  const mensajeWsp = "Hola Montech! Estuve viendo el catalogo y queria hacer una consulta.";
  const linkWspGeneral = "https://wa.me/" + numeroMontech + "?text=" + encodeURIComponent(mensajeWsp);

  useEffect(() => {
    document.title = "Montech | Catalogo";
    
    async function cargarDatos() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setEsAdmin(true);

        const { data: configData } = await supabase
          .from('configuracion')
          .select('cotizacion_dolar')
          .eq('id', 1)
          .single();
          
        if (configData) {
          setCotizacion(configData.cotizacion_dolar);
        }

        const { data: celularesData } = await supabase
          .from('celulares')
          .select('*')
          .eq('estado', 'disponible')
          .order('modelo', { ascending: true });

        if (celularesData) {
          const agrupados = celularesData.reduce((acc, celu) => {
            const key = celu.modelo + "-" + celu.capacidad + "-" + celu.color + "-" + celu.bateria + "-" + celu.precio_usd + "-" + celu.detalles;
            if (!acc[key]) {
              acc[key] = { ...celu, cantidad: 1 };
            } else {
              acc[key].cantidad += 1;
            }
            return acc;
          }, {});
          setCelularesAgrupados(Object.values(agrupados));
        }
      } catch (error) {
        console.error(error.message);
      } finally {
        setCargando(false);
      }
    }
    
    cargarDatos();
  }, []);

  const renderizarCirculoColor = (valorColor) => {
    if (!valorColor) return null;
    const c = valorColor.toLowerCase();
    let claseColor = ""; 
    let conBorde = false;
    
    //  Convierte cualquier emoji de la BD en un circulo CSS
    if (c.includes('negro') || c.includes('medianoche') || c.includes('\u26ab') || c.includes('\u2b1b')) claseColor = "bg-gray-900";
    else if (c.includes('blanco') || c.includes('estelar') || c.includes('\u26aa') || c.includes('\u2b1c')) { claseColor = "bg-white"; conBorde = true; }
    else if (c.includes('plata') || c.includes('silver') || c.includes('titanio')) claseColor = "bg-gray-300";
    else if (c.includes('gris') || c.includes('grafito')) claseColor = "bg-gray-600";
    else if (c.includes('oro rosa') || c.includes('rosa')) claseColor = "bg-pink-300";
    else if (c.includes('oro') || c.includes('desierto')) claseColor = "bg-yellow-200"; 
    else if (c.includes('azul') || c.includes('\ud83d\udd35')) claseColor = "bg-blue-500";
    else if (c.includes('morado') || c.includes('violeta') || c.includes('purpura') || c.includes('\ud83d\udc9c') || c.includes('\ud83d\udfe3')) claseColor = "bg-purple-600";
    else if (c.includes('verde') || c.includes('\ud83d\udfe2')) claseColor = "bg-emerald-500";
    else if (c.includes('amarillo') || c.includes('\ud83d\udfe1')) claseColor = "bg-yellow-400";
    else if (c.includes('naranja') || c.includes('\ud83d\udfe0')) claseColor = "bg-orange-500"; 
    else if (c.includes('rojo') || c.includes('red') || c.includes('\ud83d\udd34') || c.includes('\u2764')) claseColor = "bg-red-600";
    else {
      // Si el color no coincide, quitamos cualquier emoji que rompa la estetica y mostramos solo el texto
      const textoLimpio = valorColor.replace(/[^\w\sñÑáéíóúÁÉÍÓÚ-]/gi, '').trim();
      if (!textoLimpio) return null;
      return <span className="ml-1 text-xs text-gray-600 font-medium uppercase"> {textoLimpio} </span>;
    }
    
    return <span className={"inline-block w-3.5 h-3.5 rounded-full ml-1.5 align-middle shadow-sm " + claseColor + (conBorde ? " border border-gray-300" : "")} />;
  };

  const celularesFiltrados = celularesAgrupados.filter(celu => {
    const termino = busqueda.toLowerCase();
    return celu.modelo.toLowerCase().includes(termino) || 
           celu.color.toLowerCase().includes(termino) ||
           celu.capacidad.toLowerCase().includes(termino);
  });

  if (cargando) {
    return <div className="p-10 text-center font-bold text-gray-600"> Cargando catalogo... </div>;
  }

  return (
    <div className="relative p-2 md:p-4 max-w-4xl mx-auto font-sans bg-white pb-6 min-h-screen flex flex-col">
      
      {/* Boton Flotante de WhatsApp */}
      <a 
        href={linkWspGeneral} 
        target="_blank" 
        rel="noreferrer" 
        className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50 bg-white p-3 rounded-full shadow-xl border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center"
        title="Consultar por WhatsApp"
      >
        <img src="/logo-whatsapp.png" alt="WhatsApp" className="w-8 h-8 md:w-10 md:h-10 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
      </a>

      {esAdmin && (
        <a href="/admin" className="absolute top-3 right-3 bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-md hover:bg-gray-800 transition">
          Volver al Panel
        </a>
      )}

      <div className="flex justify-center items-center mb-4 mt-6">
        <img src="/logo.png" alt="Montech Jujuy" className="h-28 md:h-36 object-contain drop-shadow-xl" onError={(e) => { e.target.style.display = 'none'; }} />
      </div>

      <div className="mb-6 relative">
        <input 
          type="text" 
          placeholder="Buscar por modelo" 
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none transition"
        />
      </div>
      
      <div className="shadow-sm border border-gray-300 rounded-lg flex-grow w-full">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#e4ecfa] border-b border-gray-300 text-gray-900 text-[10px] md:text-[11px] uppercase font-bold tracking-wider">
              <th className="p-2 md:p-3 text-center w-1/12"> Cant </th>
              <th className="p-2 md:p-3 border-r border-gray-300 text-left w-5/12"> Modelo / Color </th>
              <th className="p-2 md:p-3 border-r border-gray-300 text-center w-2/12"> Bateria </th>
              <th className="p-2 md:p-3 border-r border-gray-300 text-right w-4/12"> Precio Contado </th>
              <th className="p-2 md:p-3 text-left hidden md:table-cell w-auto"> Detalles </th>
            </tr>
          </thead>
          <tbody>
            {celularesFiltrados.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center p-6 text-gray-500">
                  No se encontraron equipos con esa busqueda.
                </td>
              </tr>
            )}

            {celularesFiltrados.map((celu, index) => {
              const precioPesos = celu.precio_usd * cotizacion;

              return (
                <tr key={index} className={"border-b border-gray-200 " + (index % 2 === 0 ? "bg-white" : "bg-gray-50") + " hover:bg-gray-100 transition"}>
                  <td className="p-2 md:p-3 text-center font-bold text-blue-600 bg-blue-50 border-r border-blue-100"> {celu.cantidad} </td>
                  <td className="p-2 md:p-3 border-r border-gray-200 font-bold whitespace-nowrap text-gray-800 text-[11px] md:text-[13px]">
                    {celu.modelo} <span className="font-medium text-gray-500 text-[10px] md:text-xs ml-1"> {celu.capacidad} </span> {renderizarCirculoColor(celu.color)}
                  </td>
                  <td className="p-2 md:p-3 border-r border-gray-200 text-center font-semibold text-gray-700 text-[11px] md:text-sm"> {celu.bateria}% </td>
                  <td className="p-2 md:p-3 border-r border-gray-200 text-right font-black text-gray-900 text-[12px] md:text-[14px] whitespace-nowrap">
                    $ {precioPesos.toLocaleString("es-AR")}
                  </td>
                  <td className="p-2 md:p-3 text-[11px] text-gray-600 font-medium uppercase leading-relaxed hidden md:table-cell"> {celu.detalles} </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="mt-3 text-right text-[11px] text-gray-400 font-semibold px-2 mb-8">
        Cotizacion de referencia USD: ${cotizacion.toLocaleString('es-AR')}
      </div>

      <div className="mt-auto pt-8 pb-4 flex flex-col items-center w-full relative">
        <a href="https://instagram.com/montech.jujuy" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-gray-700 hover:text-black transition mb-5 bg-gray-50 px-4 py-2 rounded-full border border-gray-200 shadow-sm">
          <img src="/logo-instagram.png" alt="Instagram" className="w-4 h-4 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          <span className="font-bold text-xs tracking-wide"> @montech.jujuy </span>
        </a>

        <div className="w-[80%] border-t border-gray-200 mb-4"> </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Desarrollado por
          </span>
          <div className="flex items-center gap-3">
            <a href="https://www.instagram.com/lambdasoluciones/" target="_blank" rel="noreferrer" className="font-bold text-[11px] uppercase tracking-wider text-blue-600 hover:text-blue-800 transition">
              LAMBDA SOLUCIONES
            </a>
            
            <a href="/admin" className="text-gray-400 hover:text-gray-800 transition p-1" title="Acceso Administrativo">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"> </path>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Catalogo;