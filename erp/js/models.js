// Modelos matemáticos y utilidades financieras para Limpieza Caviahue
// Formato Argentino: Moneda $ 1.250.450,00 | Fechas DD/MM/AAAA

export const Formatter = {
  // Formato de moneda ARS ($ 1.250.450,00)
  money(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) amount = 0;
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount).replace('ARS', '$');
  },

  currency(amount) {
    return this.money(amount);
  },

  // Formato numérico con separador de miles y decimales
  number(num, decimals = 2) {
    if (num === null || num === undefined || isNaN(num)) num = 0;
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  },

  // Formato porcentaje (42,50 %)
  percent(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) val = 0;
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(val) + ' %';
  },

  // Formato fecha DD/MM/AAAA
  date(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  },

  // Formato fecha y hora DD/MM/AAAA HH:mm
  dateTime(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return dateStr;
    }
  }
};

export const Formatters = Formatter;

export const PricingCalculator = {
  // Margen % = (Precio - Costo) / Precio * 100
  calcMarginPct(cost, price) {
    if (!price || price <= 0) return 0;
    return ((price - cost) / price) * 100;
  },

  // Markup % = (Precio - Costo) / Costo * 100
  calcMarkupPct(cost, price) {
    if (!cost || cost <= 0) return 0;
    return ((price - cost) / cost) * 100;
  },

  // Precio sugerido según margen objetivo: Costo / (1 - margen_objetivo / 100)
  calcSuggestedPrice(cost, targetMarginPct) {
    if (!cost || cost <= 0) return 0;
    const marginRatio = (targetMarginPct || 0) / 100;
    if (marginRatio >= 1) return cost * 2; // Evitar división por cero
    const rawPrice = cost / (1 - marginRatio);
    return this.smartRound(rawPrice);
  },

  // Redondeo inteligente argentino (ej. $9.437 -> $9.500)
  smartRound(val) {
    if (!val || val <= 0) return 0;
    if (val < 100) {
      return Math.round(val);
    } else if (val < 1000) {
      // Redondear a decenas (ej: 437 -> 440)
      return Math.ceil(val / 10) * 10;
    } else if (val < 10000) {
      // Redondear a cincuentenas o centenas (ej: 9437 -> 9500)
      return Math.ceil(val / 50) * 50;
    } else {
      // Redondear a centenas (ej: 34210 -> 34300)
      return Math.ceil(val / 100) * 100;
    }
  }
};

export const LogisticsCostDistributor = {
  // Distribución automática de gastos logísticos de flete puesto en Caviahue
  // Métodos: 'VALOR' | 'CANTIDAD' | 'MANUAL'
  distribute(items, totalLogistics, method = 'VALOR') {
    if (!items || items.length === 0) return [];
    if (!totalLogistics || totalLogistics <= 0) {
      return items.map(it => ({
        ...it,
        allocated_logistics: 0,
        unit_caviahue_cost: it.unit_invoice_cost || 0
      }));
    }

    if (method === 'VALOR') {
      const totalValue = items.reduce((sum, it) => sum + ((it.quantity || 1) * (it.unit_invoice_cost || 0)), 0);
      return items.map(it => {
        const itemVal = (it.quantity || 1) * (it.unit_invoice_cost || 0);
        const ratio = totalValue > 0 ? (itemVal / totalValue) : (1 / items.length);
        const allocated = totalLogistics * ratio;
        const perUnitLogistics = it.quantity > 0 ? (allocated / it.quantity) : 0;
        return {
          ...it,
          allocated_logistics: allocated,
          unit_caviahue_cost: (it.unit_invoice_cost || 0) + perUnitLogistics
        };
      });
    } else if (method === 'CANTIDAD') {
      const totalQty = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
      return items.map(it => {
        const ratio = totalQty > 0 ? ((it.quantity || 1) / totalQty) : (1 / items.length);
        const allocated = totalLogistics * ratio;
        const perUnitLogistics = it.quantity > 0 ? (allocated / it.quantity) : 0;
        return {
          ...it,
          allocated_logistics: allocated,
          unit_caviahue_cost: (it.unit_invoice_cost || 0) + perUnitLogistics
        };
      });
    } else {
      // MANUAL: conserva el allocated_logistics que ya traía cada ítem
      return items.map(it => {
        const allocated = it.allocated_logistics || 0;
        const perUnitLogistics = it.quantity > 0 ? (allocated / it.quantity) : 0;
        return {
          ...it,
          allocated_logistics: allocated,
          unit_caviahue_cost: (it.unit_invoice_cost || 0) + perUnitLogistics
        };
      });
    }
  }
};

