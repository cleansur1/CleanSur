// ============================================================================
// StayClean ERP - Módulo de Respaldo Integral V2 & Verificador de Integridad
// Preparación para Migración a Base de Datos Centralizada (Supabase / PostgreSQL)
// ============================================================================
// Diseñado para exportar el 100% de los datos sin omisiones y verificar
// integridad de conteos, checksums, claves foráneas y conciliaciones contables.
// ============================================================================

export const BACKUP_SCHEMA_VERSION = '2.0-SUPABASE-READY';

/**
 * Genera un respaldo integral V2 con todas las entidades, metadatos y sumas de control.
 * @param {object} db - Instancia de la clase Database
 * @param {Storage} [customStorage] - Objeto localStorage opcional (para entornos de prueba)
 * @returns {object} Objeto de respaldo completo
 */
export function exportFullBackupV2(db, customStorage = null) {
  const storage = customStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const prefix = 'caviahue_erp_';

  // 1. Obtener todas las tablas conocidas del ERP
  const categories = db.getTable('categories') || [];
  const price_lists = db.getTable('price_lists') || [];
  const suppliers = db.getTable('suppliers') || [];
  const customers = db.getTable('customers') || [];
  const products = db.getTable('products') || [];
  const users = db.getTable('users') || [];
  const expenses = db.getTable('expenses') || [];
  const seasons = db.getTable('seasons') || [];
  const purchases = db.getTable('purchases') || [];
  const sales = db.getTable('sales') || [];
  const customer_account_movements = db.getTable('customer_account_movements') || [];
  const inventory_movements = db.getTable('inventory_movements') || [];
  const cost_history = db.getTable('cost_history') || [];
  const orders = db.getTable('orders') || [];
  const purchase_orders = db.getTable('purchase_orders') || [];
  const cash_registers = db.getTable('cash_registers') || [];
  const arca_config = db.getTable('arca_config') || {};
  const arca_invoices = db.getTable('arca_invoices') || [];
  const audit_log = db.getTable('audit_log') || [];

  // 2. Extraer claves de la tienda online pública (si existen)
  let tienda_cart = [];
  let tienda_customer_profile = null;
  if (storage) {
    try {
      const rawCart = storage.getItem('caviahue_tienda_cart');
      if (rawCart) tienda_cart = JSON.parse(rawCart);
    } catch {}
    try {
      const rawProf = storage.getItem('caviahue_customer_profile');
      if (rawProf) tienda_customer_profile = JSON.parse(rawProf);
    } catch {}
  }

  // 3. Detectar claves adicionales con prefijo caviahue_erp_*
  const extra_tables = {};
  const knownKeys = new Set([
    'categories', 'price_lists', 'suppliers', 'customers', 'products',
    'users', 'expenses', 'seasons', 'purchases', 'sales',
    'customer_account_movements', 'inventory_movements', 'cost_history',
    'orders', 'purchase_orders', 'cash_registers', 'arca_config',
    'arca_invoices', 'audit_log', 'initialized', 'seed_version', 'current_user'
  ]);

  if (storage && typeof storage.length === 'number') {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) {
        const rawName = key.substring(prefix.length);
        if (!knownKeys.has(rawName)) {
          try {
            extra_tables[rawName] = JSON.parse(storage.getItem(key));
          } catch {
            extra_tables[rawName] = storage.getItem(key);
          }
        }
      }
    }
  }

  // 4. Metadatos de sistema y sesión
  const currentUser = db.getCurrentUser ? db.getCurrentUser() : null;
  const isInitialized = storage ? storage.getItem(`${prefix}initialized`) === 'true' : true;
  const seedVersion = storage ? (storage.getItem(`${prefix}seed_version`) || '6.0-STAYCLEAN-ZERO') : '6.0-STAYCLEAN-ZERO';

  // 5. Conteos precisos por entidad
  const counts = {
    categories: categories.length,
    price_lists: price_lists.length,
    suppliers: suppliers.length,
    customers: customers.length,
    products: products.length,
    users: users.length,
    expenses: expenses.length,
    seasons: seasons.length,
    purchases: purchases.length,
    sales: sales.length,
    customer_account_movements: customer_account_movements.length,
    inventory_movements: inventory_movements.length,
    cost_history: cost_history.length,
    orders: orders.length,
    purchase_orders: purchase_orders.length,
    cash_registers: cash_registers.length,
    arca_invoices: arca_invoices.length,
    audit_log: audit_log.length,
    tienda_cart_items: Array.isArray(tienda_cart) ? tienda_cart.length : 0,
    has_tienda_profile: !!tienda_customer_profile,
    extra_tables_count: Object.keys(extra_tables).length
  };

  // 6. Sumas de Control (Checksums) matemáticas
  const checksums = {
    total_products_stock: Number((products.reduce((sum, p) => sum + (Number(p.current_stock) || 0), 0)).toFixed(2)),
    total_stock_value_caviahue: Number((products.reduce((sum, p) => sum + ((Number(p.current_stock) || 0) * (Number(p.caviahue_cost) || 0)), 0)).toFixed(2)),
    total_sales_amount: Number((sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0)).toFixed(2)),
    total_purchases_amount: Number((purchases.reduce((sum, p) => sum + (Number(p.total_final) || 0), 0)).toFixed(2)),
    total_expenses_amount: Number((expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)).toFixed(2)),
    total_customer_balance: Number((customers.reduce((sum, c) => sum + (Number(c.current_balance) || 0), 0)).toFixed(2)),
    total_account_movements_amount: Number((customer_account_movements.reduce((sum, m) => sum + (Number(m.amount) || 0), 0)).toFixed(2)),
    total_arca_invoices_amount: Number((arca_invoices.reduce((sum, inv) => sum + (Number(inv.importe_total) || 0), 0)).toFixed(2)),
    total_orders_amount: Number((orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)).toFixed(2)),
    total_cash_counted: Number((cash_registers.reduce((sum, r) => sum + (Number(r.counted_cash) || 0), 0)).toFixed(2))
  };

  // 7. Envoltorio estructurado del respaldo
  return {
    backup_format: 'STAYCLEAN_ERP_FULL_BACKUP',
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    appName: 'StayClean ERP - Distribuidora Limpieza & Descartables',
    location: 'Caviahue, Neuquén, Argentina',
    currency: 'ARS',
    exported_by: {
      id: currentUser?.id || 'system',
      name: currentUser?.name || 'Administrador',
      role: currentUser?.role || 'ADMINISTRADOR'
    },
    counts,
    checksums,
    data: {
      categories,
      price_lists,
      suppliers,
      customers,
      products,
      users,
      expenses,
      seasons,
      purchases,
      sales,
      customer_account_movements,
      inventory_movements,
      cost_history,
      orders,
      purchase_orders,
      cash_registers,
      arca_config,
      arca_invoices,
      audit_log,
      extra_tables
    },
    tienda_state: {
      cart: tienda_cart,
      customer_profile: tienda_customer_profile
    },
    system_metadata: {
      initialized: isInitialized,
      seed_version: seedVersion,
      current_user: currentUser
    },
    notice: 'DOCUMENTO CONFIDENCIAL - Contiene información comercial, facturas fiscales y cuentas corrientes de StayClean Caviahue.'
  };
}

