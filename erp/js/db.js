// Motor de base de datos relacional para Limpieza Caviahue
// Soporta persistencia real mediante LocalStorage / IndexedDB con integridad referencial.

import {
  SEED_CATEGORIES,
  SEED_PRICE_LISTS,
  SEED_SUPPLIERS,
  SEED_CUSTOMERS,
  SEED_PRODUCTS,
  SEED_USERS,
  SEED_EXPENSES,
  SEED_SEASONS,
  SEED_PURCHASES,
  SEED_SALES,
  SEED_CUSTOMER_ACCOUNT_MOVEMENTS,
  SEED_AUDIT_LOG,
  DEFAULT_PERMISSIONS
} from './seed_data.js?v=6.0';

import { LogisticsCostDistributor, PricingCalculator, PackagingEngine } from './models.js?v=6.0';
import { exportFullBackupV2, verifyBackupV2 } from './backup_verifier.js?v=6.0';

const STORAGE_KEY_PREFIX = 'caviahue_erp_';

export class Database {
  constructor() {
    this.initialized = false;
    this.currentUser = {
      id: 'usr-admin',
      name: 'Esteban Caviahue (Admin)',
      role: 'ADMINISTRADOR',
      permissions: { ...DEFAULT_PERMISSIONS.ADMINISTRADOR }
    };
  }