export const InventoryAnalytics = {
  // Cálculo de Días de Stock = Stock Actual / Venta Promedio Diaria
  calcCoverageDays(currentStock, dailyAvgSales) {
    if (!dailyAvgSales || dailyAvgSales <= 0) return 999; // Cobertura indefinida
    return Math.round(currentStock / dailyAvgSales);
  },

  // Reposición inteligente: cálculo de cantidad sugerida
  calcSuggestedReorder(currentStock, minStock, dailyAvgSales, targetDays = 30, leadTimeDays = 7) {
    const safetyBuffer = dailyAvgSales * leadTimeDays;
    const targetStock = (dailyAvgSales * targetDays) + safetyBuffer;
    if (currentStock <= minStock || currentStock <= safetyBuffer) {
      return Math.max(0, Math.ceil(targetStock - currentStock));
    }
    return 0;
  }
};

/**
 * Motor de Desglose de Cajas a Unidades Vendibles & Conciliación Matemática
 * Regla StayClean: Compra en cajas, venta en unidades individuales (bidones, botellas, etc.)
 */
export const PackagingEngine = {
  toTitleCase(str) {
    return String(str || '')
      .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
      .replace(/\bLts?\b/gi, 'Lts')
      .replace(/\bLt\b/gi, 'Lt')
      .replace(/\bMl\b/gi, 'ml')
      .replace(/\bCc\b/gi, 'cc')
      .replace(/\bGr\b/gi, 'g');
  },

  parse(description, invoiceQty = 1, rawUnitPrice = 0, lineTotalStated = 0) {
    const desc = String(description || '').trim();
    const descUpper = desc.toUpperCase();

    let isBox = false;
    let unitsPerBox = 1;
    let unitCapacity = '';
    let inventoryUnit = 'unidad';
    let cleanName = desc;

    // 1. Detectar palabras clave de empaque colectivo
    if (/\b(CAJA|PACK|BULTO|PAQUETE)\b/i.test(descUpper)) {
      isBox = true;
    }

    // 2. Patrón explícito: "CON 5 BIDONES DE 5 LTS" o "C/ 4 BIDONES X 5 LTS"
    const conBidonesPattern = /\b(?:CON|C\/)?\s*(\d+)\s*(?:BIDONES|BOTELLAS|UNID|UNIDADES)\s*(?:DE|X|\*)\s*(\d+(?:[.,]\d+)?\s*(?:LTS?|LT|LITROS?|CC|ML|GRS?|GR|KG))/i;
    const conBidonesMatch = descUpper.match(conBidonesPattern);

    // 3. Patrón estándar proveedor: "4 UNID X 5 LTS" o "20 UNID X 1 LT" o "X 4 UNID X 5 LTS"
    const multiPattern = /(?:X\s*)?(\d+)\s*(?:UNID|U\.|UNIDADES|U|UN)\.?\s*(?:X|\*)\s*(\d+(?:[.,]\d+)?\s*(?:LTS?|LT|LITROS?|CC|ML|GRS?|GR|KILOS?|KG))/i;
    const multiMatch = descUpper.match(multiPattern);

    if (conBidonesMatch) {
      isBox = true;
      unitsPerBox = parseInt(conBidonesMatch[1], 10) || 1;
      unitCapacity = conBidonesMatch[2].trim();
    } else if (multiMatch) {
      isBox = true;
      unitsPerBox = parseInt(multiMatch[1], 10) || 1;
      unitCapacity = multiMatch[2].trim();
    } else {
      // 4. Patrón de unidades sin capacidad inmediata: "20 UNID" o "CAJA X 100 UNID"
      const singlePattern = /\b(?:X\s*)?(\d+)\s*(?:UNID|U\.|UNIDADES|U|UN)\b/i;
      const singleMatch = descUpper.match(singlePattern);
      if (singleMatch) {
        const num = parseInt(singleMatch[1], 10);
        if (descUpper.includes('GUANTE') && num >= 50) {
          isBox = false;
          unitsPerBox = 1;
          unitCapacity = `Caja x ${num}`;
          inventoryUnit = 'caja';
        } else {
          isBox = true;
          unitsPerBox = num || 1;
        }
      } else {
        // 5. Patrón "CAJA 20 LAVANDINA" o "CAJA X 20 BIDONES"
        const cajaNumPattern = /\b(?:CAJA|PACK|BULTO)\s+(?:DE\s+|X\s*)?(\d+)\s+(?:BIDONES|BOTELLAS|UNID|UNIDADES|[A-Z]+)/i;
        const cajaNumMatch = descUpper.match(cajaNumPattern);
        if (cajaNumMatch) {
          const num = parseInt(cajaNumMatch[1], 10);
          if (num > 1) {
            isBox = true;
            unitsPerBox = num;
          }
        }
      }
    }

    // Extracción de capacidad si no fue capturada antes
    if (!unitCapacity) {
      const capMatch = descUpper.match(/(\d+(?:[.,]\d+)?\s*(?:LTS?|LT|LITROS?|CC|ML|GRS?|GR|KILOS?|KG))/i);
      if (capMatch) {
        unitCapacity = capMatch[1].trim();
      }
    }

    // Determinar unidad de inventario real (bidón, botella, gatillo, paño, etc.)
    if (unitCapacity && /(?:LTS?|LT|LITROS?)/i.test(unitCapacity)) {
      const numLitros = parseFloat(unitCapacity.replace(/,/g, '.'));
      inventoryUnit = numLitros >= 3 ? 'bidón' : 'botella';
    } else if (descUpper.includes('GATILLO')) {
      inventoryUnit = 'gatillo';
    } else if (descUpper.includes('FRANELA') || descUpper.includes('TRAPO') || descUpper.includes('PISO')) {
      inventoryUnit = 'paño';
    } else if (descUpper.includes('ESPONJA') || descUpper.includes('FIBRA')) {
      inventoryUnit = 'unidad';
    } else if (descUpper.includes('GUANTE')) {
      inventoryUnit = descUpper.includes('DESCART') ? 'caja' : 'par';
    }

    // Limpieza de nombre comercial para el catálogo
    cleanName = desc
      .replace(/\b(?:CAJA|PACK|BULTO)\s+(?:DE\s+|X\s*|CON\s+)?\d+\s*/gi, '')
      .replace(/\bCAJA\s+(?:DE\s+|CON\s+)?/gi, '')
      .replace(/\bCAJA\b/gi, '')
      .replace(/(?:CON|C\/)?\s*\d+\s*(?:BIDONES|BOTELLAS|UNID|UNIDADES)\s*(?:DE|X|\*)\s*\d+(?:[.,]\d+)?\s*(?:LTS?|LT|LITROS?|CC|ML|GRS?|GR|KG)/gi, '')
      .replace(/(?:X\s*)?\d+\s*(?:UNID|U\.|UNIDADES|U|UN)\.?\s*(?:X|\*)\s*\d+(?:[.,]\d+)?\s*(?:LTS?|LT|LITROS?|CC|ML|GRS?|GR|KG)/gi, '')
      .replace(/\b(?:X\s*)?\d+\s*(?:UNID|U\.|UNIDADES|U|UN)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (unitCapacity && !cleanName.toUpperCase().includes(unitCapacity.toUpperCase())) {
      cleanName = `${cleanName} ${unitCapacity}`;
    }

    cleanName = this.toTitleCase(cleanName.replace(/\s+/g, ' ').trim());

    // Interpretación del precio: ¿Precio por caja o precio por unidad?
    const qty = Number(invoiceQty) || 1;
    const rawPrice = Number(rawUnitPrice) || 0;
    const lineTotal = Number(lineTotalStated) || (qty * rawPrice);
    const totalUnits = isBox ? (qty * unitsPerBox) : qty;

    let pricingMode = 'PER_UNIT';
    let costPerSaleableUnit = rawPrice;
    let saleableUnits = qty;

    if (isBox && unitsPerBox > 1) {
      saleableUnits = totalUnits;
      const diffIfPerBox = Math.abs((qty * rawPrice) - lineTotal);
      const diffIfPerUnit = Math.abs((totalUnits * rawPrice) - lineTotal);

      // Si el total de la factura coincide con (cajas * precio), el precio es POR CAJA
      if (diffIfPerBox <= diffIfPerUnit && diffIfPerBox < 0.1) {
        pricingMode = 'PER_BOX';
        costPerSaleableUnit = Number((rawPrice / unitsPerBox).toFixed(2));
      } else if (diffIfPerUnit < 0.1) {
        // Si el total de la factura coincide con (unidades * precio), el precio ya venía POR UNIDAD
        pricingMode = 'PER_UNIT';
        costPerSaleableUnit = rawPrice;
      } else {
        // En cajas, por defecto el precio facturado corresponde a la caja completa
        pricingMode = 'PER_BOX';
        costPerSaleableUnit = Number((rawPrice / unitsPerBox).toFixed(2));
      }
    } else {
      pricingMode = 'PER_UNIT';
      costPerSaleableUnit = rawPrice;
      saleableUnits = qty;
    }

    return {
      isBox,
      unitsPerBox,
      unitCapacity,
      inventoryUnit,
      cleanCommercialName: cleanName,
      pricingMode,
      saleableUnits,
      costPerSaleableUnit,
      lineTotalCalculated: Number((saleableUnits * costPerSaleableUnit).toFixed(2))
    };
  },

  calculate({ boxesCount = 1, unitsPerBox = 1, pricingMode = 'PER_BOX', rawUnitPrice = 0, discountPct = 0 }) {
    const boxes = Number(boxesCount) || 1;
    const factor = Number(unitsPerBox) || 1;
    const price = Number(rawUnitPrice) || 0;
    const disc = Number(discountPct) || 0;

    const saleableUnits = Math.round(boxes * factor);
    let grossCostPerUnit = 0;
    let lineTotalBruto = 0;

    if (pricingMode === 'PER_BOX') {
      grossCostPerUnit = factor > 0 ? (price / factor) : price;
      lineTotalBruto = boxes * price;
    } else {
      grossCostPerUnit = price;
      lineTotalBruto = saleableUnits * price;
    }

    const discountAmount = lineTotalBruto * (disc / 100);
    const lineTotalNeto = lineTotalBruto - discountAmount;
    const netCostPerUnit = saleableUnits > 0 ? (lineTotalNeto / saleableUnits) : grossCostPerUnit;

    return {
      saleableUnits,
      lineTotalBruto: Number(lineTotalBruto.toFixed(2)),
      lineSubtotalBruto: Number(lineTotalBruto.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      lineDiscountAmount: Number(discountAmount.toFixed(2)),
      lineTotalNeto: Number(lineTotalNeto.toFixed(2)),
      lineNetTotal: Number(lineTotalNeto.toFixed(2)),
      grossCostPerUnit: Number(grossCostPerUnit.toFixed(2)),
      effectiveUnitPrice: Number(grossCostPerUnit.toFixed(2)),
      netCostPerUnit: Number(netCostPerUnit.toFixed(2))
    };
  },

  reconcile({ statedTotal = 0, calculatedTotal = 0, tolerance = 0.01 }) {
    const stated = Number(statedTotal) || 0;
    const calculated = Number(calculatedTotal) || 0;
    if (!stated && !calculated) return { status: 'PENDIENTE', diff: 0, isExact: true, message: 'Pendiente de verificación' };
    if (!stated) return { status: 'PENDIENTE', diff: 0, isExact: true, message: 'Sin total original cargado' };

    const diff = Number((calculated - stated).toFixed(2));
    const isExact = Math.abs(diff) <= tolerance;

    return {
      status: isExact ? 'CONCILIADA' : 'DIFERENCIA',
      diff,
      isExact,
      message: isExact ? 'Factura conciliada exacta' : `Diferencia de $${Math.abs(diff).toFixed(2)} (${diff > 0 ? 'ERP mayor' : 'Factura mayor'})`
    };
  }
};
