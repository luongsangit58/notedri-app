/**
 * Format a number as Vietnamese dong: 1000000 → "1.000.000đ"
 * React Native's Hermes engine doesn't reliably support vi-VN locale,
 * so we implement the dot-separator manually.
 */
export function formatVND(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount))) return '—';
  const n = Math.round(Number(amount));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

/** Short form: 1.500.000 → "1,5tr", 25.000 → "25k" */
export function formatVNDShort(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return (Number.isInteger(m) ? m.toString() : m.toFixed(1)) + 'tr';
  }
  if (amount >= 1_000) return Math.round(amount / 1_000) + 'k';
  return formatVND(amount);
}

/** Format km with dot separator: 123456 → "123.456 km" */
export function formatKm(km: number | null | undefined): string {
  if (km == null || isNaN(Number(km))) return '—';
  const n = Math.round(Number(km));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' km';
}

/** Format liters: 45.3 → "45,30 L" */
export function formatLiters(liters: number | null | undefined): string {
  if (liters == null || isNaN(Number(liters))) return '—';
  return Number(liters).toFixed(2).replace('.', ',') + ' L';
}

/** Format price per liter: 21450 → "21.450đ/L" */
export function formatPricePerLiter(price: number | null | undefined): string {
  if (price == null) return '—';
  return formatVND(price) + '/L';
}