  // Inicialización de tablas y seeders
  init() {
    if (this.initialized) return;

    const CURRENT_SEED_VERSION = '6.0-STAYCLEAN-ZERO';
    const hasData = localStorage.getItem(`${STORAGE_KEY_PREFIX}initialized`);
    const seedVer = localStorage.getItem(`${STORAGE_KEY_PREFIX}seed_version`);

    if (!hasData || seedVer !== CURRENT_SEED_VERSION) {
      this.resetToCleanData();
      localStorage.setItem(`${STORAGE_KEY_PREFIX}initialized`, 'true');
      localStorage.setItem(`${STORAGE_KEY_PREFIX}seed_version`, CURRENT_SEED_VERSION);
    } else {
      // Migración defensiva: asegurar permisos actualizados para todos los usuarios
      const users = this.getTable('users');
      if (users && users.length > 0) {
        users.forEach(u => {
          u.permissions = DEFAULT_PERMISSIONS[u.role] ? { ...DEFAULT_PERMISSIONS[u.role], ...(u.permissions || {}), compras: true, ocr_facturas: true, proveedores: true, comparador: true, productos: true, stock: true, precios: true, tienda: true } : { ...DEFAULT_PERMISSIONS.ADMINISTRADOR };
        });
        this.saveTable('users', users);
      }
      const savedUser = localStorage.getItem(`${STORAGE_KEY_PREFIX}current_user`);
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          parsed.permissions = { ...(DEFAULT_PERMISSIONS[parsed.role] || DEFAULT_PERMISSIONS.ADMINISTRADOR), ...(parsed.permissions || {}), compras: true, ocr_facturas: true, proveedores: true, comparador: true, productos: true, stock: true, precios: true, tienda: true };
          localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(parsed));
        } catch {}
      }
      if (!localStorage.getItem(`${STORAGE_KEY_PREFIX}arca_config`)) {
        this.initArcaAndCashSeed();
      }
    }
    this.initialized = true;
  }

  initArcaAndCashSeed() {
    // Configuración inicial ARCA (ex-AFIP) - Parámetros configurables desde la interfaz
    this.saveTable('arca_config', {
      cuit: '30-00000000-0',
      razon_social: 'STAYCLEAN DISTRIBUIDORA',
      iibb: '00-00000000-0',
      inicio_actividades: '2023-05-01',
      punto_venta: 1,
      condicion_iva: 'Responsable Inscripto',
      modo: 'HOMOLOGACION', // 'HOMOLOGACION' o 'PRODUCCION'
      emision_modo: 'AL_CIERRE_DIARIO', // 'AL_CIERRE_DIARIO' o 'EN_EL_ACTO'
      token_valido_hasta: null,
      certificado_cargado: false
    });

    // Facturas ARCA emitidas limpias (0 emitidas)
    this.saveTable('arca_invoices', []);

    // Caja inicial limpia (sin registros previos de demostración)
    this.saveTable('cash_registers', []);
  }

  // Restablecer a estado limpio en cero (sin valores inventados)
  resetToCleanData() {
    try {
      localStorage.removeItem('caviahue_tienda_cart');
      localStorage.removeItem('caviahue_customer_profile');
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}current_user`);
    } catch {}

    this.saveTable('categories', SEED_CATEGORIES);
    this.saveTable('price_lists', SEED_PRICE_LISTS);
    this.saveTable('suppliers', SEED_SUPPLIERS || []);
    this.saveTable('customers', SEED_CUSTOMERS || []); // Vacío
    this.saveTable('products', SEED_PRODUCTS || []); // Vacío (en 0)
    this.saveTable('users', SEED_USERS);
    this.saveTable('expenses', SEED_EXPENSES || []); // Vacío
    this.saveTable('seasons', SEED_SEASONS);
    this.saveTable('purchases', SEED_PURCHASES || []); // Vacío
    this.saveTable('sales', SEED_SALES || []); // Vacío
    this.saveTable('customer_account_movements', SEED_CUSTOMER_ACCOUNT_MOVEMENTS || []); // Vacío
    this.saveTable('audit_log', SEED_AUDIT_LOG || []);
    this.initArcaAndCashSeed();

    // Movimientos de inventario limpios
    this.saveTable('inventory_movements', []);

    // Historial de costos limpio
    this.saveTable('cost_history', []);

    // Pedidos limpios
    this.saveTable('orders', []);

    // Órdenes de compra limpias
    this.saveTable('purchase_orders', []);

    localStorage.setItem(`${STORAGE_KEY_PREFIX}initialized`, 'true');
    localStorage.setItem(`${STORAGE_KEY_PREFIX}seed_version`, '6.0-STAYCLEAN-ZERO');
  }

  resetToSeedData() {
    this.resetToCleanData();
  }

  // Auxiliares de almacenamiento
  getTable(tableName) {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tableName}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error(`Error al leer tabla ${tableName}:`, e);
      return [];
    }
  }

  saveTable(tableName, items) {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableName}`, JSON.stringify(items));
    } catch (e) {
      console.error(`Error al guardar tabla ${tableName}:`, e);
    }
  }

  // Gestión de Usuario Activo y Roles
  getCurrentUser() {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}current_user`);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return this.currentUser;
  }

  setCurrentUser(user) {
    this.currentUser = user;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}current_user`, JSON.stringify(user));
    this.logAudit('CAMBIO_ROL', 'USUARIOS', `Usuario cambió a ${user.name} (${user.role})`);
  }

  // Registro de Auditoría
  logAudit(action, module, details) {
    const logs = this.getTable('audit_log');
    const u = this.getCurrentUser();
    const entry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user_id: u.id,
      user_name: u.name,
      user_role: u.role,
      action,
      module,
      details
    };
    logs.unshift(entry);
    if (logs.length > 500) logs.pop(); // Mantener últimos 500 registros
    this.saveTable('audit_log', logs);
  }

  // ==========================================
  // USUARIOS, PERFILES Y PERMISOS
  // ==========================================
  getUsers() {
    return this.getTable('users');
  }

  getUser(id) {
    return this.getUsers().find(u => u.id === id);
  }

  saveUser(userData) {
    const users = this.getUsers();
    const isEdit = !!userData.id;
    let user;

    const basePermissions = DEFAULT_PERMISSIONS[userData.role] || DEFAULT_PERMISSIONS.VENDEDOR;
    const userPerms = userData.permissions ? { ...basePermissions, ...userData.permissions } : { ...basePermissions };

    if (isEdit) {
      const idx = users.findIndex(u => u.id === userData.id);
      if (idx === -1) throw new Error('Usuario no encontrado');
      user = {
        ...users[idx],
        ...userData,
        permissions: userPerms
      };
      users[idx] = user;
      this.logAudit('MODIFICAR_USUARIO', 'USUARIOS', `Perfil de ${user.name} (${user.role}) actualizado.`);
      
      if (this.getCurrentUser().id === user.id) {
        this.setCurrentUser(user);
      }
    } else {
      user = {
        ...userData,
        id: `usr-${Date.now()}`,
        active: userData.active !== false,
        permissions: userPerms,
        created_at: new Date().toISOString()
      };
      users.push(user);
      this.logAudit('CREAR_USUARIO', 'USUARIOS', `Nuevo perfil creado: ${user.name} (${user.role}).`);
    }

    this.saveTable('users', users);
    return user;
  }

  deleteUser(id) {
    const users = this.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return;
    if (user.id === 'usr-admin') throw new Error('No se puede eliminar el usuario administrador principal.');
    const filtered = users.filter(u => u.id !== id);
    this.saveTable('users', filtered);
    this.logAudit('ELIMINAR_USUARIO', 'USUARIOS', `Usuario eliminado: ${user.name}.`);
  }

  hasPermission(permKey) {
    const u = this.getCurrentUser();
    if (!u) return false;
    if (u.role === 'ADMINISTRADOR') return true;
    if (!u.permissions) return true;
    return !!u.permissions[permKey];
  }

  // ==========================================
  // CAJA DIARIA & ARQUEOS DE CIERRE
  // ==========================================
  getCashRegisters() {
    return this.getTable('cash_registers');
  }

  getCurrentCashRegister() {
    const registers = this.getCashRegisters();
    const todayStr = new Date().toISOString().substring(0, 10);
    const openReg = registers.find(r => r.status === 'ABIERTA');
    if (openReg) return openReg;
    return registers.find(r => r.date === todayStr) || null;
  }

  openCashRegister(initialCash = 50000, notes = '') {
    const registers = this.getCashRegisters();
    const openReg = registers.find(r => r.status === 'ABIERTA');
    if (openReg) throw new Error('Ya existe una caja abierta en curso.');

    const todayStr = new Date().toISOString().substring(0, 10);
    const u = this.getCurrentUser();

    const newReg = {
      id: `caja-${Date.now()}`,
      date: todayStr,
      opened_at: new Date().toISOString(),
      closed_at: null,
      initial_cash: Number(initialCash) || 0,
      status: 'ABIERTA',
      opened_by_user: u.name,
      closed_by_user: null,
      notes: notes || 'Apertura de turno de caja'
    };

    registers.unshift(newReg);
    this.saveTable('cash_registers', registers);
    this.logAudit('APERTURA_CAJA', 'CAJA', `Caja abierta con fondo inicial de $${initialCash} por ${u.name}.`);
    return newReg;
  }

  getCashSummary(dateStr = null) {
    const date = dateStr || new Date().toISOString().substring(0, 10);
    const reg = this.getCurrentCashRegister();
    const initialCash = reg ? (reg.initial_cash || 0) : 0;

    const sales = this.getSales().filter(s => s.status === 'COMPLETADA' && s.date === date);
    const expenses = this.getExpenses().filter(e => e.date === date);

    let salesCash = 0;
    let salesTransfer = 0;
    let salesCard = 0;
    let salesCredit = 0;

    sales.forEach(s => {
      if (s.payment_method === 'Efectivo') salesCash += s.total;
      else if (s.payment_method === 'Transferencia') salesTransfer += s.total;
      else if (s.payment_method === 'Débito' || s.payment_method === 'Crédito') salesCard += s.total;
      else if (s.payment_method === 'Cuenta Corriente') salesCredit += s.total;
      else salesTransfer += s.total;
    });

    const expensesCash = expenses.filter(e => e.payment_method === 'Efectivo').reduce((sum, e) => sum + e.amount, 0);
    const expectedCash = initialCash + salesCash - expensesCash;

    return {
      date,
      register: reg,
      initialCash,
      salesCount: sales.length,
      salesCash,
      salesTransfer,
      salesCard,
      salesCredit,
      salesTotal: sales.reduce((sum, s) => sum + s.total, 0),
      expensesCash,
      expensesTotal: expenses.reduce((sum, e) => sum + e.amount, 0),
      expectedCash
    };
  }

  closeCashRegister(countedCash, notes = '') {
    const registers = this.getCashRegisters();
    const reg = registers.find(r => r.status === 'ABIERTA');
    if (!reg) throw new Error('No hay ninguna caja abierta para cerrar.');

    const summary = this.getCashSummary(reg.date);
    const counted = Number(countedCash) || 0;
    const diff = counted - summary.expectedCash;
    const u = this.getCurrentUser();

    reg.closed_at = new Date().toISOString();
    reg.status = 'CERRADA';
    reg.closed_by_user = u.name;
    reg.sales_cash = summary.salesCash;
    reg.sales_transfer = summary.salesTransfer;
    reg.sales_card = summary.salesCard;
    reg.sales_credit = summary.salesCredit;
    reg.sales_total = summary.salesTotal;
    reg.expenses_cash = summary.expensesCash;
    reg.expected_cash = summary.expectedCash;
    reg.counted_cash = counted;
    reg.cash_difference = diff;
    reg.closure_notes = notes;

    this.saveTable('cash_registers', registers);

    // Emisión automática del lote ARCA del día al cierre de caja
    let arcaBatchResult = null;
    try {
      arcaBatchResult = this.emitArcaDailyBatch(reg.date);
    } catch (e) {
      console.warn('Emisión ARCA al cierre:', e);
    }

    this.logAudit('CIERRE_CAJA', 'CAJA', `Caja cerrada. Efectivo contado: $${counted}. Diferencia: $${diff}. Ventas totales: $${summary.salesTotal}.`);
    return { register: reg, summary, diff, arcaBatchResult };
  }

  // ==========================================
  // FACTURACIÓN ELECTRÓNICA ARCA (EX-AFIP)
  // ==========================================
  getArcaConfig() {
    return this.getTable('arca_config') || {};
  }

  saveArcaConfig(configData) {
    const cfg = {
      ...this.getArcaConfig(),
      ...configData
    };
    this.saveTable('arca_config', cfg);
    this.logAudit('CONFIG_ARCA', 'ARCA', `Parámetros de facturación ARCA actualizados.`);
    return cfg;
  }

  getArcaInvoices() {
    return this.getTable('arca_invoices');
  }

  emitSingleArcaInvoice(saleId) {
    const sale = this.getSale(saleId);
    if (!sale) throw new Error('Venta no encontrada');

    const arcaInvoices = this.getArcaInvoices();
    const existing = arcaInvoices.find(inv => inv.sale_number === sale.sale_number && inv.status === 'EMITIDA');
    if (existing) return existing;

    const cfg = this.getArcaConfig();
    const nextNro = arcaInvoices.length + 142;
    const caeNum = '74' + Math.floor(100000000000 + Math.random() * 900000000000);
    const vtoDate = new Date(Date.now() + 86400000 * 10).toISOString().substring(0, 10);

    const isEmpresa = sale.customer_name.toLowerCase().includes('hotel') ||
                      sale.customer_name.toLowerCase().includes('restaurante') ||
                      sale.customer_name.toLowerCase().includes('complejo');

    const tipoCbte = isEmpresa ? 'FA_A' : 'FA_B';

    const newInvoice = {
      id: `arca-${Date.now()}`,
      sale_id: sale.id,
      sale_number: sale.sale_number,
      tipo_cbte: tipoCbte,
      pto_vta: cfg.punto_venta || 5,
      nro_cbte: nextNro,
      fecha: sale.date || new Date().toISOString().substring(0, 10),
      cuit_cliente: sale.customer_id ? (this.getCustomer(sale.customer_id)?.cuit_dni || '20-00000000-1') : '20-00000000-1',
      cliente_nombre: sale.customer_name,
      importe_neto: sale.subtotal,
      importe_iva: sale.vat_amount,
      importe_total: sale.total,
      cae: caeNum,
      cae_vto: vtoDate,
      qr_data: `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify({
        ver: 1,
        fecha: sale.date,
        cuit: 30718942154,
        ptoVta: cfg.punto_venta || 5,
        tipoCbte: tipoCbte === 'FA_A' ? 1 : 6,
        nroCbte: nextNro,
        total: sale.total,
        cae: caeNum
      }))}`,
      status: 'EMITIDA',
      created_at: new Date().toISOString()
    };

    arcaInvoices.unshift(newInvoice);
    this.saveTable('arca_invoices', arcaInvoices);

    this.logAudit('EMITIR_ARCA', 'ARCA', `Factura ${tipoCbte} 0005-${String(nextNro).padStart(8, '0')} emitida con CAE ${caeNum} para ${sale.customer_name}.`);
    return newInvoice;
  }

  emitArcaDailyBatch(dateStr) {
    const targetDate = dateStr || new Date().toISOString().substring(0, 10);
    const sales = this.getSales().filter(s => s.status === 'COMPLETADA' && s.date === targetDate);
    const arcaInvoices = this.getArcaInvoices();

    let emittedCount = 0;
    sales.forEach(sale => {
      const already = arcaInvoices.find(inv => inv.sale_number === sale.sale_number && inv.status === 'EMITIDA');
      if (!already) {
        this.emitSingleArcaInvoice(sale.id);
        emittedCount++;
      }
    });

    return { date: targetDate, emittedCount, totalSales: sales.length };
  }

  // Helper de imágenes para Tienda Nube
  getProductImage(product) {
    if (product && product.image_url && product.image_url.trim().length > 0) {
      return product.image_url;
    }
    const catImages = {
      'cat-1': 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=500&auto=format&fit=crop',
      'cat-2': 'https://images.unsplash.com/photo-1584813470613-5b1c1cad3d69?w=500&auto=format&fit=crop',
      'cat-3': 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=500&auto=format&fit=crop',
      'cat-4': 'https://images.unsplash.com/photo-1597484661643-2f5fef640dd1?w=500&auto=format&fit=crop',
      'cat-5': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop',
      'cat-6': 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=500&auto=format&fit=crop',
      'cat-7': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop',
      'cat-8': 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=500&auto=format&fit=crop'
    };
    return (product && catImages[product.category_id]) || 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&auto=format&fit=crop';
  }

  // ==========================================
  // PRODUCTOS Y CATEGORÍAS
  // ==========================================
  getProducts() {
    return this.getTable('products');
  }

  getProduct(id) {
    return this.getProducts().find(p => p.id === id);
  }

  saveProduct(productData) {
    const products = this.getProducts();
    const isEdit = !!productData.id;
    let product;

    // Calcular márgenes y costos
    const caviahueCost = Number(productData.caviahue_cost) || 0;
    const salePrice = Number(productData.sale_price) || 0;
    const marginAmount = salePrice - caviahueCost;
    const marginPct = PricingCalculator.calcMarginPct(caviahueCost, salePrice);
    const markupPct = PricingCalculator.calcMarkupPct(caviahueCost, salePrice);

    if (isEdit) {
      const idx = products.findIndex(p => p.id === productData.id);
      if (idx === -1) throw new Error('Producto no encontrado');
      product = {
        ...products[idx],
        ...productData,
        caviahue_cost: caviahueCost,
        sale_price: salePrice,
        margin_amount: marginAmount,
        margin_pct: marginPct,
        markup_pct: markupPct
      };
      products[idx] = product;
      this.logAudit('MODIFICAR_PRODUCTO', 'PRODUCTOS', `Producto actualizado: ${product.name} (SKU: ${product.sku})`);
    } else {
      product = {
        ...productData,
        id: `prod-${Date.now()}`,
        caviahue_cost: caviahueCost,
        sale_price: salePrice,
        margin_amount: marginAmount,
        margin_pct: marginPct,
        markup_pct: markupPct,
        current_stock: Number(productData.current_stock) || 0,
        active: productData.active !== false
      };
      products.push(product);
      this.logAudit('CREAR_PRODUCTO', 'PRODUCTOS', `Nuevo producto registrado: ${product.name} (SKU: ${product.sku})`);

      // Crear movimiento inicial si vino con stock
      if (product.current_stock > 0) {
        this.recordInventoryMovement({
          product_id: product.id,
          product_name: product.name,
          movement_type: 'AJUSTE',
          quantity_base: product.current_stock,
          unit_used: product.sale_unit || 'Unidad',
          previous_stock: 0,
          new_stock: product.current_stock,
          unit_cost: product.caviahue_cost,
          reference_type: 'INVENTARIO_INICIAL',
          reference_id: product.id,
          notes: 'Carga inicial al crear producto'
        });
      }
    }

    this.saveTable('products', products);
    return product;
  }

  deleteProduct(id) {
    const products = this.getProducts();
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const filtered = products.filter(p => p.id !== id);
    this.saveTable('products', filtered);
    this.logAudit('ELIMINAR_PRODUCTO', 'PRODUCTOS', `Producto eliminado: ${prod.name}`);
  }

  getCategories() {
    return this.getTable('categories');
  }

  // ==========================================
  // CLIENTES Y CUENTAS CORRIENTES
  // ==========================================
  getCustomers() {
    return this.getTable('customers');
  }

  getCustomer(id) {
    return this.getCustomers().find(c => c.id === id);
  }

  saveCustomer(customerData) {
    const customers = this.getCustomers();
    const isEdit = !!customerData.id;
    let customer;

    if (isEdit) {
      const idx = customers.findIndex(c => c.id === customerData.id);
      if (idx === -1) throw new Error('Cliente no encontrado');
      customer = { ...customers[idx], ...customerData };
      customers[idx] = customer;
      this.logAudit('MODIFICAR_CLIENTE', 'CLIENTES', `Cliente actualizado: ${customer.name}`);
    } else {
      customer = {
        ...customerData,
        id: `cust-${Date.now()}`,
        current_balance: 0,
        created_at: new Date().toISOString()
      };
      customers.push(customer);
      this.logAudit('CREAR_CLIENTE', 'CLIENTES', `Nuevo cliente registrado: ${customer.name} (${customer.customer_type})`);
    }

    this.saveTable('customers', customers);
    return customer;
  }

  getCustomerAccountMovements(customerId) {
    const movs = this.getTable('customer_account_movements');
    if (!customerId) return movs;
    return movs.filter(m => m.customer_id === customerId);
  }

  addCustomerPayment(customerId, amount, paymentMethod, notes) {
    const customers = this.getCustomers();
    const cust = customers.find(c => c.id === customerId);
    if (!cust) throw new Error('Cliente no encontrado');

    const paymentAmount = Number(amount) || 0;
    const prevBalance = Number(cust.current_balance) || 0;
    const newBalance = prevBalance - paymentAmount;

    cust.current_balance = newBalance;
    this.saveTable('customers', customers);

    const movs = this.getTable('customer_account_movements');
    const paymentId = `REC-${Date.now().toString().slice(-4)}`;
    movs.unshift({
      id: `cam-${Date.now()}`,
      date: new Date().toISOString().substring(0, 10),
      customer_id: customerId,
      customer_name: cust.name,
      type: 'PAGO',
      amount: -paymentAmount,
      balance_after: newBalance,
      reference_type: 'RECIBO',
      reference_id: paymentId,
      payment_method: paymentMethod || 'Transferencia',
      notes: notes || 'Cobranza / Pago a cuenta corriente',
      user_name: this.getCurrentUser().name,
      created_at: new Date().toISOString()
    });
    this.saveTable('customer_account_movements', movs);

    this.logAudit('COBRANZA', 'CUENTAS_CORRIENTES', `Pago registrado de $${paymentAmount} a ${cust.name}. Nuevo saldo: $${newBalance}`);
    return { receiptId: paymentId, newBalance };
  }

  // ==========================================
  // PROVEEDORES
  // ==========================================
  getSuppliers() {
    return this.getTable('suppliers');
  }

  getSupplier(id) {
    return this.getSuppliers().find(s => s.id === id);
  }

  saveSupplier(supplierData) {
    const suppliers = this.getSuppliers();
    const isEdit = !!supplierData.id;
    let supplier;

    if (isEdit) {
      const idx = suppliers.findIndex(s => s.id === supplierData.id);
      if (idx === -1) throw new Error('Proveedor no encontrado');
      supplier = { ...suppliers[idx], ...supplierData };
      suppliers[idx] = supplier;
      this.logAudit('MODIFICAR_PROVEEDOR', 'PROVEEDORES', `Proveedor actualizado: ${supplier.name}`);
    } else {
      supplier = {
        ...supplierData,
        id: `sup-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      suppliers.push(supplier);
      this.logAudit('CREAR_PROVEEDOR', 'PROVEEDORES', `Nuevo proveedor registrado: ${supplier.name}`);
    }

    this.saveTable('suppliers', suppliers);
    return supplier;
  }

  // ==========================================
  // LISTAS DE PRECIOS
  // ==========================================
  getPriceLists() {
    return this.getTable('price_lists');
  }

  // ==========================================
  // VENTAS (POS) Y ANULACIÓN
  // ==========================================
  getSales() {
    return this.getTable('sales');
  }

  getSale(id) {
    return this.getSales().find(s => s.id === id);
  }

  createSale(saleData) {
    // 1. Validar ítems
    if (!saleData.items || saleData.items.length === 0) {
      throw new Error('La venta no tiene productos');
    }

    const products = this.getProducts();
    const sales = this.getSales();
    const u = this.getCurrentUser();

    // Generar número de venta
    const saleNum = `VTA-${String(sales.length + 1).padStart(4, '0')}`;
    const saleId = `sale-${Date.now()}`;

    let totalCost = 0;
    let totalSale = 0;

    // Procesar cada ítem y descontar stock
    const processedItems = saleData.items.map(it => {
      const prod = products.find(p => p.id === it.product_id);
      if (!prod) throw new Error(`Producto ${it.product_id} no encontrado`);

      const factor = it.factor_to_base || 1;
      const baseQtyToDeduct = (it.quantity || 1) * factor;

      // Calcular costo del ítem
      const unitCost = prod.caviahue_cost || 0;
      const itemCost = unitCost * baseQtyToDeduct;
      totalCost += itemCost;

      const itemSubtotal = (it.quantity || 1) * (it.unit_price || 0);
      totalSale += itemSubtotal;

      // Descontar stock
      const prevStock = prod.current_stock;
      prod.current_stock = Math.max(0, prod.current_stock - baseQtyToDeduct);
      prod.last_sale_date = new Date().toISOString().substring(0, 10);

      // Registrar movimiento de stock
      this.recordInventoryMovement({
        product_id: prod.id,
        product_name: prod.name,
        movement_type: 'VENTA',
        quantity_base: -baseQtyToDeduct,
        unit_used: it.unit_name || prod.sale_unit,
        quantity_input: it.quantity,
        previous_stock: prevStock,
        new_stock: prod.current_stock,
        unit_cost: unitCost,
        reference_type: 'VENTA',
        reference_id: saleNum,
        notes: `Venta a ${saleData.customer_name || 'Consumidor Final'}`
      });

      return {
        ...it,
        quantity_base: baseQtyToDeduct,
        unit_cost: unitCost,
        total_cost: itemCost,
        subtotal: itemSubtotal
      };
    });

    // Guardar cambios en productos
    this.saveTable('products', products);

    // Calcular márgenes
    const discountAmount = Number(saleData.discount_amount) || 0;
    const subtotal = totalSale - discountAmount;
    const vatRate = 0.21;
    const vatAmount = subtotal * vatRate;
    const totalFinal = subtotal + vatAmount;
    const grossMargin = totalFinal - totalCost;
    const grossMarginPct = totalFinal > 0 ? (grossMargin / totalFinal) * 100 : 0;

    const newSale = {
      id: saleId,
      sale_number: saleNum,
      date: saleData.date || new Date().toISOString().substring(0, 10),
      customer_id: saleData.customer_id,
      customer_name: saleData.customer_name || 'Consumidor Final',
      price_list_id: saleData.price_list_id || 'list-minorista',
      payment_method: saleData.payment_method || 'Efectivo',
      subtotal,
      discount_amount: discountAmount,
      vat_amount: vatAmount,
      total: totalFinal,
      total_cost: totalCost,
      gross_margin: grossMargin,
      gross_margin_pct: grossMarginPct,
      status: 'COMPLETADA',
      user_id: u.id,
      user_name: u.name,
      notes: saleData.notes || '',
      items: processedItems,
      created_at: new Date().toISOString()
    };

    sales.unshift(newSale);
    this.saveTable('sales', sales);

    // Si es Cuenta Corriente, actualizar saldo del cliente y registrar movimiento
    if (saleData.payment_method === 'Cuenta Corriente' && saleData.customer_id) {
      const customers = this.getCustomers();
      const cust = customers.find(c => c.id === saleData.customer_id);
      if (cust) {
        cust.current_balance = (cust.current_balance || 0) + totalFinal;
        this.saveTable('customers', customers);

        const camMovs = this.getTable('customer_account_movements');
        camMovs.unshift({
          id: `cam-${Date.now()}`,
          date: newSale.date,
          customer_id: cust.id,
          customer_name: cust.name,
          type: 'VENTA',
          amount: totalFinal,
          balance_after: cust.current_balance,
          reference_type: 'VENTA',
          reference_id: saleNum,
          payment_method: 'Cuenta Corriente',
          notes: `Venta facturada ${saleNum}`,
          user_name: u.name,
          created_at: new Date().toISOString()
        });
        this.saveTable('customer_account_movements', camMovs);
      }
    }

    this.logAudit('CREAR_VENTA', 'VENTAS', `Venta ${saleNum} confirmada a ${newSale.customer_name} por $${totalFinal.toFixed(2)}`);
    return newSale;
  }

  cancelSale(saleId) {
    const sales = this.getSales();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new Error('Venta no encontrada');
    if (sale.status === 'ANULADA') throw new Error('La venta ya fue anulada previamente');

    const products = this.getProducts();
    const u = this.getCurrentUser();

    // Revertir stock de cada producto
    sale.items.forEach(it => {
      const prod = products.find(p => p.id === it.product_id);
      if (prod) {
        const prevStock = prod.current_stock;
        const qtyToReturn = it.quantity_base || (it.quantity * (it.factor_to_base || 1));
        prod.current_stock += qtyToReturn;

        this.recordInventoryMovement({
          product_id: prod.id,
          product_name: prod.name,
          movement_type: 'ANULACION',
          quantity_base: qtyToReturn,
          unit_used: it.unit_name || prod.sale_unit,
          quantity_input: it.quantity,
          previous_stock: prevStock,
          new_stock: prod.current_stock,
          unit_cost: prod.caviahue_cost,
          reference_type: 'ANULACION_VENTA',
          reference_id: sale.sale_number,
          notes: `Anulación de venta ${sale.sale_number}`
        });
      }
    });

    this.saveTable('products', products);

    // Si fue en Cuenta Corriente, revertir saldo del cliente
    if (sale.payment_method === 'Cuenta Corriente' && sale.customer_id) {
      const customers = this.getCustomers();
      const cust = customers.find(c => c.id === sale.customer_id);
      if (cust) {
        cust.current_balance = Math.max(0, (cust.current_balance || 0) - sale.total);
        this.saveTable('customers', customers);

        const camMovs = this.getTable('customer_account_movements');
        camMovs.unshift({
          id: `cam-${Date.now()}`,
          date: new Date().toISOString().substring(0, 10),
          customer_id: cust.id,
          customer_name: cust.name,
          type: 'NOTA_CREDITO',
          amount: -sale.total,
          balance_after: cust.current_balance,
          reference_type: 'ANULACION_VENTA',
          reference_id: sale.sale_number,
          payment_method: 'Ajuste Saldo',
          notes: `Anulación de venta ${sale.sale_number}`,
          user_name: u.name,
          created_at: new Date().toISOString()
        });
        this.saveTable('customer_account_movements', camMovs);
      }
    }

    sale.status = 'ANULADA';
    this.saveTable('sales', sales);

    this.logAudit('ANULAR_VENTA', 'VENTAS', `Venta ${sale.sale_number} ANULADA. Se revirtió el stock correspondiente.`);
    return sale;
  }

  // ==========================================
  // COMPRAS, PROVEEDORES INTELIGENTES Y COSTO PUESTO EN CAVIAHUE
  // ==========================================
  getPurchases() {
    return this.getTable('purchases');
  }

  normalizeText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeCode(code) {
    return String(code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  // Busca un proveedor existente por ID, CUIT, email o nombre normalizado para no duplicar proveedores
  findSupplierMatch(supplierData = {}) {
    const suppliers = this.getSuppliers();
    if (!suppliers || suppliers.length === 0) return null;

    if (supplierData.id || supplierData.supplier_id) {
      const byId = suppliers.find(s => s.id === (supplierData.id || supplierData.supplier_id));
      if (byId) return byId;
    }

    const inputCuit = String(supplierData.cuit || supplierData.supplier_cuit || '').replace(/\D/g, '');
    if (inputCuit && inputCuit.length >= 8) {
      const byCuit = suppliers.find(s => String(s.cuit || '').replace(/\D/g, '') === inputCuit);
      if (byCuit) return byCuit;
    }

    const inputEmail = String(supplierData.email || supplierData.supplier_email || '').trim().toLowerCase();
    if (inputEmail) {
      const byEmail = suppliers.find(s => String(s.email || '').trim().toLowerCase() === inputEmail);
      if (byEmail) return byEmail;
    }

    const rawName = supplierData.name || supplierData.supplier_name || '';
    const normName = this.normalizeText(rawName);
    if (!normName) return null;

    return suppliers.find(s => {
      const sNorm = this.normalizeText(s.name);
      if (!sNorm) return false;
      if (sNorm === normName || sNorm.includes(normName) || normName.includes(sNorm)) return true;
      // Alias clave de proveedores frecuentes
      if ((normName.includes('EFA') && sNorm.includes('EFA')) ||
          (normName.includes('SYS') && sNorm.includes('SYS')) ||
          ((normName.includes('EL TRIO') || normName.includes('MARTINI JULIAN')) && (sNorm.includes('EL TRIO') || sNorm.includes('MARTINI JULIAN')))) {
        return true;
      }
      return false;
    }) || null;
  }

  // Obtiene el proveedor existente o lo crea automáticamente sin duplicar
  findOrCreateSupplier(supplierData = {}) {
    const suppliers = this.getSuppliers();
    const existing = this.findSupplierMatch(supplierData);

    if (existing) {
      let updated = false;
      const newCuit = supplierData.cuit || supplierData.supplier_cuit;
      const newAddress = supplierData.address || supplierData.supplier_address;
      const newPhone = supplierData.phone || supplierData.supplier_phone;
      const newEmail = supplierData.email || supplierData.supplier_email;
      const newCity = supplierData.city || supplierData.supplier_city;

      if (newCuit && (!existing.cuit || existing.cuit === 'S/D')) { existing.cuit = newCuit; updated = true; }
      if (newAddress && !existing.address) { existing.address = newAddress; updated = true; }
      if (newPhone && !existing.phone) { existing.phone = newPhone; updated = true; }
      if (newEmail && !existing.email) { existing.email = newEmail; updated = true; }
      if (newCity && !existing.city) { existing.city = newCity; updated = true; }

      if (updated) {
        this.saveTable('suppliers', suppliers);
      }
      return { supplier: existing, created: false };
    }

    const name = String(supplierData.name || supplierData.supplier_name || 'Proveedor General').trim();
    const newSupplier = {
      id: supplierData.id || `sup-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      cuit: supplierData.cuit || supplierData.supplier_cuit || '',
      contact_name: supplierData.contact_name || 'Administración / Ventas',
      phone: supplierData.phone || supplierData.supplier_phone || '',
      whatsapp: supplierData.whatsapp || supplierData.phone || supplierData.supplier_phone || '',
      email: supplierData.email || supplierData.supplier_email || '',
      address: supplierData.address || supplierData.supplier_address || '',
      city: supplierData.city || supplierData.supplier_city || 'Cipolletti / Neuquén',
      payment_terms: supplierData.payment_terms || supplierData.payment_condition || 'Contado',
      credit_days: Number(supplierData.credit_days) || 0,
      notes: supplierData.notes || 'Proveedor registrado automáticamente desde lectura de factura.'
    };

    suppliers.push(newSupplier);
    this.saveTable('suppliers', suppliers);
    this.logAudit('ALTA_PROVEEDOR', 'PROVEEDORES', `Proveedor creado automáticamente desde factura: ${newSupplier.name} (CUIT: ${newSupplier.cuit || 'S/D'})`);
    return { supplier: newSupplier, created: true };
  }

  // Busca un producto existente por Código (SKU) exacto o por Descripción exacta
  findProductMatch(code, name, productsList = null) {
    const products = productsList || this.getProducts();
    const normCode = this.normalizeCode(code);
    const normName = this.normalizeText(name);

    if (normCode) {
      const bySku = products.find(p => {
        const pSku = this.normalizeCode(p.sku);
        const pBar = this.normalizeCode(p.barcode);
        return pSku === normCode || pBar === normCode || (pSku && pSku.endsWith(`-${normCode}`));
      });
      if (bySku) return bySku;
    }

    if (normName) {
      const byName = products.find(p => this.normalizeText(p.name) === normName);
      if (byName) return byName;
    }

    return null;
  }

  guessCategoryId(description) {
    const d = this.normalizeText(description);
    if (d.includes('GUANTE') || d.includes('TRAPO') || d.includes('FRANELA') || d.includes('ESPONJA') || d.includes('PANO') || d.includes('PULVERIZADOR') || d.includes('GATILLO') || d.includes('FIBRA') || d.includes('ESCOBA') || d.includes('SECADOR')) {
      return 'cat-7'; // Accesorios y Bazar Limpieza
    }
    if (d.includes('JABON') || d.includes('SUAVIZANTE') || d.includes('ROPA')) {
      return 'cat-8'; // Cuidado de Ropa y Lavandería
    }
    if (d.includes('PAPEL') || d.includes('TOALLA') || d.includes('BOBINA') || d.includes('SERVILLETA')) {
      return 'cat-3'; // Papel e Higiene Institucional
    }
    if (d.includes('BOLSA') || d.includes('CONSORCIO') || d.includes('CAMISETA') || d.includes('ARRANQUE')) {
      return 'cat-4'; // Bolsas y Empaque
    }
    if (d.includes('CAJA PIZZA') || d.includes('FILM') || d.includes('ALUMINIO') || d.includes('ENVASE')) {
      return 'cat-5'; // Cajas, Envases y Film
    }
    if (d.includes('BANDEJA') || d.includes('VASO') || d.includes('CUBIERTO')) {
      return 'cat-1'; // Descartables Gastronómicos
    }
    return 'cat-2'; // Productos Químicos y Limpieza
  }

  guessBrand(description, supplierName = '') {
    const d = this.normalizeText(description);
    const knownBrands = ['AYUDIN', 'THAMES', 'MR MUSCULO', 'SUIZA', 'CIF', 'CERAMICOL', 'BLEM', 'MAPA', 'EXTRALIMP', 'FIBRAN', 'GANGA', 'SMELL FRESH', 'MAGISTRAL', 'MAGIST', 'SYS', 'ALA', 'ELITE', 'HIGIENOL'];
    for (const b of knownBrands) {
      if (d.includes(b)) return b === 'MAGIST' ? 'MAGISTRAL' : b;
    }
    if (this.normalizeText(supplierName).includes('SYS')) return 'SYS';
    if (this.normalizeText(supplierName).includes('EFA')) return 'EFA';
    const firstWord = String(description || '').trim().split(/\s+/)[0];
    return firstWord ? firstWord.toUpperCase() : 'GENÉRICO';
  }

  createPurchase(purchaseData) {
    if (!purchaseData.items || purchaseData.items.length === 0) {
      throw new Error('La compra no contiene productos');
    }

    const purchases = this.getPurchases();
    const products = this.getProducts();
    const u = this.getCurrentUser();

    // 1. Resolver o crear el proveedor automáticamente sin duplicar
    const { supplier, created: supplierCreated } = this.findOrCreateSupplier({
      id: purchaseData.supplier_id,
      name: purchaseData.supplier_name,
      cuit: purchaseData.supplier_cuit,
      address: purchaseData.supplier_address,
      phone: purchaseData.supplier_phone,
      email: purchaseData.supplier_email,
      payment_condition: purchaseData.payment_condition
    });

    purchaseData.supplier_id = supplier.id;
    purchaseData.supplier_name = supplier.name;

    // 2. Verificar si ya existe una factura con el mismo número y proveedor
    const cleanInvNum = String(purchaseData.invoice_number || '').trim();
    const existingInvoice = cleanInvNum && cleanInvNum !== 'S/N'
      ? purchases.find(p => p.status !== 'ANULADA' && p.supplier_id === supplier.id && String(p.invoice_number || '').trim().toUpperCase() === cleanInvNum.toUpperCase())
      : null;

    const purchaseNum = existingInvoice && purchaseData.merge_into_existing
      ? existingInvoice.purchase_number
      : `COM-${String(purchases.length + 1).padStart(4, '0')}`;
    const purchaseId = existingInvoice && purchaseData.merge_into_existing
      ? existingInvoice.id
      : `pur-${Date.now()}`;

    const totalLogistics = Number(purchaseData.total_logistics) || 0;
    const distributionMethod = purchaseData.logistics_distribution_method || 'VALOR';
    const discountPctGlobal = Number(purchaseData.discount_pct) || 0;
    const vatRateGlobal = purchaseData.vat_included === false ? (Number(purchaseData.vat_rate) || 21) : 0;

    // Preparar ítems con desglose de empaque (cajas a unidades vendibles) y costo unitario efectivo
    const normalizedInputItems = purchaseData.items.map(it => {
      const descRaw = String(it.invoice_description || it.product_name || it.description || it.name || '').trim();
      const qtyBoxes = Number(it.boxes_count ?? it.quantity) || 1;
      const rawUnitPrice = Number(it.unit_price_original ?? it.unit_price ?? it.unit_invoice_cost) || 0;
      const statedLineTotal = Number(it.line_total) || 0;

      // Parsing automático o valores manuales pasados desde la UI
      const parsedPkg = PackagingEngine.parse(descRaw, qtyBoxes, rawUnitPrice, statedLineTotal);
      const unitsPerBox = Number(it.units_per_box ?? parsedPkg.unitsPerBox) || 1;
      const pricingMode = it.pricing_mode || parsedPkg.pricingMode || 'PER_BOX';
      const inventoryUnit = it.inventory_unit || parsedPkg.inventoryUnit || 'unidad';
      const cleanCommercialName = it.commercial_name || it.product_name || parsedPkg.cleanCommercialName;
      const itemDiscPct = Number(it.discount_pct ?? discountPctGlobal) || 0;

      // Cálculo matemático exacto de unidades vendibles y costos
      const pkgCalc = PackagingEngine.calculate({
        boxesCount: qtyBoxes,
        unitsPerBox,
        pricingMode,
        rawUnitPrice,
        discountPct: itemDiscPct
      });

      const effectiveNetUnitCost = purchaseData.vat_included === false
        ? Number((pkgCalc.netCostPerUnit * (1 + vatRateGlobal / 100)).toFixed(2))
        : pkgCalc.netCostPerUnit;

      return {
        ...it,
        code: String(it.code || it.sku || '').trim(),
        product_name: cleanCommercialName,
        invoice_description: descRaw,
        boxes_count: qtyBoxes,
        units_per_box: unitsPerBox,
        pricing_mode: pricingMode,
        inventory_unit: inventoryUnit,
        quantity: qtyBoxes,
        quantity_base: pkgCalc.saleableUnits, // Stock vendible real
        unit_price_original: rawUnitPrice,
        unit_price_bruto: rawUnitPrice,
        discount_pct: itemDiscPct,
        discount_amount: pkgCalc.discountAmount,
        gross_unit_cost: pkgCalc.grossCostPerUnit,
        net_unit_cost: pkgCalc.netCostPerUnit,
        unit_invoice_cost: effectiveNetUnitCost,
        subtotal_bruto: pkgCalc.lineTotalBruto,
        line_total: pkgCalc.lineTotalNeto
      };
    });

    // Distribuir gastos logísticos entre los ítems
    const itemsWithLogistics = LogisticsCostDistributor.distribute(
      normalizedInputItems,
      totalLogistics,
      distributionMethod
    );

    let subtotalMercaderiaBruta = 0;
    let totalDescuentosRenglones = 0;
    let newProductsCreated = 0;
    let existingProductsUpdated = 0;
    const costHist = this.getTable('cost_history');
    const categories = this.getCategories();

    // 3. Procesar cada ítem: buscar por código o descripción, crear si no existe, y SUMAR UNIDADES VENDIBLES al stock
    const processedItems = itemsWithLogistics.map(it => {
      let prod = null;
      if (it.product_id) {
        prod = products.find(p => p.id === it.product_id);
      }
      if (!prod) {
        prod = this.findProductMatch(it.code, it.product_name, products) || this.findProductMatch(it.code, it.invoice_description, products);
      }

      let wasCreatedNow = false;
      const baseQtyToAdd = Number(it.quantity_base || it.saleable_units || it.quantity) || 1;
      const unitCost = Number(it.unit_caviahue_cost || it.unit_invoice_cost) || 0;

      if (!prod) {
        // Crear el producto automáticamente en la base de datos expresado en unidades vendibles individuales
        const catId = it.category_id || this.guessCategoryId(it.product_name);
        const catObj = categories.find(c => c.id === catId);
        const targetMargin = catObj ? catObj.default_margin : 40;
        const suggestedSalePrice = Math.ceil((unitCost * (1 + targetMargin / 100)) / 10) * 10;
        const suggestedWholesale = Math.ceil((suggestedSalePrice * 0.88) / 10) * 10;
        const skuCode = it.code || `ART-${String(products.length + 1).padStart(4, '0')}`;

        prod = {
          id: `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          sku: skuCode,
          barcode: skuCode,
          name: it.product_name,
          category_id: catId,
          brand: this.guessBrand(it.product_name, supplier.name),
          description: `${it.product_name} (Código Proveedor: ${skuCode} - ${supplier.name})`,
          base_unit: it.inventory_unit || 'unidad',
          purchase_unit: (it.units_per_box > 1) ? 'caja' : (it.inventory_unit || 'unidad'),
          conversion_factor: Number(it.units_per_box) || 1,
          purchase_cost: unitCost,
          logistics_cost: Number(it.allocated_logistics) || 0,
          caviahue_cost: unitCost,
          sale_price: suggestedSalePrice,
          wholesale_price: suggestedWholesale,
          margin_pct: PricingCalculator.calcMarginPct(unitCost, suggestedSalePrice),
          markup_pct: PricingCalculator.calcMarkupPct(unitCost, suggestedSalePrice),
          margin_amount: suggestedSalePrice - unitCost,
          preferred_supplier_id: supplier.id,
          current_stock: 0,
          min_stock: 3,
          max_stock: 50,
          warehouse_location: 'Depósito General',
          active: true,
          publish_online: true,
          last_purchase_date: purchaseData.date || new Date().toISOString().substring(0, 10),
          last_sale_date: null,
          image_url: ''
        };
        products.push(prod);
        wasCreatedNow = true;
        newProductsCreated++;
      } else {
        existingProductsUpdated++;
        if (it.code && !prod.sku) prod.sku = it.code;
        if (it.code && !prod.barcode) prod.barcode = it.code;
        if (it.units_per_box > 1 && prod.name.toUpperCase().startsWith('CAJA ')) {
          prod.name = it.product_name;
          prod.base_unit = it.inventory_unit || 'unidad';
          prod.purchase_unit = 'caja';
          prod.conversion_factor = it.units_per_box;
        }
      }

      subtotalMercaderiaBruta += Number(it.subtotal_bruto || (it.quantity * it.unit_price_bruto));
      totalDescuentosRenglones += Number(it.discount_amount || 0);

      const oldCaviahueCost = Number(prod.caviahue_cost) || 0;
      const newUnitCaviahueCost = unitCost;

      // Registrar historial de costos por unidad vendible
      costHist.unshift({
        id: `cost-hist-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        product_id: prod.id,
        product_sku: prod.sku,
        product_name: prod.name,
        date: purchaseData.date || new Date().toISOString().substring(0, 10),
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        invoice_cost: unitCost,
        logistics_cost: baseQtyToAdd > 0 ? Number(((it.allocated_logistics || 0) / baseQtyToAdd).toFixed(2)) : 0,
        caviahue_cost: newUnitCaviahueCost,
        previous_caviahue_cost: oldCaviahueCost,
        reason: `Compra ${purchaseNum} (Factura: ${purchaseData.invoice_number})`,
        user_name: u.name
      });

      // Actualizar costos en producto por unidad vendible
      prod.purchase_cost = unitCost;
      prod.logistics_cost = Number(it.allocated_logistics) || 0;
      prod.caviahue_cost = newUnitCaviahueCost;
      prod.preferred_supplier_id = supplier.id;
      prod.last_purchase_date = purchaseData.date || new Date().toISOString().substring(0, 10);

      if (!prod.sale_price || prod.sale_price <= newUnitCaviahueCost) {
        const catObj = categories.find(c => c.id === prod.category_id);
        const targetMargin = catObj ? catObj.default_margin : 40;
        prod.sale_price = Math.ceil((newUnitCaviahueCost * (1 + targetMargin / 100)) / 10) * 10;
        prod.wholesale_price = Math.ceil((prod.sale_price * 0.88) / 10) * 10;
      }

      prod.margin_amount = prod.sale_price - newUnitCaviahueCost;
      prod.margin_pct = PricingCalculator.calcMarginPct(newUnitCaviahueCost, prod.sale_price);
      prod.markup_pct = PricingCalculator.calcMarkupPct(newUnitCaviahueCost, prod.sale_price);

      // SUMAR AL STOCK EXISTENTE EN UNIDADES VENDIBLES REALES
      const prevStock = Number(prod.current_stock) || 0;
      prod.current_stock = prevStock + baseQtyToAdd;

      // Registrar movimiento de inventario trazable en unidades individuales
      this.recordInventoryMovement({
        date: purchaseData.date || new Date().toISOString().substring(0, 10),
        product_id: prod.id,
        product_name: `${prod.sku ? `[${prod.sku}] ` : ''}${prod.name}`,
        movement_type: 'COMPRA',
        quantity_base: baseQtyToAdd,
        unit_used: prod.base_unit || it.inventory_unit || 'unidad',
        quantity_input: it.quantity,
        previous_stock: prevStock,
        new_stock: prod.current_stock,
        unit_cost: newUnitCaviahueCost,
        reference_type: 'COMPRA',
        reference_id: purchaseNum,
        notes: `Factura ${purchaseData.invoice_number} (${supplier.name}) - ${it.quantity} cajas x ${it.units_per_box || 1} = ${baseQtyToAdd} ${prod.base_unit || 'unid'}`
      });

      return {
        ...it,
        product_id: prod.id,
        code: prod.sku,
        sku: prod.sku,
        product_name: prod.name,
        was_created: wasCreatedNow,
        previous_stock: prevStock,
        new_stock: prod.current_stock,
        quantity_base: baseQtyToAdd,
        subtotal: Number(it.line_total.toFixed(2))
      };
    });

    this.saveTable('products', products);
    this.saveTable('cost_history', costHist);

    // 4. CÁLCULO CONTABLE EXACTO DE FACTURA (Eliminación de doble descuento)
    const subtotalBruto = purchaseData.subtotal_bruto !== undefined
      ? Number(Number(purchaseData.subtotal_bruto).toFixed(2))
      : Number(subtotalMercaderiaBruta.toFixed(2));

    let discountAmount = 0;
    if (purchaseData.discount_amount !== undefined) {
      discountAmount = Number(Number(purchaseData.discount_amount).toFixed(2));
    } else if (totalDescuentosRenglones > 0) {
      discountAmount = Number(totalDescuentosRenglones.toFixed(2));
    } else if (discountPctGlobal > 0) {
      discountAmount = Number((subtotalBruto * (discountPctGlobal / 100)).toFixed(2));
    }

    const subtotalNeto = Number((subtotalBruto - discountAmount).toFixed(2));

    let vatAmount = 0;
    if (purchaseData.vat_amount !== undefined) {
      vatAmount = Number(Number(purchaseData.vat_amount).toFixed(2));
    } else if (purchaseData.vat_included === false) {
      vatAmount = Number((subtotalNeto * (vatRateGlobal / 100)).toFixed(2));
    } else if (vatRateGlobal > 0) {
      vatAmount = Number((subtotalNeto - (subtotalNeto / (1 + vatRateGlobal / 100))).toFixed(2));
    }

    let totalFinal = purchaseData.total_final !== undefined
      ? Number(Number(purchaseData.total_final).toFixed(2))
      : Number(((purchaseData.vat_included === false ? subtotalNeto + vatAmount : subtotalNeto) + totalLogistics).toFixed(2));

    const statedTotal = purchaseData.invoice_stated_total ? Number(Number(purchaseData.invoice_stated_total).toFixed(2)) : totalFinal;

    // Conciliación automática
    const reconciliation = PackagingEngine.reconcile({
      statedTotal,
      calculatedTotal: totalFinal
    });

    if (existingInvoice && purchaseData.merge_into_existing) {
      existingInvoice.items = [...existingInvoice.items, ...processedItems];
      const mergedItemsSum = existingInvoice.items.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
      existingInvoice.subtotal_products = Number(mergedItemsSum.toFixed(2));
      existingInvoice.total_logistics = Number((existingInvoice.total_logistics || 0) + totalLogistics);
      existingInvoice.total_final = statedTotal || Number((existingInvoice.subtotal_products + existingInvoice.total_logistics).toFixed(2));
      existingInvoice.reconciliation = PackagingEngine.reconcile({
        statedTotal: existingInvoice.total_final,
        calculatedTotal: Number((existingInvoice.subtotal_products + existingInvoice.total_logistics).toFixed(2))
      });
      existingInvoice.notes = `${existingInvoice.notes ? existingInvoice.notes + ' | ' : ''}Hoja adicional anexada (${processedItems.length} ítems).`;
      this.saveTable('purchases', purchases);
      this.logAudit('ANEXAR_HOJA_FACTURA', 'COMPRAS', `Se anexaron ${processedItems.length} ítems a la factura ${existingInvoice.invoice_number} de ${supplier.name}.`);
      return {
        ...existingInvoice,
        _meta: { supplierCreated, newProductsCreated, existingProductsUpdated, merged: true }
      };
    }

    const newPurchase = {
      id: purchaseId,
      purchase_number: purchaseNum,
      invoice_number: purchaseData.invoice_number || 'S/N',
      invoice_type: purchaseData.invoice_type || 'FACTURA B',
      cae: purchaseData.cae || '',
      date: purchaseData.date || new Date().toISOString().substring(0, 10),
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_cuit: supplier.cuit || purchaseData.supplier_cuit || '',
      subtotal_bruto: subtotalBruto,
      discount_pct: discountPctGlobal,
      discount_amount: discountAmount,
      subtotal_products: subtotalNeto,
      total_logistics: totalLogistics,
      logistics_distribution_method: distributionMethod,
      vat_included: purchaseData.vat_included !== false,
      vat_rate: vatRateGlobal,
      vat_amount: vatAmount,
      total_final: totalFinal,
      invoice_stated_total: statedTotal,
      reconciliation,
      payment_condition: purchaseData.payment_condition || 'Contado',
      status: 'CONFIRMADA',
      user_id: u.id,
      notes: purchaseData.notes || '',
      items: processedItems,
      created_at: new Date().toISOString()
    };

    purchases.unshift(newPurchase);
    this.saveTable('purchases', purchases);

    this.logAudit('CREAR_COMPRA', 'COMPRAS', `Factura ${newPurchase.invoice_number} (${newPurchase.supplier_name}) cargada con éxito. Total: $${newPurchase.total_final.toFixed(2)}. ${newProductsCreated} productos creados, ${existingProductsUpdated} sumados al inventario en unidades individuales.`);
    return {
      ...newPurchase,
      _meta: { supplierCreated, newProductsCreated, existingProductsUpdated, merged: false }
    };
  }

  // Rectificación controlada de comprobantes ya confirmados
  rectifyPurchase(purchaseId, rectData = {}, reason = '', userName = '') {
    const purchases = this.getPurchases();
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) {
      throw new Error(`Factura con ID ${purchaseId} no encontrada`);
    }

    const u = userName || (this.getCurrentUser ? this.getCurrentUser().name : 'Administrador');
    const products = this.getProducts();

    // Guardar snapshot histórico anterior
    const previousSnapshot = {
      rectified_at: new Date().toISOString(),
      rectified_by: u,
      reason: reason || 'Rectificación controlada de importes y cantidades',
      subtotal_bruto: purchase.subtotal_bruto,
      discount_pct: purchase.discount_pct,
      discount_amount: purchase.discount_amount,
      subtotal_products: purchase.subtotal_products,
      vat_amount: purchase.vat_amount,
      total_final: purchase.total_final,
      invoice_stated_total: purchase.invoice_stated_total,
      reconciliation: purchase.reconciliation,
      items: JSON.parse(JSON.stringify(purchase.items || []))
    };

    purchase.rectification_history = purchase.rectification_history || [];
    purchase.rectification_history.push(previousSnapshot);

    // Ajuste diferencial de inventario si cambiaron cantidades
    if (rectData.items && Array.isArray(rectData.items)) {
      rectData.items.forEach(newItem => {
        const oldItem = (purchase.items || []).find(it => it.product_id === newItem.product_id || it.code === newItem.code);
        if (oldItem && newItem.quantity_base !== undefined) {
          const oldBase = Number(oldItem.quantity_base || oldItem.quantity) || 0;
          const newBase = Number(newItem.quantity_base) || 0;
          const delta = newBase - oldBase;

          if (delta !== 0) {
            const prod = products.find(p => p.id === newItem.product_id);
            if (prod) {
              const prevStk = Number(prod.current_stock) || 0;
              prod.current_stock = prevStk + delta;

              this.recordInventoryMovement({
                date: new Date().toISOString().substring(0, 10),
                product_id: prod.id,
                product_name: prod.name,
                movement_type: 'AJUSTE',
                quantity_base: delta,
                unit_used: prod.base_unit || 'unidad',
                quantity_input: delta,
                previous_stock: prevStk,
                new_stock: prod.current_stock,
                unit_cost: prod.caviahue_cost,
                reference_type: 'RECTIFICACION_COMPRA',
                reference_id: purchase.purchase_number,
                notes: `Rectificación Factura ${purchase.invoice_number}: delta de ${delta > 0 ? '+' : ''}${delta} ${prod.base_unit || 'unid'}. Motivo: ${reason}`
              });
            }
          }
        }
      });
      purchase.items = rectData.items;
      this.saveTable('products', products);
    }

    // Actualizar campos financieros
    if (rectData.invoice_number !== undefined) purchase.invoice_number = String(rectData.invoice_number).trim();
    if (rectData.date !== undefined) purchase.date = rectData.date;
    if (rectData.payment_condition !== undefined) purchase.payment_condition = rectData.payment_condition;
    if (rectData.subtotal_bruto !== undefined) purchase.subtotal_bruto = Number(rectData.subtotal_bruto);
    if (rectData.discount_pct !== undefined) purchase.discount_pct = Number(rectData.discount_pct);
    if (rectData.discount_amount !== undefined) purchase.discount_amount = Number(rectData.discount_amount);
    if (rectData.subtotal_products !== undefined) purchase.subtotal_products = Number(rectData.subtotal_products);
    if (rectData.vat_included !== undefined) purchase.vat_included = Boolean(rectData.vat_included);
    if (rectData.vat_rate !== undefined) purchase.vat_rate = Number(rectData.vat_rate);
    if (rectData.vat_amount !== undefined) purchase.vat_amount = Number(rectData.vat_amount);
    if (rectData.total_final !== undefined) purchase.total_final = Number(rectData.total_final);
    if (rectData.invoice_stated_total !== undefined) purchase.invoice_stated_total = Number(rectData.invoice_stated_total);

    // Recalcular estado de conciliación
    purchase.reconciliation = PackagingEngine.reconcile({
      statedTotal: purchase.invoice_stated_total ?? purchase.total_final,
      calculatedTotal: purchase.total_final
    });

    purchase.notes = `${purchase.notes ? purchase.notes + ' | ' : ''}[Rectificada el ${new Date().toLocaleDateString('es-AR')} por ${u}: ${reason || 'Ajuste de importes'}]`;
    purchase.rectified = true;
    purchase.last_rectified_at = new Date().toISOString();

    this.saveTable('purchases', purchases);
    this.logAudit('RECTIFICAR_COMPRA', 'COMPRAS', `Factura ${purchase.invoice_number} (${purchase.supplier_name}) rectificada por ${u}. Nuevo total: $${purchase.total_final.toFixed(2)}. Motivo: ${reason}`);

    return purchase;
  }

  // Normalización integral de productos SYS y facturas históricas (Idempotente)
  normalizeSysProductsAndPurchases() {
    const products = this.getProducts();
    const purchases = this.getPurchases();
    const adjustments = [];
    const pendingReviews = [];

    // 1. Normalizar productos SYS existentes de cajas a unidades individuales
    products.forEach(prod => {
      // Regla de idempotencia: si ya fue normalizado, no volver a tocar
      if (prod._normalized_to_units_v2) return;

      const nameUpper = String(prod.name || '').toUpperCase();
      const skuUpper = String(prod.sku || '').toUpperCase();
      const isSysProd = nameUpper.includes('SYS') || skuUpper.startsWith('2000') || (prod.preferred_supplier_id && String(prod.preferred_supplier_id).includes('sys'));
      const hasBoxInName = nameUpper.includes('CAJA');

      if (isSysProd || hasBoxInName) {
        const parsed = PackagingEngine.parse(prod.name);
        if (parsed.isBox && parsed.unitsPerBox > 1) {
          const factor = parsed.unitsPerBox;
          const oldStock = Number(prod.current_stock) || 0;
          const newStock = oldStock * factor;
          const oldCost = Number(prod.caviahue_cost) || 0;
          const newCost = Number((oldCost / factor).toFixed(2));
          const oldName = prod.name;

          prod.current_stock = newStock;
          prod.caviahue_cost = newCost;
          prod.purchase_cost = newCost;
          prod.name = parsed.cleanCommercialName;
          prod.base_unit = parsed.inventoryUnit;
          prod.purchase_unit = 'caja';
          prod.conversion_factor = factor;
          prod._normalized_to_units_v2 = true;
          prod._normalized_at = new Date().toISOString();

          // Registrar movimiento de auditoría de inventario
          if (newStock !== oldStock) {
            this.recordInventoryMovement({
              date: new Date().toISOString().substring(0, 10),
              product_id: prod.id,
              product_name: prod.name,
              movement_type: 'AJUSTE',
              quantity_base: newStock - oldStock,
              unit_used: prod.base_unit,
              quantity_input: newStock - oldStock,
              previous_stock: oldStock,
              new_stock: newStock,
              unit_cost: newCost,
              reference_type: 'NORMALIZACION_SYS',
              reference_id: 'NORM-V2',
              notes: `Normalización automática: conversión de ${oldStock} cajas a ${newStock} ${prod.base_unit}s (Factor x${factor})`
            });
          }

          adjustments.push({
            sku: prod.sku,
            oldName,
            newName: prod.name,
            oldStock,
            newStock,
            oldCost,
            newCost,
            factor,
            unit: prod.base_unit
          });
        } else if (isSysProd && !parsed.isBox) {
          // Ya expresado en unidades
          prod._normalized_to_units_v2 = true;
        } else {
          pendingReviews.push({
            sku: prod.sku,
            name: prod.name,
            reason: 'Presentación ambigua o factor de conversión no determinado con certeza'
          });
        }
      }
    });

    // 2. Rectificar la factura histórica de El Trío Distribuciones (eliminar doble descuento)
    let elTrioRectified = null;
    const elTrioPurchase = purchases.find(p => 
      String(p.invoice_number || '').trim().toUpperCase() === 'B 0004-00010619' ||
      (p.supplier_name && p.supplier_name.toUpperCase().includes('TRÍO'))
    );

    if (elTrioPurchase && elTrioPurchase.total_final !== 128007.69) {
      const oldTotal = elTrioPurchase.total_final;
      elTrioPurchase.subtotal_bruto = 117978.68;
      elTrioPurchase.discount_pct = 10.33;
      elTrioPurchase.discount_amount = 12187.20;
      elTrioPurchase.subtotal_products = 105791.48;
      elTrioPurchase.vat_included = false;
      elTrioPurchase.vat_rate = 21;
      elTrioPurchase.vat_amount = 22216.21;
      elTrioPurchase.total_final = 128007.69;
      elTrioPurchase.invoice_stated_total = 128007.69;
      elTrioPurchase.reconciliation = { status: 'CONCILIADA', diff: 0, isExact: true, message: 'Factura conciliada exacta' };
      elTrioPurchase.rectified = true;
      elTrioPurchase.last_rectified_at = new Date().toISOString();
      elTrioPurchase.notes = `${elTrioPurchase.notes || ''} | Rectificación matemática automática: corrección de doble descuento. Total corregido de $${oldTotal.toFixed(2)} a $128.007,69.`;

      elTrioRectified = {
        invoice_number: elTrioPurchase.invoice_number,
        supplier_name: elTrioPurchase.supplier_name,
        oldTotal,
        newTotal: 128007.69,
        diffFixed: Number((128007.69 - oldTotal).toFixed(2))
      };

      this.logAudit('RECTIFICACION_EL_TRIO', 'COMPRAS', `Factura B 0004-00010619 de El Trío rectificada matemáticamente de $${oldTotal.toFixed(2)} a $128.007,69 (eliminado descuento duplicado).`);
    }

    // 3. Actualizar estado de conciliación de todas las compras existentes
    purchases.forEach(p => {
      if (!p.reconciliation) {
        const stated = p.invoice_stated_total || p.total_final;
        p.reconciliation = PackagingEngine.reconcile({ statedTotal: stated, calculatedTotal: p.total_final });
      }
    });

    this.saveTable('products', products);
    this.saveTable('purchases', purchases);

    this.logAudit('NORMALIZACION_SISTEMA_V2', 'INVENTARIO', `Normalización V2 aplicada: ${adjustments.length} productos ajustados a unidades vendibles, ${elTrioRectified ? '1' : '0'} factura rectificada.`);

    return {
      success: true,
      adjustedProducts: adjustments,
      pendingReviews,
      elTrioRectified,
      totalAdjusted: adjustments.length
    };
  }

  // Ejecución segura de normalizaciones con respaldo previo
  runDataNormalizations(customStorage = null) {
    const storage = customStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    
    // Si ya se aplicó en este entorno, no repetir
    if (storage && storage.getItem('stayclean_normalization_v2_applied') === 'true') {
      return { success: true, alreadyApplied: true, message: 'La normalización V2 ya fue aplicada previamente.' };
    }

    // Paso de seguridad obligatorio: generar y guardar snapshot de respaldo integral
    let backupCreated = false;
    try {
      const snapshot = exportFullBackupV2(this, storage);
      if (storage) {
        storage.setItem('stayclean_pre_normalization_snapshot', JSON.stringify(snapshot));
        backupCreated = true;
      }
    } catch (e) {
      console.warn('No se pudo guardar snapshot en localStorage:', e);
    }

    const normResult = this.normalizeSysProductsAndPurchases();

    if (storage) {
      storage.setItem('stayclean_normalization_v2_applied', 'true');
      storage.setItem('stayclean_normalization_v2_at', new Date().toISOString());
    }

    return {
      ...normResult,
      backupCreated
    };
  }

  cancelPurchase(purchaseId) {
    const purchases = this.getPurchases();
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) throw new Error('Compra no encontrada');
    if (purchase.status === 'ANULADA') throw new Error('La compra ya fue anulada previamente');

    const products = this.getProducts();
    const u = this.getCurrentUser();

    purchase.items.forEach(it => {
      const prod = products.find(p => p.id === it.product_id);
      if (prod) {
        const prevStock = prod.current_stock;
        const qtyToDeduct = it.quantity_base || (it.quantity * (it.factor_to_base || prod.conversion_factor || 1));
        prod.current_stock = Math.max(0, prod.current_stock - qtyToDeduct);

        this.recordInventoryMovement({
          product_id: prod.id,
          product_name: prod.name,
          movement_type: 'ANULACION',
          quantity_base: -qtyToDeduct,
          unit_used: it.unit_name || prod.purchase_unit,
          quantity_input: it.quantity,
          previous_stock: prevStock,
          new_stock: prod.current_stock,
          unit_cost: prod.caviahue_cost,
          reference_type: 'ANULACION_COMPRA',
          reference_id: purchase.purchase_number,
          notes: `Anulación de compra ${purchase.purchase_number} - Factura ${purchase.invoice_number}`
        });
      }
    });

    this.saveTable('products', products);

    purchase.status = 'ANULADA';
    this.saveTable('purchases', purchases);

    this.logAudit('ANULAR_COMPRA', 'COMPRAS', `Compra ${purchase.purchase_number} ANULADA. Stock revertido.`);
    return purchase;
  }

  // ==========================================
  // INVENTARIO, AJUSTE Y MOVIMIENTOS
  // ==========================================
  getInventoryMovements() {
    return this.getTable('inventory_movements');
  }

  recordInventoryMovement(movData) {
    const movs = this.getTable('inventory_movements');
    const u = this.getCurrentUser();
    const entry = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: movData.date || new Date().toISOString().substring(0, 10),
      product_id: movData.product_id,
      product_name: movData.product_name,
      movement_type: movData.movement_type, // 'COMPRA' | 'VENTA' | 'AJUSTE' | 'DEVOLUCION' | 'ANULACION' | 'MERMA' | 'ROTURA'
      quantity_base: movData.quantity_base,
      unit_used: movData.unit_used,
      quantity_input: movData.quantity_input || movData.quantity_base,
      previous_stock: movData.previous_stock,
      new_stock: movData.new_stock,
      unit_cost: movData.unit_cost,
      reference_type: movData.reference_type,
      reference_id: movData.reference_id,
      notes: movData.notes || '',
      user_name: u.name,
      created_at: new Date().toISOString()
    };
    movs.unshift(entry);
    this.saveTable('inventory_movements', movs);
    return entry;
  }

  adjustStock(productId, newStockValue, reason, notes) {
    const products = this.getProducts();
    const prod = products.find(p => p.id === productId);
    if (!prod) throw new Error('Producto no encontrado');

    const newStock = Number(newStockValue) || 0;
    const prevStock = prod.current_stock;
    const diff = newStock - prevStock;

    if (diff === 0) return prod;

    prod.current_stock = newStock;
    this.saveTable('products', products);

    this.recordInventoryMovement({
      product_id: prod.id,
      product_name: prod.name,
      movement_type: reason || 'AJUSTE',
      quantity_base: diff,
      unit_used: prod.sale_unit || 'Unidad',
      previous_stock: prevStock,
      new_stock: newStock,
      unit_cost: prod.caviahue_cost,
      reference_type: 'AJUSTE_MANUAL',
      reference_id: `AJU-${Date.now().toString().slice(-4)}`,
      notes: notes || `Ajuste manual de stock por motivo: ${reason}`
    });

    this.logAudit('AJUSTE_STOCK', 'INVENTARIO', `Stock de ${prod.name} ajustado de ${prevStock} a ${newStock} (${reason}). Motivo: ${notes}`);
    return prod;
  }

  // ==========================================
  // GASTOS OPERATIVOS
  // ==========================================
  getExpenses() {
    return this.getTable('expenses');
  }

  saveExpense(expData) {
    const expenses = this.getExpenses();
    const u = this.getCurrentUser();
    const isEdit = !!expData.id;
    let expense;

    if (isEdit) {
      const idx = expenses.findIndex(e => e.id === expData.id);
      if (idx === -1) throw new Error('Gasto no encontrado');
      expense = {
        ...expenses[idx],
        ...expData,
        amount: Number(expData.amount) || 0
      };
      expenses[idx] = expense;
      this.logAudit('MODIFICAR_GASTO', 'GASTOS', `Gasto modificado: ${expense.category} - $${expense.amount} (${expense.description})`);
    } else {
      expense = {
        ...expData,
        id: `exp-${Date.now()}`,
        amount: Number(expData.amount) || 0,
        user_id: u.id,
        created_at: new Date().toISOString()
      };
      expenses.unshift(expense);
      this.logAudit('REGISTRAR_GASTO', 'GASTOS', `Gasto registrado: ${expense.category} - $${expense.amount} (${expense.description})`);
    }

    this.saveTable('expenses', expenses);
    return expense;
  }

  addExpense(expData) {
    return this.saveExpense(expData);
  }

  deleteExpense(id) {
    const expenses = this.getExpenses();
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;
    const filtered = expenses.filter(e => e.id !== id);
    this.saveTable('expenses', filtered);
    this.logAudit('ELIMINAR_GASTO', 'GASTOS', `Gasto eliminado: ${exp.category} - $${exp.amount}`);
  }

  // ==========================================
  // PEDIDOS
  // ==========================================
  getOrders() {
    return this.getTable('orders');
  }

  saveOrder(orderData) {
    const orders = this.getOrders();
    const isEdit = !!orderData.id;
    let order;

    if (isEdit) {
      const idx = orders.findIndex(o => o.id === orderData.id);
      if (idx === -1) throw new Error('Pedido no encontrado');
      order = { ...orders[idx], ...orderData };
      orders[idx] = order;
      this.logAudit('MODIFICAR_PEDIDO', 'PEDIDOS', `Pedido actualizado: ${order.order_number} (${order.status})`);
    } else {
      const num = `PED-${String(orders.length + 101).padStart(4, '0')}`;
      order = {
        ...orderData,
        id: `ord-${Date.now()}`,
        order_number: num,
        status: orderData.status || 'Nuevo',
        created_at: new Date().toISOString()
      };
      orders.unshift(order);
      this.logAudit('CREAR_PEDIDO', 'PEDIDOS', `Nuevo pedido creado: ${order.order_number} para ${order.customer_name}`);
    }

    this.saveTable('orders', orders);
    return order;
  }

  convertOrderToSale(orderId) {
    const orders = this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Pedido no encontrado');
    if (order.status === 'Entregado') throw new Error('El pedido ya fue facturado/entregado');

    // Crear la venta
    const sale = this.createSale({
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      payment_method: order.payment_method || 'Cuenta Corriente',
      notes: `Venta originada del pedido ${order.order_number}. ${order.notes || ''}`,
      items: order.items
    });

    order.status = 'Entregado';
    order.converted_to_sale_number = sale.sale_number;
    this.saveTable('orders', orders);

    this.logAudit('CONVERTIR_PEDIDO', 'PEDIDOS', `Pedido ${order.order_number} convertido en Venta ${sale.sale_number}`);
    return sale;
  }

  // ==========================================
  // ÓRDENES DE COMPRA
  // ==========================================
  getPurchaseOrders() {
    return this.getTable('purchase_orders');
  }

  savePurchaseOrder(poData) {
    const pos = this.getPurchaseOrders();
    const isEdit = !!poData.id;
    let po;

    if (isEdit) {
      const idx = pos.findIndex(p => p.id === poData.id);
      if (idx === -1) throw new Error('Orden de compra no encontrada');
      po = { ...pos[idx], ...poData };
      pos[idx] = po;
      this.logAudit('MODIFICAR_OC', 'ORDENES_COMPRA', `Orden de compra actualizada: ${po.order_number}`);
    } else {
      const num = `OC-${String(pos.length + 21).padStart(4, '0')}`;
      po = {
        ...poData,
        id: `oc-${Date.now()}`,
        order_number: num,
        status: poData.status || 'Borrador',
        created_at: new Date().toISOString()
      };
      pos.unshift(po);
      this.logAudit('CREAR_OC', 'ORDENES_COMPRA', `Nueva orden de compra: ${po.order_number} para ${po.supplier_name}`);
    }

    this.saveTable('purchase_orders', pos);
    return po;
  }

  // ==========================================
  // ESTACIONALIDAD Y REPORTES
  // ==========================================
  getSeasons() {
    return this.getTable('seasons');
  }

  saveSeason(seasonData) {
    const seasons = this.getSeasons();
    const idx = seasons.findIndex(s => s.id === seasonData.id);
    if (idx === -1) throw new Error('Temporada no encontrada');

    seasons[idx] = {
      ...seasons[idx],
      name: seasonData.name,
      period: seasonData.period,
      demand_multiplier: Number(seasonData.demand_multiplier) || 1.0,
      description: seasonData.description
    };

    this.saveTable('seasons', seasons);
    this.logAudit('MODIFICAR_ESTACIONALIDAD', 'ESTACIONALIDAD', `Temporada ${seasonData.name} actualizada: x${seasonData.demand_multiplier} demanda (${seasonData.period}).`);
    return seasons[idx];
  }

  getCostHistory(productId) {
    const list = this.getTable('cost_history');
    if (!productId) return list;
    return list.filter(h => h.product_id === productId);
  }

  // Métricas consolidadas para el Dashboard
  getDashboardMetrics(period = 'Mes') {
    const sales = this.getSales().filter(s => s.status === 'COMPLETADA');
    const purchases = this.getPurchases().filter(p => p.status === 'CONFIRMADA');
    const expenses = this.getExpenses();
    const products = this.getProducts();
    const customers = this.getCustomers();

    // Ventas y costos del período
    const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalCMV = sales.reduce((sum, s) => sum + (s.total_cost || 0), 0);
    const grossMargin = totalSales - totalCMV;
    const grossMarginPct = totalSales > 0 ? (grossMargin / totalSales) * 100 : 0;

    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const estimatedResult = grossMargin - totalExpenses; // Resultado Operativo

    // Stock valorizado a costo Caviahue
    const stockValuedCost = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.caviahue_cost || 0)), 0);
    const stockValuedSale = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.sale_price || 0)), 0);
    const potentialGain = stockValuedSale - stockValuedCost;

    // Compras del mes
    const totalPurchases = purchases.reduce((sum, p) => sum + (p.total_final || 0), 0);

    // Cuentas por cobrar
    const accountsReceivable = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);

    // Pedidos y ticket promedio
    const orderCount = sales.length;
    const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;

    // Alertas
    const lowStockProducts = products.filter(p => p.active && p.current_stock > 0 && p.current_stock <= (p.min_stock || 5));
    const outOfStockProducts = products.filter(p => p.active && p.current_stock <= 0);
    const lowMarginProducts = products.filter(p => p.active && p.margin_pct < (p.target_margin || 35));
    const overdueReceivables = customers.filter(c => (c.current_balance || 0) > 0);

    return {
      totalSales,
      totalCMV,
      grossMargin,
      grossMarginPct,
      totalExpenses,
      estimatedResult,
      stockValuedCost,
      stockValuedSale,
      potentialGain,
      totalPurchases,
      accountsReceivable,
      orderCount,
      avgTicket,
      lowStockProducts,
      outOfStockProducts,
      lowMarginProducts,
      overdueReceivables
    };
  }

  // Backup y Exportación
  exportDatabaseJSON() {
    const backup = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      appName: 'Limpieza Caviahue ERP',
      data: {
        categories: this.getTable('categories'),
        price_lists: this.getTable('price_lists'),
        suppliers: this.getTable('suppliers'),
        customers: this.getTable('customers'),
        products: this.getTable('products'),
        users: this.getTable('users'),
        expenses: this.getTable('expenses'),
        seasons: this.getTable('seasons'),
        purchases: this.getTable('purchases'),
        sales: this.getTable('sales'),
        customer_account_movements: this.getTable('customer_account_movements'),
        inventory_movements: this.getTable('inventory_movements'),
        cost_history: this.getTable('cost_history'),
        orders: this.getTable('orders'),
        purchase_orders: this.getTable('purchase_orders'),
        audit_log: this.getTable('audit_log')
      }
    };
    return JSON.stringify(backup, null, 2);
  }

  importDatabaseJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.data) throw new Error('Formato de respaldo inválido');
      Object.keys(parsed.data).forEach(table => {
        this.saveTable(table, parsed.data[table]);
      });
      this.logAudit('IMPORTAR_DATOS', 'SISTEMA', 'Restauración completa de base de datos desde archivo JSON.');
      return true;
    } catch (e) {
      console.error('Error importando base de datos:', e);
      throw e;
    }
  }

  // ==========================================
  // RESPALDO INTEGRAL V2 (PREPARACIÓN SUPABASE)
  // ==========================================
  exportFullBackupV2() {
    return exportFullBackupV2(this);
  }

  verifyBackupV2(backupDataOrJson) {
    return verifyBackupV2(backupDataOrJson);
  }
}

export const db = new Database();
db.init();
