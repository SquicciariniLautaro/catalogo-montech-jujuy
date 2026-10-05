const LAMBDA_INSTAGRAM = 'https://www.instagram.com/lambdasoluciones';

// Firma de Lambda Soluciones Digitales: franja negra con la λ amarilla con brillo y una
// grilla de puntos. Va al pie del catalogo y del panel.
// - ancho: ancho maximo del contenido, para alinearlo con la pagina que la usa
// - espacioInferior: deja lugar abajo cuando hay un boton flotante encima
function FirmaLambda({ className = '', ancho = 'max-w-4xl', espacioInferior = false }) {
  return (
    <a
      href={LAMBDA_INSTAGRAM}
      target="_blank"
      rel="noopener noreferrer"
      className={'group relative block overflow-hidden bg-black ' + className}
      aria-label="Sitio realizado por Lambda Soluciones Digitales. Ver su Instagram"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgb(255 214 10 / 0.35) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
        aria-hidden="true"
      />
      <div
        className={
          'relative mx-auto flex flex-col items-center gap-3 px-4 pt-6 text-center sm:flex-row sm:justify-between sm:text-left ' +
          ancho +
          (espacioInferior ? ' pb-20' : ' pb-6')
        }
      >
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-lambda/25 bg-[radial-gradient(circle,#2a2405_0%,#000_70%)] text-2xl font-bold text-lambda transition group-hover:scale-110"
            style={{ textShadow: '0 0 8px rgb(255 214 10 / 0.9), 0 0 22px rgb(255 214 10 / 0.6)' }}
            aria-hidden="true"
          >
            λ
          </span>
          <span className="leading-tight">
            <span className="block text-[11px] uppercase tracking-[0.25em] text-white/50">Diseño y desarrollo</span>
            <span className="block text-sm font-semibold text-white">
              Lambda <span className="text-lambda">Soluciones Digitales</span>
            </span>
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-lambda/40 px-4 py-1.5 text-xs font-medium text-lambda transition group-hover:border-lambda group-hover:bg-lambda group-hover:text-black">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          @lambdasoluciones
        </span>
      </div>
    </a>
  );
}

export default FirmaLambda;
