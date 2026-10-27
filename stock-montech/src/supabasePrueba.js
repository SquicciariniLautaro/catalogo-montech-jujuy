// Base de mentira para probar el panel sin tocar los datos reales: npm run dev:prueba
// Imita lo que usa el panel del cliente de Supabase (consultas encadenadas, sesion) sobre tablas
// en memoria. Se pierde al recargar la pagina. Los datos de ejemplo repiten los casos de los
// revendedores: plata entregada antes y cuenta que se cierra despues.

const COT = 1500;
const usd = (ars) => Math.round((ars / COT) * 10000) / 10000;
const dia = (d, h = 12) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const masSegundos = (iso, s) => new Date(new Date(iso).getTime() + s * 1000).toISOString();

const celular = (id, modelo, estado, extra = {}) => ({
  id, modelo, capacidad: '128GB', color: 'Negro', bateria: 90, detalles: '', costo_usd: usd(400000), precio_usd: usd(500000),
  estado, fecha_venta: null, cotizacion_venta: null, cotizacion_costo: null, permuta_usd: null, cuenta_venta: null,
  revendedor: null, precio_revendedor: null, precio_revendedor_ars: null, fecha_revendedor: null, promediado: false, ...extra,
});
const pago = (id, revendedor, ars, fecha, aplicado = false) => ({ id, revendedor, monto_ars: ars, cotizacion: COT, monto_usd: usd(ars), fecha, aplicado });

const tablas = {
  configuracion: [{ id: 1, cotizacion_dolar: COT, cotizacion_costo: null }],
  celulares: [
    celular(1, '13 PRO', 'disponible'),
    celular(2, '13 PRO', 'disponible'),
    celular(3, '14', 'disponible', { costo_usd: usd(550000), precio_usd: usd(700000) }),
    // Venta directa de septiembre
    celular(4, '12', 'vendido', { fecha_venta: dia(-20), cotizacion_venta: COT, precio_usd: usd(450000) }),
    // Federico: le entrego 300 mil el 5/10 y hoy cerro la cuenta con 460 mil (version anterior:
    // los pagos quedaron aplicados y el equipo vendido completo)
    celular(5, '15', 'vendido', {
      fecha_venta: masSegundos(dia(21, 22), 1), cotizacion_venta: COT, precio_usd: usd(760000), costo_usd: usd(600000),
      cuenta_venta: 'revendedor', revendedor: 'Federico', precio_revendedor: usd(760000), fecha_revendedor: dia(3),
    }),
    // Juan: tiene dos equipos y entrego 300 mil
    celular(6, '13 PRO', 'revendedor', { revendedor: 'Juan', precio_revendedor: usd(500000), fecha_revendedor: dia(10) }),
    celular(7, '14', 'revendedor', { revendedor: 'Juan', precio_revendedor: usd(700000), fecha_revendedor: dia(10), costo_usd: usd(550000) }),
    // Martin: debia 500 mil, entrego 600 mil; la version anterior anoto los 100 mil que sobraron como pago nuevo
    celular(8, '13 PRO', 'vendido', {
      fecha_venta: masSegundos(dia(16), 1), cotizacion_venta: COT, cuenta_venta: 'revendedor', revendedor: 'Martin',
      precio_revendedor: usd(500000), fecha_revendedor: dia(12),
    }),
    // Pedro: se llevo un equipo de 500 mil y se cargo por error un pago de 1.500.000 que cerro la cuenta
    celular(10, '12', 'vendido', {
      fecha_venta: masSegundos(dia(8), 1), cotizacion_venta: COT, cuenta_venta: 'revendedor', revendedor: 'Pedro',
      precio_revendedor: usd(500000), fecha_revendedor: dia(6),
    }),
    // Venta de antes de que se guardara la cotizacion del dia
    celular(11, '11', 'vendido', { fecha_venta: dia(1), precio_usd: usd(300000) }),
    // Seña de Lucia: dejo 200 mil
    celular(9, '14', 'senado', { revendedor: 'Lucia', precio_revendedor: usd(700000), fecha_revendedor: dia(18), costo_usd: usd(550000) }),
  ],
  accesorios: [
    { id: 1, tipo: 'Cargador', modelo: '20W', color: 'Blanco', detalles: '', costo_usd: usd(5000), precio_usd: usd(12000), estado: 'disponible', promediado: false },
    { id: 2, tipo: 'Cargador', modelo: '20W', color: 'Blanco', detalles: '', costo_usd: usd(5000), precio_usd: usd(12000), estado: 'disponible', promediado: false },
  ],
  pagos_revendedor: [
    pago(1, 'Federico', 300000, dia(5), true),
    pago(2, 'Federico', 460000, dia(21, 22), true),
    pago(3, 'Juan', 300000, dia(12)),
    pago(4, 'Martin', 600000, dia(16), true),
    pago(5, 'Martin', 100000, masSegundos(dia(16), 2)), // lo que sobro, anotado como pago nuevo
    pago(6, 'Pedro', 1500000, dia(8), true), // cargado de mas
  ],
  pagos_sena: [pago(1, 'Lucia', 200000, dia(18))],
  escalas_precio: [],
  revendedores_lista: [
    { id: 1, nombre: 'Federico', clave: 'FEDERICO', celular: null },
    { id: 2, nombre: 'Juan', clave: 'JUAN', celular: null },
    { id: 3, nombre: 'Martin', clave: 'MARTIN', celular: null },
    { id: 4, nombre: 'Pedro', clave: 'PEDRO', celular: null },
  ],
  catalogo_config: [],
};
const proximoId = {};
Object.entries(tablas).forEach(([t, filas]) => (proximoId[t] = filas.reduce((m, f) => Math.max(m, f.id || 0), 0) + 1));

