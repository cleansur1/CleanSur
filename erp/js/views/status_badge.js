export function statusColor(status) {
  const value = String(status ?? '').trim().toUpperCase();
  if (/^(ANULAD[OA]|ELIMINAD[OA]|CANCELAD[OA]|RECHAZAD[OA])$/.test(value)) return 'bg-rose-100 text-rose-800';
  if (/^(CONFIRMAD[OA]|RECIBID[OA]|COMPLETAD[OA]|ENTREGAD[OA]|PAGAD[OA]|COBRAD[OA])$/.test(value)) return 'bg-emerald-100 text-emerald-800';
  return 'bg-amber-100 text-amber-800';
}
