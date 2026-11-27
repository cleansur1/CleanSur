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

const palette = {
  navy: '#0E3A6B',
  ink: '#092B50',
  blue: '#1E88E5',
  sky: '#8FD0F4',
  soft: '#E9F4FB',
  border: '#D8E4EC',
  muted: '#475569',
  white: '#FFFFFF'
};

let artworkPromise;
function loadArtwork() {
  if (!artworkPromise) {
    const read = async (path, format) => {
      const response = await fetch(new URL(path, import.meta.url));
      if (!response.ok) throw new Error('No se pudo cargar el diseño del remito. Volvé a intentar.');
      return response[format]();
    };
    artworkPromise = Promise.all([
      read('../assets/pwa-192.png', 'arrayBuffer'),
      read('../assets/fonts/Montserrat-Regular.ttf', 'arrayBuffer'),
      read('../assets/fonts/Montserrat-Bold.ttf', 'arrayBuffer')
    ]).catch(error => {
      artworkPromise = undefined;
      throw error;
    });
  }
  return artworkPromise;
}

export function buildOrderRemito(JsPDF, order, profile, artwork) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4', putOnlyUsedFonts: true, compress: true });
  const [logo, regular, bold] = artwork;
  for (const [style, data] of [['normal', regular], ['bold', bold]]) {
    const filename = 'Montserrat-' + style + '.ttf';
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    doc.addFileToVFS(filename, btoa(binary));
    doc.addFont(filename, 'Montserrat', style);
  }

  const number = text(order.number);
  const orderDate = new Date(order.date);
  const dateText = Number.isNaN(orderDate.getTime()) ? '' : date.format(orderDate);
  doc.setProperties({ title: ['Remito', number].filter(Boolean).join(' '), author: 'CleanSur' });
  const font = (style, size, color = palette.ink) => doc.setFont('Montserrat', style).setFontSize(size).setTextColor(color);
  const line = (left, top, right) => doc.setDrawColor(palette.border).line(left, top, right, top);
  let y;

  function header(firstPage, showColumns = true) {
    doc.setFillColor(palette.navy).rect(0, 0, 210, 3, 'F');
    doc.setFillColor(palette.sky).rect(154, 0, 56, 3, 'F');
    doc.addImage(new Uint8Array(logo), 'PNG', 15, 12, 21, 21, 'cleansur');
    font('bold', 23, palette.navy);
    doc.text('CleanSur', 40, 21);
    font('normal', 8.5, palette.muted);
    doc.text('Insumos de limpieza y descartables', 40, 27);
    doc.text('Caviahue · Copahue, Neuquén', 40, 32);
    font('bold', 16, palette.navy);
    doc.text('Remito del pedido', 195, 19, { align: 'right' });
    font('bold', 10, palette.blue);
    doc.text(number, 195, 26, { align: 'right' });
    font('normal', 8.5, palette.muted);
    doc.text(dateText, 195, 32, { align: 'right' });
    line(15, 39, 195);
    y = 46;

    if (firstPage) {
      font('normal', 10);
      const customer = doc.splitTextToSize(text(profile?.name) || '—', 104);
      const status = doc.splitTextToSize(text(order.status) || '—', 48);
      const boxHeight = 15 + Math.max(customer.length, status.length) * 4.5;
      doc.setFillColor(palette.soft).roundedRect(15, y, 180, boxHeight, 2, 2, 'F');
      font('bold', 8, palette.navy);
      doc.text('Cliente', 21, y + 6);
      doc.text('Estado del pedido', 189, y + 6, { align: 'right' });
      font('normal', 10);
      doc.text(customer, 21, y + 12);
      doc.text(status, 189, y + 12, { align: 'right' });
      y += boxHeight + 8;
    }

    if (showColumns) {
      doc.setFillColor(palette.navy).roundedRect(15, y, 180, 9, 1.5, 1.5, 'F');
      font('bold', 8.5, palette.white);
      doc.text('Producto y presentación', 19, y + 6);
      doc.text('Cant.', 128, y + 6, { align: 'right' });
      doc.text('P. unitario', 159, y + 6, { align: 'right' });
      doc.text('Importe', 191, y + 6, { align: 'right' });
      y += 10;
    }
  }

  header(true);
  const items = Array.isArray(order.items) ? order.items : [];
  for (const [index, item] of items.entries()) {
    font('normal', 9);
    const description = [item.product_name, item.unit_name, item.aroma].map(text).filter(Boolean).join(' · ');
    const lines = doc.splitTextToSize(description, 97).slice(0, 20);
    const height = Math.max(10, lines.length * 4.3 + 5);
    if (y + height > 261) {
      doc.addPage();
      header(false);
      font('normal', 9);
    }
    if (index % 2 === 0) doc.setFillColor('#F6F9FC').rect(15, y, 180, height, 'F');
    doc.text(lines, 19, y + 6, { lineHeightFactor: 1.35 });
    doc.text(text(item.quantity), 128, y + 6, { align: 'right' });
    doc.text(amount(item.unit_price), 159, y + 6, { align: 'right' });
    font('bold', 9);
    doc.text(amount(item.subtotal), 191, y + 6, { align: 'right' });
    line(15, y + height, 195);
    y += height;
  }

  if (y + 24 > 269) {
    doc.addPage();
    header(false, false);
  }
  doc.setFillColor(palette.soft).roundedRect(112, y + 6, 83, 17, 2, 2, 'F');
  font('bold', 9, palette.navy);
  doc.text('Total del pedido', 118, y + 16.5);
  font('bold', 13, palette.navy);
  doc.text(amount(order.total), 190, y + 16.5, { align: 'right' });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    line(15, 275, 195);
    font('normal', 7.2, palette.muted);
    doc.text('Detalle del pedido. Sin validez como factura ni constancia de pago o entrega.', 15, 282);
    doc.text('Página ' + page + ' de ' + pageCount, 195, 282, { align: 'right' });
  }
  return doc;
}

export async function downloadOrderRemito(order, profile) {
  const [JsPDF, artwork] = await Promise.all([loadPdf(), loadArtwork()]);
  const filename = text(order.number).replace(/[^a-zA-Z0-9_-]/g, '') || 'pedido';
  buildOrderRemito(JsPDF, order, profile, artwork).save('CleanSur-Remito-' + filename + '.pdf');
}