const copiar = (v) => JSON.parse(JSON.stringify(v));

class Consulta {
  constructor(tabla) {
    this.tabla = tabla;
    this.filtros = [];
    this.orden = [];
    this.accion = 'select';
    this.devolver = false;
  }
  select() {
    if (this.accion !== 'select') this.devolver = true;
    return this;
  }
  eq(campo, valor) {
    this.filtros.push((f) => f[campo] === valor);
    return this;
  }
  in(campo, valores) {
    this.filtros.push((f) => valores.includes(f[campo]));
    return this;
  }
  not(campo, operador, lista) {
    const valores = String(lista).replace(/[()]/g, '').split(',').map(Number);
    this.filtros.push((f) => !valores.includes(f[campo]));
    return this;
  }
  order(campo, { ascending = true } = {}) {
    this.orden.push([campo, ascending ? 1 : -1]);
    return this;
  }
  range(desde, hasta) {
    this.rango = [desde, hasta];
    return this;
  }
  single() {
    this.uno = true;
    return this;
  }
  update(cambios) {
    this.accion = 'update';
    this.cambios = cambios;
    return this;
  }
  insert(filas) {
    this.accion = 'insert';
    this.nuevas = Array.isArray(filas) ? filas : [filas];
    return this;
  }
  upsert(filas, { onConflict, ignoreDuplicates } = {}) {
    this.accion = 'upsert';
    this.nuevas = Array.isArray(filas) ? filas : [filas];
    this.conflicto = String(onConflict || 'id').split(',');
    this.ignorar = ignoreDuplicates;
    return this;
  }
  delete() {
    this.accion = 'delete';
    return this;
  }
  ejecutar() {
    const filas = (tablas[this.tabla] = tablas[this.tabla] || []);
    const pasa = (f) => this.filtros.every((fn) => fn(f));
    const ahora = () => new Date().toISOString();
    if (this.accion === 'insert' || this.accion === 'upsert') {
      const resultado = [];
      this.nuevas.forEach((n) => {
        const existente =
          this.accion === 'upsert' && filas.find((f) => this.conflicto.every((c) => String(f[c]) === String(n[c])));
        if (existente) {
          if (!this.ignorar) Object.assign(existente, n);
          return;
        }
        const fila = { id: proximoId[this.tabla]++, aplicado: false, fecha: ahora(), ...n };
        filas.push(fila);
        resultado.push(fila);
      });
      return { data: copiar(resultado), error: null };
    }
    if (this.accion === 'update') {
      const cambiadas = filas.filter(pasa);
      cambiadas.forEach((f) => Object.assign(f, this.cambios));
      return { data: this.devolver ? copiar(cambiadas) : null, error: null };
    }
    if (this.accion === 'delete') {
      tablas[this.tabla] = filas.filter((f) => !pasa(f));
      return { data: null, error: null };
    }
    let datos = filas.filter(pasa);
    datos = [...datos].sort((a, b) => {
      for (const [campo, sentido] of this.orden) {
        if (a[campo] < b[campo]) return -sentido;
        if (a[campo] > b[campo]) return sentido;
      }
      return 0;
    });
    if (this.rango) datos = datos.slice(this.rango[0], this.rango[1] + 1);
    if (this.uno) return { data: datos[0] ? copiar(datos[0]) : null, error: datos[0] ? null : { message: 'sin filas' } };
    return { data: copiar(datos), error: null };
  }
  then(resolver, rechazar) {
    return Promise.resolve().then(() => this.ejecutar()).then(resolver, rechazar);
  }
}

const sesion = { user: { email: 'prueba@local' } };
export const supabase = {
  from: (tabla) => new Consulta(tabla),
  auth: {
    getSession: async () => ({ data: { session: sesion } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session: sesion }, error: null }),
    signOut: async () => ({ error: null }),
  },
};
