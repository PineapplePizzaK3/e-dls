/** Margem do produto: preço final exibido = base × multiplicador. */

export function normalizeMarginMultiplier(value, fallback = 1) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

export function computeFinalPriceJpy(basePriceJpy, marginMultiplier) {
  const base = Math.max(0, Number(basePriceJpy) || 0)
  const margin = normalizeMarginMultiplier(marginMultiplier, 1)
  return Math.round(base * margin)
}

export function resolveProductBasePriceJpy(product) {
  const base = Number(product?.base_price_jpy)
  if (Number.isFinite(base) && base >= 0) return base
  const jpy = Number(product?.price_jpy ?? product?.price)
  return Number.isFinite(jpy) && jpy >= 0 ? jpy : 0
}

export function resolveProductMarginMultiplier(product) {
  return normalizeMarginMultiplier(product?.margin_multiplier, 1)
}
