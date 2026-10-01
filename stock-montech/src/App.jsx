import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import { Toaster } from 'react-hot-toast'
import Catalogo from './Catalogo'
import Login from './Login'

// El panel (y la libreria de graficos) se descarga solo al entrar a /admin,
// asi el catalogo publico carga mas rapido
const Admin = lazy(() => import('./Admin'))

const pantallaCargando = (
  <div className="min-h-screen flex items-center justify-center font-bold text-gray-500 bg-gray-50">Cargando...</div>
)

function App() {
  // undefined = todavia no se sabe si hay sesion; null = no hay sesion
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Busca si ya hay una sesión guardada al abrir la página
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Escucha los cambios (cuando inicia o cierra sesión)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  let pantallaAdmin = pantallaCargando
  if (session === null) pantallaAdmin = <Login onLoginExitoso={setSession} />
  else if (session) pantallaAdmin = <Suspense fallback={pantallaCargando}><Admin /></Suspense>

  return (
    <BrowserRouter>
      {/* El Toaster global para que las alertas funcionen en toda la app */}
      <Toaster position="top-center" toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff', borderRadius: '10px' } }} />
      <Routes>
        <Route path="/" element={<Catalogo />} />
        {/* Si hay sesión muestra Admin, si no, muestra Login */}
        <Route path="/admin" element={pantallaAdmin} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
