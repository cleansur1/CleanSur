const pdfSource = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const pdfIntegrity = 'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3';
let pdfLibrary;

function loadPdf() {
  if (globalThis.jspdf?.jsPDF) return Promise.resolve(globalThis.jspdf.jsPDF);
  if (!pdfLibrary) {
    pdfLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfSource;
      script.integrity = pdfIntegrity;
      script.crossOrigin = 'anonymous';
      const fail = () => {
        script.remove();
        pdfLibrary = undefined;
        reject(new Error('No se pudo cargar el generador de PDF. Volvé a intentar.'));
      };
      script.onload = () => globalThis.jspdf?.jsPDF ? resolve(globalThis.jspdf.jsPDF) : fail();
      script.onerror = fail;
      document.head.append(script);
    });
  }
  return pdfLibrary;
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const text = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
const amount = value => value == null || !Number.isFinite(Number(value)) ? '—' : money.format(Number(value));

export function buildOrderRemito(JsPDF, order, profile) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const number = text(order.number);
  const orderDate = new Date(order.date);
  const dateText = Number.isNaN(orderDate.getTime()) ? '' : date.format(orderDate);
  const navy = '#0E3A6B';
  let y;
  const font = (style, size, color = navy) => doc.setFont('helvetica', style).setFontSize(size).setTextColor(color);

  function header(firstPage) {
    doc.setFillColor(navy).rect(0, 0, 210, 36, 'F');
    font('bold', 23, '#FFFFFF');
    doc.text('CleanSur', 15, 16);
    font('normal', 9, '#FFFFFF');
    doc.text('Insumos de limpieza y descartables', 15, 23);
    doc.text('Caviahue · Copahue, Neuquén', 15, 28);
    font('bold', 14, '#FFFFFF');
    doc.text('REMITO DEL PEDIDO', 195, 16, { align: 'right' });
    font('normal', 10, '#FFFFFF');
    doc.text([number, dateText].filter(Boolean).join('  ·  '), 195, 24, { align: 'right' });
    y = 45;
    if (firstPage) {
      font('normal', 10);
      const customer = doc.splitTextToSize(text(profile?.name), 125).slice(0, 3);
      doc.text('Cliente', 15, y);
      doc.text(customer, 15, y + 5);
      doc.text(text(order.status), 195, y, { align: 'right', maxWidth: 50 });
      y += 12 + customer.length * 5;
    }
    doc.setFillColor('#E9F4FB').rect(15, y, 180, 8, 'F');
    font('bold', 9);
    doc.text('Producto y presentación', 17, y + 5.5);
    doc.text('Cant.', 132, y + 5.5, { align: 'right' });
    doc.text('P. unitario', 161, y + 5.5, { align: 'right' });
    doc.text('Importe', 193, y + 5.5, { align: 'right' });
    y += 12;
  }

  header(true);
  for (const item of Array.isArray(order.items) ? order.items : []) {
    font('normal', 10);
    const description = [item.product_name, item.unit_name, item.aroma].map(text).filter(Boolean).join(' · ');
    const lines = doc.splitTextToSize(description, 100).slice(0, 20);
    const height = Math.max(9, lines.length * 5 + 4);
    if (y + height > 267) {
      doc.addPage();
      header(false);
      font('normal', 10);
    }
    doc.text(lines, 17, y);
    doc.text(text(item.quantity), 132, y, { align: 'right' });
    doc.text(amount(item.unit_price), 161, y, { align: 'right' });
    doc.text(amount(item.subtotal), 193, y, { align: 'right' });
    doc.setDrawColor('#D8E4EC').line(15, y + height - 5, 195, y + height - 5);
    y += height;
  }

  if (y + 13 > 267) {
    doc.addPage();
    header(false);
  }
  font('bold', 13);
  doc.text('Total ' + amount(order.total), 193, y + 6, { align: 'right' });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    font('normal', 8, '#475569');
    doc.text('Detalle del pedido. Sin validez como factura ni constancia de pago o entrega.', 15, 282);
    doc.text(String(page) + ' / ' + doc.getNumberOfPages(), 195, 282, { align: 'right' });
  }
  return doc;
}

export async function downloadOrderRemito(order, profile) {
  const JsPDF = await loadPdf();
  const filename = text(order.number).replace(/[^a-zA-Z0-9_-]/g, '') || 'pedido';
  buildOrderRemito(JsPDF, order, profile).save('CleanSur-Remito-' + filename + '.pdf');
}
