import { useState } from 'react'
import { supabase } from './supabase'
import toast from 'react-hot-toast'

function Login({ onLoginExitoso }) {
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
const [cargando, setCargando] = useState(false)

async function handleLogin(e) {
    e.preventDefault()
    setCargando(true)
    
    const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    })

    if (error) {
    toast.error("Correo o contraseña incorrectos")
    } else {
    toast.success("¡Bienvenido!")
    onLoginExitoso(data.session)
    }
    setCargando(false)
}

return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-center text-gray-900 mb-2">Acceso Montech</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">Ingresa tus credenciales para administrar el catálogo</p>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Correo Electrónico</label>
            <input 
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:border-blue-500" 
            />
        </div>
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Contraseña</label>
            <input 
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:border-blue-500" 
            />
        </div>
        <button 
            type="submit" disabled={cargando}
            className="mt-2 w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition disabled:bg-blue-400"
        >
            {cargando ? 'Verificando...' : 'Iniciar Sesión'}
        </button>
        </form>
    </div>
    </div>
)
}

export default Login