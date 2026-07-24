function normalizeFields(template) {
  const raw = Array.isArray(template?.fields) ? template.fields : []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const key = String(item.key || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const type = String(item.type || 'text').trim()
    out.push({
      key,
      label: String(item.label || key).trim(),
      type: ['text', 'number', 'boolean', 'select'].includes(type) ? type : 'text',
      unit: String(item.unit || '').trim(),
      required: Boolean(item.required),
      options: Array.isArray(item.options)
        ? item.options.map((opt) => String(opt || '').trim()).filter(Boolean)
        : [],
      order: Number(item.order) || 0,
    })
  }
  return out.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

function getValueMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

export default function ProductTechnicalSpecsEditor({
  template,
  value,
  onChange,
  title = 'Ficha técnica',
  emptyMessage = 'Selecione um template para preencher os campos técnicos.',
}) {
  const fields = normalizeFields(template)
  const map = getValueMap(value)

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-earth-300 bg-earth-50 p-3 text-xs text-earth-600">
        {emptyMessage}
      </div>
    )
  }

  const setFieldValue = (key, nextVal) => {
    const next = { ...map }
    if (nextVal === '' || nextVal == null) delete next[key]
    else next[key] = nextVal
    onChange(next)
  }

  return (
    <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
      <p className="text-sm font-medium text-earth-800">{title}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {fields.map((field) => {
          const val = map[field.key]
          const commonLabel = (
            <span className="flex items-center gap-1 text-xs font-medium text-earth-700">
              {field.label}
              {field.required && <span className="text-red-600">*</span>}
              {field.unit && <span className="text-earth-500">({field.unit})</span>}
            </span>
          )
          if (field.type === 'boolean') {
            return (
              <label key={field.key} className="text-xs text-earth-700">
                {commonLabel}
                <select
                  value={val === true ? 'true' : val === false ? 'false' : ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (!raw) setFieldValue(field.key, '')
                    else setFieldValue(field.key, raw === 'true')
                  }}
                  className="mt-1 block w-full rounded border border-earth-300 bg-white px-2 py-1 text-sm text-earth-900"
                >
                  <option value="">Nao informado</option>
                  <option value="true">Sim</option>
                  <option value="false">Nao</option>
                </select>
              </label>
            )
          }
          if (field.type === 'select') {
            return (
              <label key={field.key} className="text-xs text-earth-700">
                {commonLabel}
                <select
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => setFieldValue(field.key, e.target.value)}
                  className="mt-1 block w-full rounded border border-earth-300 bg-white px-2 py-1 text-sm text-earth-900"
                >
                  <option value="">Selecionar</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
          return (
            <label key={field.key} className="text-xs text-earth-700">
              {commonLabel}
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                step={field.type === 'number' ? 'any' : undefined}
                value={val == null ? '' : String(val)}
                onChange={(e) => setFieldValue(field.key, e.target.value)}
                className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}
