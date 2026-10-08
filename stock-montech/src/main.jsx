import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// En iPhone y iPad el navegador agranda la pagina al tocar un campo cuando la letra se ve a
// menos de 16px (pasa, por ejemplo, con el texto del navegador achicado) y despues no vuelve
// solo. Con maximum-scale=1 no hace ese zoom. Se aplica solo ahi: en esos equipos se puede
// seguir ampliando con los dedos, y en Android ese limite bloquearia el zoom manual.
const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const viewport = document.querySelector('meta[name="viewport"]')
if (esIOS && viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
