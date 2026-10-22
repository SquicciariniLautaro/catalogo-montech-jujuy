import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { transform } from 'lightningcss'
import { fileURLToPath } from 'node:url'

// Tailwind v4 define su paleta con oklch(), un formato de color que los navegadores anteriores
// a Chrome 111 no entienden (por ejemplo Chrome 109, el ultimo que corre en Windows 7 y 8.1).
// Ahi los botones de color quedan sin fondo y su texto blanco queda blanco sobre blanco: se
// vuelven invisibles. Al terminar la compilacion se reescribe el CSS para navegadores mas
// viejos: oklch pasa a hexadecimal, los rangos de media query a min-width, etc. En navegadores
// modernos se ve igual.
function cssParaNavegadoresViejos() {
  return {
    name: 'css-para-navegadores-viejos',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [nombre, archivo] of Object.entries(bundle)) {
        if (archivo.type !== 'asset' || !nombre.endsWith('.css')) continue
        const resultado = transform({
          filename: nombre,
          code: typeof archivo.source === 'string' ? new TextEncoder().encode(archivo.source) : archivo.source,
          minify: true,
          targets: { chrome: 100 << 16, edge: 100 << 16, firefox: 100 << 16, safari: 15 << 16 },
        })
        archivo.source = resultado.code
      }
    },
  }
}

// npm run dev:prueba: el panel trabaja sobre una base de mentira en memoria (src/supabasePrueba.js),
// sin iniciar sesion y sin tocar los datos reales
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
    cssParaNavegadoresViejos(),
  ],
  resolve: mode === 'prueba'
    ? { alias: [{ find: /^\.\/supabase$/, replacement: fileURLToPath(new URL('./src/supabasePrueba.js', import.meta.url)) }] }
    : {},
}))
