function normalizeTemplateFields(template) {
  const raw = Array.isArray(template?.fields) ? template.fields : []
  const seen = new Set()
  return raw
    .map((field) => {
      const key = String(field?.key || '').trim()
      if (!key || seen.has(key)) return null
      seen.add(key)
      const label = String(field?.label || key).trim()
      const unit = String(field?.unit || '').trim()
      const order = Number(field?.order) || 0
      const type = String(field?.type || 'text').trim()
      return { key, label, unit, order, type }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

function normalizeMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function formatValue(raw, type, unit) {
  if (raw == null || raw === '') return ''
  if (type === 'boolean') {
    if (raw === true) return 'Sim'
    if (raw === false) return 'Não'
    const txt = String(raw).trim().toLowerCase()
    if (['true', 'sim', '1'].includes(txt)) return 'Sim'
    if (['false', 'nao', 'não', '0'].includes(txt)) return 'Não'
  }
  if (type === 'number') {
    const num = Number(raw)
    if (Number.isFinite(num)) {
      const out = Number.isInteger(num) ? String(num) : num.toLocaleString('pt-BR')
      return unit ? `${out} ${unit}` : out
    }
  }
  const text = String(raw).trim()
  if (!text) return ''
  return unit ? `${text} ${unit}` : text
}

export default function ProductTechnicalSpecs({ template, specs, title = 'Características técnicas', className = '' }) {
  const map = normalizeMap(specs)
  const templateFields = normalizeTemplateFields(template)

  let entries = []
  if (templateFields.length > 0) {
    entries = templateFields
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: formatValue(map[field.key], field.type, field.unit),
      }))
      .filter((item) => item.value)
  } else {
    entries = Object.entries(map)
      .map(([key, raw]) => ({
        key,
        label: key,
        value: formatValue(raw, 'text', ''),
      }))
      .filter((item) => item.value)
  }

  if (entries.length === 0) return null

  return (
    <section className={`mt-4 rounded-xl border border-earth-200 bg-earth-50 p-4 ${className}`.trim()}>
      <h2 className="text-sm font-semibold text-earth-900">{title}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map((item) => (
          <div key={item.key} className="rounded-lg bg-white px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-earth-500">{item.label}</dt>
            <dd className="mt-0.5 text-sm text-earth-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
