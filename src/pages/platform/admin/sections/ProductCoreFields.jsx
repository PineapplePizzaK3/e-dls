import { useMemo, useState } from 'react'
import { uploadProductImage } from '../../../../services/productService'
import RichTextEditor from '../../../../components/RichTextEditor'
import { computeFinalPriceJpy, normalizeMarginMultiplier } from '../../../../lib/productMargin'

function parseAdminProductUrls(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function ProductCoreFields({
  form,
  setForm,
  productCategorySuggestions = [],
  images = [],
  imageUploading = false,
  setImageUploading = () => {},
  imageUploadError = '',
  setImageUploadError = () => {},
  newImageUrl = '',
  setNewImageUrl = () => {},
  addImage = () => {},
  moveImage = () => {},
  setCover = () => {},
  removeImageAt = () => {},
  showCondition = false,
  conditionOptions = [],
  showMargin = false,
  /** Quando true (ex.: versões), o campo de preço é valor base sem UI de margem. */
  priceAsBase = false,
}) {
  const [newAdminUrl, setNewAdminUrl] = useState('')
  const adminUrls = useMemo(() => parseAdminProductUrls(form.admin_product_url), [form.admin_product_url])
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(productCategorySuggestions) ? productCategorySuggestions : [])
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        )
      ),
    [productCategorySuggestions]
  )
  const selectedCategoryOption = useMemo(() => {
    const current = String(form?.category ?? '').trim()
    if (!current) return ''
    const direct = categoryOptions.find((option) => option === current)
    if (direct) return direct
    const lower = current.toLowerCase()
    return categoryOptions.find((option) => option.toLowerCase() === lower) || ''
  }, [categoryOptions, form?.category])

  const finalPricePreview = useMemo(() => {
    if (!showMargin) return null
    return computeFinalPriceJpy(form.price, form.margin_multiplier)
  }, [showMargin, form.price, form.margin_multiplier])

  const persistAdminUrls = (nextUrls) => {
    const clean = nextUrls
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    setForm((f) => ({ ...f, admin_product_url: clean.join('\n') }))
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-earth-700">Nome:</span>
        <input
          required
          type="text"
          placeholder="Nome do produto"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="min-w-[140px] flex-1 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
        />
        <span className="text-sm font-medium text-earth-700">
          {showMargin || priceAsBase ? 'Valor base (¥):' : 'Preço (¥):'}
        </span>
        <input
          required
          type="number"
          step="1"
          min="0"
          placeholder="0"
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          className="w-24 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
        />
        {showMargin && (
          <>
            <span className="text-sm font-medium text-earth-700">Margem (×):</span>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="1"
              value={form.margin_multiplier ?? '1'}
              onChange={(e) => setForm((f) => ({ ...f, margin_multiplier: e.target.value }))}
              className="w-24 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
            />
            <span className="rounded-lg border border-earth-200 bg-earth-50 px-2.5 py-2 text-sm text-earth-800">
              Final:{' '}
              <strong>
                ¥{Number(finalPricePreview || 0).toLocaleString('pt-BR')}
              </strong>
              <span className="ml-1 text-xs text-earth-500">
                ({normalizeMarginMultiplier(form.margin_multiplier, 1)}×)
              </span>
            </span>
          </>
        )}
        <span className="text-sm font-medium text-earth-700">Peso (opcional):</span>
        <input
          type="number"
          step={form.weight_unit === 'g' ? '1' : '0.001'}
          min="0"
          placeholder="—"
          value={form.weight_kg}
          onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
          className="w-20 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
        />
        <select
          value={form.weight_unit}
          onChange={(e) => setForm((f) => ({ ...f, weight_unit: e.target.value }))}
          className="rounded-lg border border-earth-300 px-2 py-2 text-sm text-earth-900"
        >
          <option value="g">g</option>
          <option value="kg">kg</option>
        </select>
        <span className="text-sm font-medium text-earth-700">Estoque:</span>
        <input
          type="number"
          min="0"
          step="1"
          value={form.stock_quantity}
          onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
          placeholder="Ilimitado"
          className="w-28 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
        />
      </div>
      {showMargin && (
        <p className="text-xs text-earth-500">
          O valor final exibido na loja é <strong>valor base × margem</strong>. O scrape preenche o valor base.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showCondition && (
          <>
            <span className="text-sm font-medium text-earth-700">Condição:</span>
            <select
              value={form.item_condition}
              onChange={(e) => setForm((f) => ({ ...f, item_condition: e.target.value }))}
              className="rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
            >
              {conditionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </>
        )}
        <span className="text-sm font-medium text-earth-700">Categoria:</span>
        <select
          value={selectedCategoryOption}
          onChange={(e) => {
            const nextCategory = e.target.value
            setForm((f) => ({ ...f, category: nextCategory }))
          }}
          className="min-w-[180px] rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-900"
        >
          <option value="">Selecionar existente</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="text"
          value={form.category ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          placeholder="Ou digite nova categoria"
          className="min-w-[160px] flex-1 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-earth-700">Descrição do produto</label>
        <RichTextEditor
          value={form.description}
          onChange={(nextHtml) => setForm((f) => ({ ...f, description: nextHtml }))}
          placeholder="Detalhes visíveis para o cliente no modal do produto (opcional)"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-earth-700">Link do produto (somente admin)</label>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <input
            type="url"
            value={newAdminUrl}
            onChange={(e) => setNewAdminUrl(e.target.value)}
            placeholder="https://... (não aparece para clientes)"
            className="block min-w-[220px] flex-1 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => {
              const raw = String(newAdminUrl || '').trim()
              if (!raw) return
              if (adminUrls.includes(raw)) {
                setNewAdminUrl('')
                return
              }
              persistAdminUrls([...adminUrls, raw])
              setNewAdminUrl('')
            }}
            className="rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            Adicionar link
          </button>
        </div>
        {adminUrls.length > 0 && (
          <div className="mt-2 space-y-1">
            {adminUrls.map((url, index) => (
              <div key={`${url}-${index}`} className="flex items-center gap-2 text-xs">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-blue-700 hover:underline"
                >
                  {url}
                </a>
                <button
                  type="button"
                  onClick={() => persistAdminUrls(adminUrls.filter((_, i) => i !== index))}
                  className="rounded border border-red-200 px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-50"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-earth-500">
          Referência interna para a equipe. Não é exibido na loja. Você pode adicionar mais de um link.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-earth-700">Fotos do produto</span>
        <p className="text-xs text-earth-500">
          Envie várias imagens ou adicione por URL. Arraste para reordenar; a primeira foto é a capa nos cards.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50">
            {imageUploading ? 'Enviando...' : 'Enviar do PC (várias)'}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={imageUploading}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'))
                if (!files.length) return
                setImageUploadError('')
                setImageUploading(true)
                try {
                  for (const file of files) {
                    const { data, error } = await uploadProductImage(file)
                    if (error) {
                      setImageUploadError(error.message || 'Falha no upload')
                      break
                    }
                    if (data) addImage(data)
                  }
                } finally {
                  setImageUploading(false)
                  e.target.value = ''
                }
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs font-medium text-earth-600">URL da imagem</label>
            <input
              type="url"
              value={newImageUrl}
              onChange={(e) => {
                setNewImageUrl(e.target.value)
                setImageUploadError('')
              }}
              placeholder="https://..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const url = newImageUrl?.trim()
                  if (!url) return
                  addImage(url)
                  setNewImageUrl('')
                }
              }}
              className="mt-0.5 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const url = newImageUrl?.trim()
              if (!url) return
              addImage(url)
              setNewImageUrl('')
            }}
            className="rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            Adicionar URL
          </button>
        </div>

        {imageUploadError && <p className="mt-2 text-sm text-red-600">{imageUploadError}</p>}

        {images.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-earth-600">
              Arraste para reordenar. A primeira imagem é a capa do produto.
            </p>
            <div className="flex flex-wrap gap-2">
              {images.map((url, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
                    if (Number.isInteger(from)) moveImage(from, i)
                  }}
                  className="group relative inline-block cursor-grab active:cursor-grabbing"
                >
                  <img src={url} alt="" className="h-20 w-20 rounded border border-earth-200 bg-white object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-earth-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Capa
                    </span>
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => setCover(i)}
                      className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-earth-800 hover:bg-white"
                    >
                      Definir capa
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImageAt(i)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
                    aria-label="Remover foto"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