/**
 * Validador independiente de respaldos V2.
 * Comprueba formato, integridad de conteos, sumas de control, claves foráneas
 * y emite advertencias sobre posibles desvíos contables o de stock SIN alterar datos.
 * 
 * @param {string|object} backupInput - Cadena JSON o objeto ya parseado
 * @returns {object} Informe detallado de verificación
 */
export function verifyBackupV2(backupInput) {
  const result = {
    valid: true,
    schema_version: null,
    exported_at: null,
    appName: null,
    summary: {
      total_entities: 0,
      total_records: 0,
      checks_passed: 0,
      checks_warned: 0,
      checks_failed: 0
    },
    checks: [],
    warnings: [],
    errors: []
  };

  function addCheck(category, name, status, message, details = null) {
    if (status === 'PASS') result.summary.checks_passed++;
    if (status === 'WARN') {
      result.summary.checks_warned++;
      result.warnings.push(`[${category}] ${name}: ${message}`);
    }
    if (status === 'FAIL') {
      result.summary.checks_failed++;
      result.valid = false;
      result.errors.push(`[${category}] ${name}: ${message}`);
    }
    result.checks.push({ category, name, status, message, details });
  }

  // 1. Verificación sintáctica y estructura raíz
  let backup;
  try {
    backup = typeof backupInput === 'string' ? JSON.parse(backupInput) : backupInput;
  } catch (err) {
    addCheck('FORMATO', 'Parseo de JSON', 'FAIL', `El archivo no es un JSON válido: ${err.message}`);
    return result;
  }

  if (!backup || typeof backup !== 'object') {
    addCheck('FORMATO', 'Estructura raíz', 'FAIL', 'El contenido de respaldo no es un objeto válido');
    return result;
  }

  result.schema_version = backup.schema_version || '1.0-LEGACY';
  result.exported_at = backup.exported_at || 'Desconocida';
  result.appName = backup.appName || 'Limpieza Caviahue';

  const isV2 = backup.schema_version === BACKUP_SCHEMA_VERSION;
  addCheck(
    'FORMATO',
    'Versión de esquema',
    isV2 ? 'PASS' : 'WARN',
    isV2 ? `Esquema verificado: ${backup.schema_version}` : `Esquema legacy detectado (${result.schema_version}). Se recomienda migrar a V2.`
  );

  const data = backup.data || {};
  if (!data || typeof data !== 'object') {
    addCheck('FORMATO', 'Sección de datos principal', 'FAIL', 'Falta la sección "data" en el archivo de respaldo');
    return result;
  }

  // 2. Verificación de conteos de registros
  const expectedCounts = backup.counts || {};
  const actualCounts = {};
  let totalRecords = 0;
  let countMismatch = false;

  const standardEntities = [
    'categories', 'price_lists', 'suppliers', 'customers', 'products',
    'users', 'expenses', 'seasons', 'purchases', 'sales',
    'customer_account_movements', 'inventory_movements', 'cost_history',
    'orders', 'purchase_orders', 'cash_registers', 'arca_invoices', 'audit_log'
  ];

  result.summary.total_entities = standardEntities.length;

  standardEntities.forEach(ent => {
    const list = Array.isArray(data[ent]) ? data[ent] : [];
    actualCounts[ent] = list.length;
    totalRecords += list.length;

    if (expectedCounts[ent] !== undefined && expectedCounts[ent] !== list.length) {
      countMismatch = true;
      addCheck(
        'CONTEOS',
        `Conteo de ${ent}`,
        'FAIL',
        `Discrepancia en ${ent}: declarados ${expectedCounts[ent]}, reales ${list.length}`
      );
    }
  });

  result.summary.total_records = totalRecords;

  if (!countMismatch) {
    addCheck('CONTEOS', 'Integridad de conteos por entidad', 'PASS', `Todos los conteos coinciden con los registros reales (${totalRecords} registros evaluados).`, actualCounts);
  }

  // 3. Verificación de Sumas de Control (Checksums)
  const expectedSums = backup.checksums || {};
  if (isV2 && backup.checksums) {
    const products = Array.isArray(data.products) ? data.products : [];
    const sales = Array.isArray(data.sales) ? data.sales : [];
    const purchases = Array.isArray(data.purchases) ? data.purchases : [];
    const expenses = Array.isArray(data.expenses) ? data.expenses : [];
    const customers = Array.isArray(data.customers) ? data.customers : [];
    const camMovs = Array.isArray(data.customer_account_movements) ? data.customer_account_movements : [];
    const arcaInvoices = Array.isArray(data.arca_invoices) ? data.arca_invoices : [];

    const calcProductsStock = Number((products.reduce((acc, p) => acc + (Number(p.current_stock) || 0), 0)).toFixed(2));
    const calcSalesTotal = Number((sales.reduce((acc, s) => acc + (Number(s.total) || 0), 0)).toFixed(2));
    const calcPurchasesTotal = Number((purchases.reduce((acc, p) => acc + (Number(p.total_final) || 0), 0)).toFixed(2));
    const calcExpensesTotal = Number((expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0)).toFixed(2));
    const calcCustomerBalance = Number((customers.reduce((acc, c) => acc + (Number(c.current_balance) || 0), 0)).toFixed(2));
    const calcCamAmount = Number((camMovs.reduce((acc, m) => acc + (Number(m.amount) || 0), 0)).toFixed(2));
    const calcArcaTotal = Number((arcaInvoices.reduce((acc, inv) => acc + (Number(inv.importe_total) || 0), 0)).toFixed(2));

    const verifyCheck = (label, expected, calculated) => {
      const diff = Math.abs((expected || 0) - calculated);
      if (diff > 0.01) {
        addCheck('CHECKSUM', label, 'FAIL', `Suma de control alterada: declarada ${expected}, calculada ${calculated} (dif: ${diff.toFixed(2)})`);
      } else {
        addCheck('CHECKSUM', label, 'PASS', `Suma exacta: ${calculated}`);
      }
    };

    verifyCheck('Total Stock Físico (unidades)', expectedSums.total_products_stock, calcProductsStock);
    verifyCheck('Total Ventas ($)', expectedSums.total_sales_amount, calcSalesTotal);
    verifyCheck('Total Compras ($)', expectedSums.total_purchases_amount, calcPurchasesTotal);
    verifyCheck('Total Gastos ($)', expectedSums.total_expenses_amount, calcExpensesTotal);
    verifyCheck('Total Cuentas Corrientes ($)', expectedSums.total_customer_balance, calcCustomerBalance);
    verifyCheck('Total Movimientos Cta Cte ($)', expectedSums.total_account_movements_amount, calcCamAmount);
    verifyCheck('Total Facturas ARCA ($)', expectedSums.total_arca_invoices_amount, calcArcaTotal);
  } else {
    addCheck('CHECKSUM', 'Sumas de control', 'WARN', 'El respaldo no incluye la sección "checksums" de V2.');
  }

  // 4. Verificación de Integridad Referencial (Foreign Keys)
  const categoryIds = new Set((data.categories || []).map(c => c.id));
  const supplierIds = new Set((data.suppliers || []).map(s => s.id));
  const customerIds = new Set((data.customers || []).map(c => c.id));
  const productIds = new Set((data.products || []).map(p => p.id));
  const userIds = new Set((data.users || []).map(u => u.id));
  const saleIds = new Set((data.sales || []).map(s => s.id));

  let orphanRefWarnings = [];

  // Productos con categoría huérfana
  (data.products || []).forEach(p => {
    if (p.category_id && !categoryIds.has(p.category_id)) {
      orphanRefWarnings.push(`Producto [${p.name}] referencia categoría inexistente [${p.category_id}]`);
    }
    if (p.preferred_supplier_id && !supplierIds.has(p.preferred_supplier_id)) {
      orphanRefWarnings.push(`Producto [${p.name}] referencia proveedor preferido inexistente [${p.preferred_supplier_id}]`);
    }
  });

  // Compras con proveedor huérfano o producto huérfano
  (data.purchases || []).forEach(pur => {
    if (pur.supplier_id && !supplierIds.has(pur.supplier_id)) {
      orphanRefWarnings.push(`Compra [${pur.purchase_number}] referencia proveedor inexistente [${pur.supplier_id}]`);
    }
    (pur.items || []).forEach(it => {
      if (it.product_id && !productIds.has(it.product_id)) {
        orphanRefWarnings.push(`Compra [${pur.purchase_number}] renglón [${it.product_name}] tiene product_id huérfano [${it.product_id}]`);
      }
    });
  });

  // Ventas con cliente o producto huérfano
  (data.sales || []).forEach(sale => {
    if (sale.customer_id && !customerIds.has(sale.customer_id)) {
      orphanRefWarnings.push(`Venta [${sale.sale_number}] referencia cliente inexistente [${sale.customer_id}]`);
    }
    if (sale.user_id && !userIds.has(sale.user_id)) {
      orphanRefWarnings.push(`Venta [${sale.sale_number}] referencia usuario inexistente [${sale.user_id}]`);
    }
    (sale.items || []).forEach(it => {
      if (it.product_id && !productIds.has(it.product_id)) {
        orphanRefWarnings.push(`Venta [${sale.sale_number}] renglón [${it.product_name}] tiene product_id huérfano [${it.product_id}]`);
      }
    });
  });

  // Movimientos de stock con producto huérfano
  (data.inventory_movements || []).forEach(mov => {
    if (mov.product_id && !productIds.has(mov.product_id)) {
      orphanRefWarnings.push(`Movimiento stock [${mov.id}] referencia producto inexistente [${mov.product_id}]`);
    }
  });

  // Comprobantes ARCA con venta huérfana
  (data.arca_invoices || []).forEach(inv => {
    if (inv.sale_id && !saleIds.has(inv.sale_id)) {
      orphanRefWarnings.push(`Factura ARCA [${inv.tipo_cbte} ${inv.nro_cbte}] referencia sale_id inexistente [${inv.sale_id}]`);
    }
  });

  if (orphanRefWarnings.length === 0) {
    addCheck('RELACIONES', 'Integridad de claves foráneas', 'PASS', 'Todas las referencias cruzadas son válidas (0 registros huérfanos).');
  } else {
    addCheck('RELACIONES', 'Integridad de claves foráneas', 'WARN', `Se encontraron ${orphanRefWarnings.length} referencias a entidades inexistentes.`, orphanRefWarnings.slice(0, 10));
  }

  // 5. Conciliación Contable y de Stock (ADVERTENCIAS SIN MODIFICAR DATOS)
  // Conciliación de Cuentas Corrientes: Saldo del cliente vs suma de movimientos
  const camByCustomer = {};
  (data.customer_account_movements || []).forEach(m => {
    if (m.customer_id) {
      camByCustomer[m.customer_id] = (camByCustomer[m.customer_id] || 0) + (Number(m.amount) || 0);
    }
  });

  let balanceWarnings = [];
  (data.customers || []).forEach(cust => {
    const recordedBalance = Number(cust.current_balance) || 0;
    const computedBalance = Number((camByCustomer[cust.id] || 0).toFixed(2));
    const diff = Math.abs(recordedBalance - computedBalance);
    if (diff > 0.05) {
      balanceWarnings.push(`Cliente "${cust.name}": saldo en ficha $${recordedBalance.toFixed(2)} vs acumulado en movimientos $${computedBalance.toFixed(2)} (dif: $${diff.toFixed(2)})`);
    }
  });

  if (balanceWarnings.length === 0) {
    addCheck('CONCILIACION', 'Conciliación de Cuentas Corrientes', 'PASS', 'Los saldos de todos los clientes coinciden con sus movimientos.');
  } else {
    addCheck('CONCILIACION', 'Conciliación de Cuentas Corrientes', 'WARN', `${balanceWarnings.length} cliente(s) con discrepancia entre saldo y movimientos.`, balanceWarnings);
  }

  // Conciliación de Stock: Stock actual vs balance neto de inventory_movements
  const movStockByProduct = {};
  (data.inventory_movements || []).forEach(m => {
    if (m.product_id) {
      movStockByProduct[m.product_id] = (movStockByProduct[m.product_id] || 0) + (Number(m.quantity_base) || 0);
    }
  });

  let stockWarnings = [];
  (data.products || []).forEach(prod => {
    const curStock = Number(prod.current_stock) || 0;
    const movStock = Number((movStockByProduct[prod.id] || 0).toFixed(2));
    // Solo alertar si hay movimientos registrados y no coinciden
    if (movStockByProduct[prod.id] !== undefined && Math.abs(curStock - movStock) > 0.01) {
      stockWarnings.push(`Producto "${prod.name}": stock actual ${curStock} u. vs balance de movimientos ${movStock} u.`);
    }
  });

  if (stockWarnings.length === 0) {
    addCheck('CONCILIACION', 'Conciliación de Inventario', 'PASS', 'El stock de los productos coincide con el balance neto de sus movimientos.');
  } else {
    addCheck('CONCILIACION', 'Conciliación de Inventario', 'WARN', `${stockWarnings.length} producto(s) con diferencias entre stock y movimientos.`, stockWarnings);
  }

  return result;
}
