import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './supabase'
import { Toaster } from 'react-hot-toast'
import Catalogo from './Catalogo'
import Admin from './Admin'
import Login from './Login'

function App() {
  const [session, setSession] = useState(null)

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

  return (
    <BrowserRouter>
      {/* El Toaster global para que las alertas funcionen en toda la app */}
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff', borderRadius: '10px' } }} />
      <Routes>
        <Route path="/" element={<Catalogo />} />
        
        {/* Si hay sesión muestra Admin, si no, muestra Login */}
        <Route 
          path="/admin" 
          element={session ? <Admin /> : <Login onLoginExitoso={setSession} />} 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App