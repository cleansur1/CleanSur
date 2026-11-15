// Datos iniciales para StayClean / Limpieza Caviahue ERP
// Sistema inicializado en 0 (sin valores inventados) para carga real de facturas, proveedores, productos y stock.

export const SEED_CATEGORIES = [
  { id: 'cat-1', code: 'DESC', name: 'Descartables Gastronómicos', icon: 'utensils', default_margin: 40, description: 'Bandejas, cubiertos, vasos, conos, cuencos y kraft' },
  { id: 'cat-2', code: 'QUIM', name: 'Productos Químicos y Limpieza', icon: 'flask-conical', default_margin: 45, description: 'Lavandina, detergentes, desengrasantes, ceras y desinfectantes' },
  { id: 'cat-3', code: 'PAPEL', name: 'Papel e Higiene Institucional', icon: 'scroll', default_margin: 38, description: 'Papel higiénico, toallas intercaladas, bobinas secamanos' },
  { id: 'cat-4', code: 'BOLSAS', name: 'Bolsas y Empaque', icon: 'shopping-bag', default_margin: 42, description: 'Bolsas arranque, camiseta, consorcio, residuos y folex' },
  { id: 'cat-5', code: 'ENVASES', name: 'Cajas, Envases y Film', icon: 'package', default_margin: 40, description: 'Cajas pizza, empanadas, film PVC, aluminio y térmicos' },
  { id: 'cat-6', code: 'AMENITIES', name: 'Amenities para Hotelería', icon: 'hotel', default_margin: 50, description: 'Shampoo, acondicionador, jabón hotelero, sobres y bidones 5L' },
  { id: 'cat-7', code: 'ACCESORIOS', name: 'Accesorios y Bazar Limpieza', icon: 'sparkles', default_margin: 45, description: 'Guantes de nitrilo, trapos de piso, esponjas, paños y atriles' },
  { id: 'cat-8', code: 'ROPA', name: 'Cuidado de Ropa y Lavandería', icon: 'shirt', default_margin: 42, description: 'Jabón líquido ropa, suavizantes, blanqueadores y perfuminas' }
];

export const SEED_PRICE_LISTS = [
  { id: 'list-minorista', name: 'Minorista / Domiciliario', code: 'MIN', margin_factor: 1.0, is_default: true, description: 'Precios estándar de mostrador y ventas a particulares' },
  { id: 'list-mayorista', name: 'Mayorista / Comercios', code: 'MAY', margin_factor: 0.85, is_default: false, description: 'Descuento por bulto cerrado o compras de reventa' },
  { id: 'list-hoteleria', name: 'Hotelería y Cabañas', code: 'HOT', margin_factor: 0.88, is_default: false, description: 'Convenio para alojamientos turísticos, aparts y cabañas de Caviahue' },
  { id: 'list-gastronomia', name: 'Gastronomía y Bares', code: 'GAS', margin_factor: 0.87, is_default: false, description: 'Precios para restaurantes, cervecerías, pizzerías y rotiserías' },
  { id: 'list-especial', name: 'Clientes Especiales / Institucional', code: 'ESP', margin_factor: 0.82, is_default: false, description: 'Grandes cuentas y administradores de consorcios' }
];

export const SEED_SUPPLIERS = [];

export const SEED_CUSTOMERS = [];

export const SEED_PRODUCTS = [];

export const DEFAULT_PERMISSIONS = {
  ADMINISTRADOR: {
    dashboard: true,
    ventas: true,
    pedidos: true,
    caja: true,
    compras: true,
    ocr_facturas: true,
    gastos: true,
    productos: true,
    costos_margenes: true,
    stock: true,
    reposicion: true,
    clientes: true,
    cuentas_corrientes: true,
    precios: true,
    proveedores: true,
    comparador: true,
    ordenes_compra: true,
    reportes: true,
    estacionalidad: true,
    tienda: true,
    arca: true,
    usuarios: true,
    auditoria: true,
    configuracion: true
  },
  VENDEDOR: {
    dashboard: true,
    ventas: true,
    pedidos: true,
    caja: true,
    compras: true,
    ocr_facturas: true,
    gastos: true,
    productos: true,
    costos_margenes: true,
    stock: true,
    reposicion: true,
    clientes: true,
    cuentas_corrientes: true,
    precios: true,
    proveedores: true,
    comparador: true,
    ordenes_compra: true,
    reportes: true,
    estacionalidad: true,
    tienda: true,
    arca: true,
    usuarios: false,
    auditoria: false,
    configuracion: false
  },
  DEPÓSITO: {
    dashboard: true,
    ventas: true,
    pedidos: true,
    caja: true,
    compras: true,
    ocr_facturas: true,
    gastos: false,
    productos: true,
    costos_margenes: true,
    stock: true,
    reposicion: true,
    clientes: true,
    cuentas_corrientes: false,
    precios: true,
    proveedores: true,
    comparador: true,
    ordenes_compra: true,
    reportes: false,
    estacionalidad: true,
    tienda: true,
    arca: false,
    usuarios: false,
    auditoria: false,
    configuracion: false
  }
};

export const SEED_USERS = [
  {
    id: 'usr-admin',
    username: 'admin',
    name: 'Administrador StayClean',
    role: 'ADMINISTRADOR',
    pin: '',
    active: true,
    email: 'admin@stayclean.com.ar',
    permissions: { ...DEFAULT_PERMISSIONS.ADMINISTRADOR }
  },
  {
    id: 'usr-vendedor',
    username: 'ventas',
    name: 'Ventas StayClean',
    role: 'VENDEDOR',
    pin: '',
    active: true,
    email: 'ventas@stayclean.com.ar',
    permissions: { ...DEFAULT_PERMISSIONS.VENDEDOR }
  },
  {
    id: 'usr-deposito',
    username: 'deposito',
    name: 'Depósito StayClean',
    role: 'DEPÓSITO',
    pin: '',
    active: true,
    email: 'deposito@stayclean.com.ar',
    permissions: { ...DEFAULT_PERMISSIONS.DEPÓSITO }
  }
];

export const SEED_EXPENSES = [];

export const SEED_SEASONS = [
  {
    id: 'seas-invierno',
    name: 'Temporada de Invierno (Nieve y Termas)',
    period: 'Junio a Septiembre',
    demand_multiplier: 2.2,
    description: 'Temporada alta pico en Caviahue. Turismo masivo de esquí y termas.'
  },
  {
    id: 'seas-verano',
    name: 'Temporada de Verano (Montaña y Copahue)',
    period: 'Diciembre a Marzo',
    demand_multiplier: 1.5,
    description: 'Temporada termal de Copahue y turismo de naturaleza.'
  },
  {
    id: 'seas-baja',
    name: 'Temporada Baja / Media',
    period: 'Abril-Mayo y Octubre-Noviembre',
    demand_multiplier: 0.8,
    description: 'Meses de transición y mantenimiento.'
  }
];

export const SEED_PURCHASES = [];

export const SEED_SALES = [];

export const SEED_CUSTOMER_ACCOUNT_MOVEMENTS = [];

export const SEED_AUDIT_LOG = [];
