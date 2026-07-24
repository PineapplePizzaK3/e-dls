import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PRODUCT_CONDITION_OPTIONS } from '../../../../lib/productCondition'
import { useSiteLocale } from '../../../../hooks/useSiteLocale'
import { appStoreProductPath } from '../../../../lib/localeRoutes'
import { useAdminContext } from '../AdminContext'
import ProductCoreFields from './ProductCoreFields'
import ProductTechnicalSpecsEditor from './ProductTechnicalSpecsEditor'
import ProductScrapeBlock from './ProductScrapeBlock'
import { scrapeProductUrl } from '../../../../services/wishlistLinkService'
import {
  createProductSpecTemplateAdmin,
  deleteProductSpecTemplateAdmin,
  listProductSpecTemplatesAdmin,
  updateProductSpecTemplateAdmin,
} from '../../../../services/productSpecTemplateService'
import RichTextEditor from '../../../../components/RichTextEditor'
import { richTextToPlainText } from '../../../../lib/richText'

const SPEC_FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Numero' },
  { value: 'boolean', label: 'Sim/nao' },
  { value: 'select', label: 'Selecao' },
]

function createEmptyTemplateField(seed = {}) {
  return {
    key: String(seed.key || '').trim(),
    label: String(seed.label || '').trim(),
    type: ['text', 'number', 'boolean', 'select'].includes(seed.type) ? seed.type : 'text',
    unit: String(seed.unit || '').trim(),
    required: Boolean(seed.required),
    optionsText: Array.isArray(seed.options) ? seed.options.join(', ') : String(seed.optionsText || ''),
    order: Number(seed.order) || 0,
  }
}

function normalizeTemplateFieldsForSave(fields) {
  const list = Array.isArray(fields) ? fields : []
  return list
    .map((field, index) => {
      const key = String(field?.key || '').trim()
      if (!key) return null
      const options = String(field?.optionsText || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      return {
        key,
        label: String(field?.label || key).trim(),
        type: ['text', 'number', 'boolean', 'select'].includes(field?.type) ? field.type : 'text',
        unit: String(field?.unit || '').trim() || null,
        required: Boolean(field?.required),
        options,
        order: Number(field?.order) || index,
      }
    })
    .filter(Boolean)
}

function normalizeSpecMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function getTemplateKeys(template) {
  const fields = Array.isArray(template?.fields) ? template.fields : []
  return fields.map((field) => String(field?.key || '').trim()).filter(Boolean)
}

function pruneSpecsByTemplate(value, template) {
  const map = normalizeSpecMap(value)
  const keys = new Set(getTemplateKeys(template))
  if (keys.size === 0) return {}
  const next = {}
  for (const [key, fieldVal] of Object.entries(map)) {
    if (keys.has(key)) next[key] = fieldVal
  }
  return next
}

export default function CatalogoProdutosSection() {
  const locale = useSiteLocale()
  const [catalogSourceUrlInput, setCatalogSourceUrlInput] = useState('')
  const [catalogScraping, setCatalogScraping] = useState(false)
  const [catalogScrapeMeta, setCatalogScrapeMeta] = useState(null)
  const [catalogScrapePreview, setCatalogScrapePreview] = useState(null)
  const [catalogScrapeFeedback, setCatalogScrapeFeedback] = useState('')
  const [variantImageDrafts, setVariantImageDrafts] = useState({})
  const [variantReferenceSearch, setVariantReferenceSearch] = useState({})
  const [variantReferenceId, setVariantReferenceId] = useState({})
  const {
    activeTab,
    resetForm,
    setCatalogCreateOpen,
    loadProducts,
    catalogSearch,
    setCatalogSearch,
    catalogStatusFilter,
    setCatalogStatusFilter,
    catalogCreateOpen,
    handleSave,
    form,
    setForm,
    imageUploading,
    setImageUploadError,
    setImageUploading,
    addProductImage,
    newImageUrl,
    setNewImageUrl,
    imageUploadError,
    moveProductImage,
    setProductCover,
    removeProductImageAt,
    submitting,
    editingId,
    catalogProducts,
    products,
    loading,
    getProductBasePriceJpy,
    formatJPY,
    getProductConditionMeta,
    handleEdit,
    handleDuplicate,
    duplicatingId,
    handleDelete,
    PaginationControls,
    productsPage,
    productsHasMore,
    setProductsPage,
    productCategorySuggestions,
    sectionMessages,
  } = useAdminContext()

  const catalogEditorRef = useRef(null)
  const [specTemplates, setSpecTemplates] = useState([])
  const [specTemplatesLoading, setSpecTemplatesLoading] = useState(false)
  const [specTemplateSaving, setSpecTemplateSaving] = useState(false)
  const [specTemplateMessage, setSpecTemplateMessage] = useState('')
  const [editingSpecTemplateId, setEditingSpecTemplateId] = useState('')
  const [specTemplateForm, setSpecTemplateForm] = useState({
    name: '',
    category: '',
    fields: [createEmptyTemplateField({ order: 0 })],
  })

  useEffect(() => {
    if (!catalogCreateOpen || !editingId) return
    const node = catalogEditorRef.current
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const focusTarget = node.querySelector('input, textarea, select, button')
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus({ preventScroll: true })
    }
  }, [catalogCreateOpen, editingId])

  useEffect(() => {
    if (activeTab !== 'catalogo_produtos') return
    let mounted = true
    const run = async () => {
      setSpecTemplatesLoading(true)
      const { data, error } = await listProductSpecTemplatesAdmin(500, 0)
      if (!mounted) return
      if (error) {
        setSpecTemplateMessage(error.message || 'Erro ao carregar templates de ficha técnica.')
      } else {
        setSpecTemplates(Array.isArray(data) ? data : [])
      }
      setSpecTemplatesLoading(false)
    }
    run()
    return () => {
      mounted = false
    }
  }, [activeTab])

  const localMessage = String(sectionMessages?.catalogo || '')
  const localMessageIsError = /erro|inválid|obrigat|falha|não foi possível|selecione|preencha/i.test(localMessage.toLowerCase())

  const selectedSpecTemplate = useMemo(
    () => specTemplates.find((tpl) => tpl?.id === form?.spec_template_id) || form?.spec_template || null,
    [specTemplates, form?.spec_template_id, form?.spec_template]
  )

  if (activeTab !== 'catalogo_produtos') return null

  const openCatalogEditorForProduct = (product) => {
    handleEdit(product)
    setCatalogCreateOpen(true)
    requestAnimationFrame(() => {
      const node = catalogEditorRef.current
      if (!node) return
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const focusTarget = node.querySelector('input, textarea, select, button')
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true })
      }
    })
  }

  const applyScrapedCatalogData = (scrapedData, { force = false } = {}) => {
    if (!scrapedData) return
    const rawPrice = Number(scrapedData?.price)
    const normalizedPrice = Number.isFinite(rawPrice) && rawPrice > 0
      ? String(Math.round(rawPrice))
      : ''
    const scrapedImageUrls = Array.isArray(scrapedData?.image_urls)
      ? scrapedData.image_urls.filter(Boolean)
      : []
    const incomingImage = scrapedImageUrls[0] || scrapedData?.image_url || ''
    setForm((prev) => {
      const hasExistingCoreData =
        Boolean(prev.name?.trim()) ||
        Boolean(prev.price != null && String(prev.price).trim() !== '') ||
        Boolean(prev.image_url?.trim()) ||
        (Array.isArray(prev.image_urls) && prev.image_urls.length > 0)
      const shouldHoldForReview =
        !force &&
        hasExistingCoreData &&
        (scrapedData?.meta?.requiresReview || scrapedData?.meta?.lowConfidence)

      if (shouldHoldForReview) {
        setCatalogScrapePreview(scrapedData)
        return prev
      }

      setCatalogScrapePreview(null)
      return {
        ...prev,
        name: scrapedData?.name || prev.name,
        price: normalizedPrice || prev.price,
        image_url: incomingImage || prev.image_url,
        image_urls: scrapedImageUrls.length ? Array.from(new Set(scrapedImageUrls)) : prev.image_urls,
        source_url: scrapedData?.source_url || prev.source_url,
      }
    })
  }

  const updateVariantAt = (index, updater) => {
    setForm((f) => {
      const next = Array.isArray(f.variants) ? [...f.variants] : []
      if (!next[index]) return f
      const prevVariant = next[index]
      const updated = typeof updater === 'function' ? updater(prevVariant) : { ...prevVariant, ...updater }
      next[index] = updated
      return { ...f, variants: next }
    })
  }

  const getVariantImages = (variant) => {
    const list = Array.isArray(variant?.image_urls) ? variant.image_urls.filter(Boolean) : []
    if (list.length > 0) return list
    return variant?.image_url ? [variant.image_url] : []
  }

  const addVariantImage = (index, url) => {
    const raw = String(url || '').trim()
    if (!raw) return
    updateVariantAt(index, (variant) => {
      const cur = getVariantImages(variant)
      if (cur.includes(raw)) return { ...variant }
      const next = [...cur, raw]
      return {
        ...variant,
        image_url: next[0] || '',
        image_urls: next,
      }
    })
  }

  const removeVariantImageAt = (variantIndex, imageIndex) => {
    updateVariantAt(variantIndex, (variant) => {
      const cur = getVariantImages(variant)
      if (imageIndex < 0 || imageIndex >= cur.length) return { ...variant }
      const next = cur.filter((_, i) => i !== imageIndex)
      return {
        ...variant,
        image_url: next[0] || '',
        image_urls: next,
      }
    })
  }

  const moveVariantImage = (variantIndex, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    updateVariantAt(variantIndex, (variant) => {
      const cur = getVariantImages(variant)
      if (fromIndex < 0 || fromIndex >= cur.length || toIndex < 0 || toIndex >= cur.length) return { ...variant }
      const list = [...cur]
      const [moved] = list.splice(fromIndex, 1)
      list.splice(toIndex, 0, moved)
      return {
        ...variant,
        image_url: list[0] || '',
        image_urls: list,
      }
    })
  }

  const getVariantForm = (variant) => ({
    name: variant?.version ?? variant?.title ?? '',
    price: variant?.price_jpy ?? '',
    weight_kg: variant?.weight_kg ?? '',
    weight_unit: variant?.weight_unit ?? 'g',
    stock_quantity: variant?.stock_quantity ?? '',
    item_condition: variant?.item_condition ?? 'new',
    category: variant?.category ?? '',
    description: variant?.description ?? '',
    admin_product_url: variant?.admin_product_url ?? '',
    image_url: variant?.image_url ?? '',
    image_urls: getVariantImages(variant),
    technical_specs: normalizeSpecMap(variant?.technical_specs),
  })

  const setVariantForm = (index, updater) => {
    updateVariantAt(index, (prev) => {
      const current = getVariantForm(prev)
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
      const nextImages = Array.isArray(next.image_urls) ? next.image_urls.filter(Boolean) : []
      const prevImages = getVariantImages(prev)
      const finalImages = nextImages.length > 0
        ? nextImages
        : (String(next.image_url || '').trim() ? [String(next.image_url || '').trim()] : prevImages)
      const finalCover = String(next.image_url || '').trim() || finalImages[0] || prev?.image_url || ''
      const nextName = String(next.name ?? '')
      return {
        ...prev,
        title: nextName,
        version: nextName,
        price_jpy: next.price,
        stock_quantity: next.stock_quantity,
        sku: next.sku ?? prev?.sku ?? '',
        weight_kg: next.weight_kg,
        weight_unit: next.weight_unit || 'g',
        technical_specs: normalizeSpecMap(next.technical_specs),
        item_condition: next.item_condition ?? 'new',
        category: next.category ?? '',
        description: next.description ?? '',
        admin_product_url: next.admin_product_url ?? '',
        image_url: finalCover,
        image_urls: finalImages,
      }
    })
  }

  const ensureSimpleCatalogVariant = (f) => {
    const existing = Array.isArray(f?.variants) ? f.variants : []
    const active = existing.filter((v) => v?.is_active !== false)
    if (active.length > 0) return existing
    return [{
      title: String(f?.name || '').trim() || 'Padrão',
      version: String(f?.name || '').trim() || 'Padrão',
      price_jpy: f?.price ?? '',
      stock_quantity: f?.stock_quantity ?? '',
      sku: '',
      image_url: f?.image_url ?? '',
      image_urls: Array.isArray(f?.image_urls) ? f.image_urls.filter(Boolean) : (f?.image_url ? [f.image_url] : []),
      technical_specs: {},
      is_active: true,
      is_default: true,
      item_condition: f?.item_condition ?? 'new',
      category: f?.category ?? '',
      description: f?.description ?? '',
      admin_product_url: f?.admin_product_url ?? '',
      weight_kg: f?.weight_kg ?? '',
      weight_unit: f?.weight_unit ?? 'g',
    }]
  }

  const switchCatalogFormMode = (nextMode) => {
    setForm((prev) => {
      const mode = nextMode === 'variants' ? 'variants' : 'simple'
      if (mode === prev.form_mode) return prev
      if (mode === 'variants') {
        return {
          ...prev,
          form_mode: mode,
          variants: ensureSimpleCatalogVariant(prev),
        }
      }
      const variants = Array.isArray(prev.variants) ? prev.variants : []
      const defaultVariant = variants.find((v) => v?.is_default) || variants[0]
      if (!defaultVariant) return { ...prev, form_mode: mode }
      const nextImages = Array.isArray(defaultVariant.image_urls)
        ? defaultVariant.image_urls.filter(Boolean)
        : (defaultVariant.image_url ? [defaultVariant.image_url] : [])
      return {
        ...prev,
        form_mode: mode,
        name: prev.name || defaultVariant.version || defaultVariant.title || '',
        price: String(defaultVariant.price_jpy ?? prev.price ?? ''),
        stock_quantity: defaultVariant.stock_quantity == null ? '' : String(defaultVariant.stock_quantity),
        image_url: defaultVariant.image_url || nextImages[0] || prev.image_url || '',
        image_urls: nextImages.length ? nextImages : (Array.isArray(prev.image_urls) ? prev.image_urls : []),
        category: defaultVariant.category ?? prev.category,
        item_condition: defaultVariant.item_condition ?? prev.item_condition,
        description: defaultVariant.description ?? prev.description,
        admin_product_url: defaultVariant.admin_product_url ?? prev.admin_product_url,
        weight_kg: defaultVariant.weight_kg ?? prev.weight_kg,
        weight_unit: defaultVariant.weight_unit ?? prev.weight_unit,
      }
    })
  }

  const applyCatalogGlobalCategory = (nextCategoryRaw) => {
    const nextCategory = String(nextCategoryRaw || '')
    setForm((prev) => ({
      ...prev,
      category: nextCategory,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).map((variant) => ({
        ...variant,
        category: nextCategory,
      })),
    }))
  }

  const applyReferenceToVariant = (index, refProduct) => {
    if (!refProduct) return
    const imageUrls = Array.isArray(refProduct?.image_urls) && refProduct.image_urls.length > 0
      ? refProduct.image_urls.filter(Boolean)
      : (refProduct?.image_url ? [refProduct.image_url] : [])
    setVariantForm(index, (prev) => ({
      ...prev,
      name: refProduct.name ?? prev.name,
      price: String(Math.round(Number(refProduct.price_jpy ?? refProduct.price ?? prev.price ?? 0) || 0)),
      category: refProduct.category ?? prev.category,
      description: refProduct.description ?? prev.description,
      admin_product_url: refProduct.admin_product_url ?? prev.admin_product_url,
      image_url: imageUrls[0] || prev.image_url,
      image_urls: imageUrls.length ? imageUrls : prev.image_urls,
      stock_quantity:
        refProduct.stock_quantity != null
          ? String(refProduct.stock_quantity)
          : prev.stock_quantity,
      item_condition: refProduct.item_condition ?? prev.item_condition,
      weight_kg:
        refProduct.weight_kg != null
          ? String(refProduct.weight_kg)
          : prev.weight_kg,
      weight_unit: 'kg',
    }))
    setVariantReferenceId((prev) => ({ ...prev, [index]: refProduct.id || '' }))
  }

  const getVariantSummary = (product) => {
    const variants = Array.isArray(product?.variants) ? product.variants : []
    const active = variants.filter((v) => v?.is_active !== false)
    const minPrice = active.reduce((acc, v) => {
      const n = Number(v?.price_jpy)
      if (!Number.isFinite(n) || n < 0) return acc
      return acc == null ? n : Math.min(acc, n)
    }, null)
    const limitedStocks = active
      .map((v) => (v?.stock_quantity == null ? null : Math.max(0, Number(v.stock_quantity) || 0)))
      .filter((s) => s != null)
    const stockLabel = limitedStocks.length > 0
      ? String(limitedStocks.reduce((sum, s) => sum + s, 0))
      : 'Ilimitado'
    return {
      variantsCount: variants.length,
      activeCount: active.length,
      minPrice,
      stockLabel,
    }
  }

  const resetSpecTemplateForm = () => {
    setEditingSpecTemplateId('')
    setSpecTemplateForm({
      name: '',
      category: '',
      fields: [createEmptyTemplateField({ order: 0 })],
    })
  }

  const refreshSpecTemplates = async () => {
    setSpecTemplatesLoading(true)
    const { data, error } = await listProductSpecTemplatesAdmin(500, 0)
    if (error) {
      setSpecTemplateMessage(error.message || 'Erro ao carregar templates de ficha técnica.')
      setSpecTemplatesLoading(false)
      return
    }
    const list = Array.isArray(data) ? data : []
    setSpecTemplates(list)
    setSpecTemplatesLoading(false)
    if (form?.spec_template_id && !list.some((tpl) => tpl?.id === form.spec_template_id)) {
      setForm((prev) => ({
        ...prev,
        spec_template_id: '',
        technical_specs: {},
        variants: (Array.isArray(prev.variants) ? prev.variants : []).map((variant) => ({
          ...variant,
          technical_specs: {},
        })),
      }))
    }
  }

  const handleEditSpecTemplate = (template) => {
    const fields = Array.isArray(template?.fields) ? template.fields : []
    setEditingSpecTemplateId(template?.id || '')
    setSpecTemplateForm({
      name: String(template?.name || ''),
      category: String(template?.category || ''),
      fields: fields.length > 0
        ? fields.map((field, index) => createEmptyTemplateField({
          ...field,
          order: Number(field?.order) || index,
        }))
        : [createEmptyTemplateField({ order: 0 })],
    })
  }

  const handleSaveSpecTemplate = async (e) => {
    e.preventDefault()
    setSpecTemplateMessage('')
    const payload = {
      name: String(specTemplateForm.name || '').trim(),
      category: String(specTemplateForm.category || '').trim() || null,
      fields: normalizeTemplateFieldsForSave(specTemplateForm.fields),
    }
    if (!payload.name) {
      setSpecTemplateMessage('Nome do template é obrigatório.')
      return
    }
    if (payload.fields.length === 0) {
      setSpecTemplateMessage('Adicione pelo menos um campo na ficha técnica.')
      return
    }

    setSpecTemplateSaving(true)
    const op = editingSpecTemplateId
      ? updateProductSpecTemplateAdmin(editingSpecTemplateId, payload)
      : createProductSpecTemplateAdmin(payload)
    const { error } = await op
    setSpecTemplateSaving(false)
    if (error) {
      setSpecTemplateMessage(error.message || 'Erro ao salvar template.')
      return
    }
    setSpecTemplateMessage(editingSpecTemplateId ? 'Template atualizado.' : 'Template criado.')
    resetSpecTemplateForm()
    await refreshSpecTemplates()
  }

  const handleDeleteSpecTemplate = async (templateId) => {
    if (!templateId) return
    if (!confirm('Excluir este template de ficha técnica?')) return
    setSpecTemplateSaving(true)
    const { error } = await deleteProductSpecTemplateAdmin(templateId)
    setSpecTemplateSaving(false)
    if (error) {
      setSpecTemplateMessage(error.message || 'Erro ao excluir template.')
      return
    }
    setSpecTemplateMessage('Template removido.')
    if (editingSpecTemplateId === templateId) {
      resetSpecTemplateForm()
    }
    await refreshSpecTemplates()
  }

  const applySpecTemplateToForm = (templateId) => {
    const template = specTemplates.find((tpl) => tpl?.id === templateId) || null
    setForm((prev) => ({
      ...prev,
      spec_template_id: templateId,
      spec_template: template,
      technical_specs: pruneSpecsByTemplate(prev.technical_specs, template),
      variants: (Array.isArray(prev.variants) ? prev.variants : []).map((variant) => ({
        ...variant,
        technical_specs: pruneSpecsByTemplate(variant?.technical_specs, template),
      })),
    }))
  }

  useEffect(() => {
    if (form?.form_mode !== 'variants') return
    const variants = Array.isArray(form?.variants) ? form.variants : []
    const defaultVariant = variants.find((v) => v?.is_default) || variants[0]
    if (!defaultVariant) return

    const nextPrice = String(defaultVariant?.price_jpy ?? '')
    const nextStock = defaultVariant?.stock_quantity == null ? '' : String(defaultVariant.stock_quantity)
    const nextImages = Array.isArray(defaultVariant?.image_urls)
      ? defaultVariant.image_urls.filter(Boolean)
      : (defaultVariant?.image_url ? [defaultVariant.image_url] : [])
    const nextImageUrl = defaultVariant?.image_url || nextImages[0] || ''

    setForm((prev) => {
      if (
        String(prev.price ?? '') === nextPrice &&
        String(prev.stock_quantity ?? '') === nextStock &&
        String(prev.image_url ?? '') === String(nextImageUrl ?? '') &&
        JSON.stringify(Array.isArray(prev.image_urls) ? prev.image_urls.filter(Boolean) : []) === JSON.stringify(nextImages)
      ) {
        return prev
      }
      return {
        ...prev,
        price: nextPrice,
        stock_quantity: nextStock,
        image_url: nextImageUrl,
        image_urls: nextImages,
      }
    })
  }, [form?.variants, setForm])

  const handleScrapeCatalogProduct = async () => {
    const url = String(catalogSourceUrlInput || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      setCatalogScrapeFeedback('Use uma URL completa começando com http:// ou https://')
      return
    }
    setCatalogScraping(true)
    setCatalogScrapePreview(null)
    setCatalogScrapeMeta(null)
    setCatalogScrapeFeedback('')
    try {
      const { data, error } = await scrapeProductUrl(url)
      if (error) {
        const detail = error?.failureCode ? ` (código: ${error.failureCode})` : ''
        setCatalogScrapeFeedback((error.message || 'Não foi possível extrair dados do produto.') + detail)
        return
      }
      const normalized = { ...data, source_url: url }
      setCatalogScrapeMeta(normalized?.meta || null)
      applyScrapedCatalogData(normalized)
      const confidencePct = Math.round((Number(normalized?.meta?.confidence) || 0) * 100)
      setCatalogScrapeFeedback(`Dados preenchidos via scrape (${confidencePct}% de confiança).`)
    } catch (e) {
      setCatalogScrapeFeedback(e?.message || 'Erro ao executar scrape do produto.')
    } finally {
      setCatalogScraping(false)
    }
  }

  const catalogFormMode = form?.form_mode === 'variants' ? 'variants' : 'simple'
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
  const selectedGlobalCategoryOption = useMemo(() => {
    const current = String(form?.category ?? '').trim()
    if (!current) return ''
    const direct = categoryOptions.find((option) => option === current)
    if (direct) return direct
    const lower = current.toLowerCase()
    return categoryOptions.find((option) => option.toLowerCase() === lower) || ''
  }, [categoryOptions, form?.category])

  return (
    <section className="mt-0 rounded-b-xl border border-t-0 border-earth-200 bg-earth-50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-earth-900">Lista de Produtos (catálogo único)</h2>
          <p className="mt-1 text-sm text-earth-600">
            Base central de produtos usada em loja, grupos de compra, pedidos e invoices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm()
              setCatalogCreateOpen(true)
            }}
            className="rounded-lg bg-earth-900 px-3 py-2 text-sm font-medium text-white hover:bg-earth-800"
          >
            Adicionar produto na lista
          </button>
          <button
            type="button"
            onClick={() => loadProducts()}
            className="rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm font-medium text-earth-700 hover:bg-earth-100"
          >
            Atualizar lista
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
          placeholder="Buscar por nome, id, descrição, categoria..."
          className="min-w-[220px] flex-1 rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
        />
        <select
          value={catalogStatusFilter}
          onChange={(e) => setCatalogStatusFilter(e.target.value)}
          className="rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {localMessage && (
        <p className={`mt-3 rounded-lg px-4 py-2 text-sm ${
          localMessageIsError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
        }`}>
          {localMessage}
        </p>
      )}

      <div className="mt-4 rounded-lg border border-earth-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-earth-900">Templates de ficha técnica</h3>
            <p className="text-xs text-earth-600">
              Estruture campos reutilizáveis para preencher especificações dos produtos.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshSpecTemplates}
            className="rounded border border-earth-300 px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            Atualizar templates
          </button>
        </div>

        {specTemplateMessage && (
          <p className="mt-2 rounded bg-earth-100 px-2 py-1 text-xs text-earth-700">{specTemplateMessage}</p>
        )}

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <form onSubmit={handleSaveSpecTemplate} className="space-y-2 rounded-lg border border-earth-200 bg-earth-50 p-3">
            <p className="text-xs font-semibold text-earth-800">
              {editingSpecTemplateId ? 'Editar template' : 'Novo template'}
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-xs text-earth-700">
                Nome
                <input
                  type="text"
                  value={specTemplateForm.name}
                  onChange={(e) => setSpecTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
                  required
                />
              </label>
              <label className="text-xs text-earth-700">
                Categoria (opcional)
                <input
                  type="text"
                  value={specTemplateForm.category}
                  onChange={(e) => setSpecTemplateForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
                />
              </label>
            </div>

            <div className="space-y-2">
              {(Array.isArray(specTemplateForm.fields) ? specTemplateForm.fields : []).map((field, index) => (
                <div key={`${field.key}-${index}`} className="rounded border border-earth-200 bg-white p-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                    <input
                      type="text"
                      value={field.key}
                      onChange={(e) => setSpecTemplateForm((prev) => {
                        const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                        next[index] = { ...next[index], key: e.target.value }
                        return { ...prev, fields: next }
                      })}
                      placeholder="chave_ex: bateria_mah"
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-900 md:col-span-2"
                    />
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => setSpecTemplateForm((prev) => {
                        const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                        next[index] = { ...next[index], label: e.target.value }
                        return { ...prev, fields: next }
                      })}
                      placeholder="Rótulo"
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-900 md:col-span-2"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => setSpecTemplateForm((prev) => {
                        const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                        next[index] = { ...next[index], type: e.target.value }
                        return { ...prev, fields: next }
                      })}
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-900"
                    >
                      {SPEC_FIELD_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={field.order}
                      onChange={(e) => setSpecTemplateForm((prev) => {
                        const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                        next[index] = { ...next[index], order: Number(e.target.value) || 0 }
                        return { ...prev, fields: next }
                      })}
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-900"
                      placeholder="Ordem"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      type="text"
                      value={field.unit}
                      onChange={(e) => setSpecTemplateForm((prev) => {
                        const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                        next[index] = { ...next[index], unit: e.target.value }
                        return { ...prev, fields: next }
                      })}
                      placeholder="Unidade (ex.: mm, mAh)"
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-900"
                    />
                    <input
                      type="text"
                      value={field.optionsText}
                      onChange={(e) => setSpecTemplateForm((prev) => {
                        const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                        next[index] = { ...next[index], optionsText: e.target.value }
                        return { ...prev, fields: next }
                      })}
                      placeholder="Opções (separadas por vírgula)"
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-900 md:col-span-2"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="inline-flex items-center gap-1 text-xs text-earth-700">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => setSpecTemplateForm((prev) => {
                          const next = Array.isArray(prev.fields) ? [...prev.fields] : []
                          next[index] = { ...next[index], required: e.target.checked }
                          return { ...prev, fields: next }
                        })}
                      />
                      Obrigatório
                    </label>
                    <button
                      type="button"
                      onClick={() => setSpecTemplateForm((prev) => {
                        const next = (Array.isArray(prev.fields) ? prev.fields : []).filter((_, i) => i !== index)
                        return {
                          ...prev,
                          fields: next.length > 0 ? next : [createEmptyTemplateField({ order: 0 })],
                        }
                      })}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Remover campo
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSpecTemplateForm((prev) => ({
                  ...prev,
                  fields: [...(Array.isArray(prev.fields) ? prev.fields : []), createEmptyTemplateField({ order: (prev.fields?.length || 0) + 1 })],
                }))}
                className="rounded border border-earth-300 px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-100"
              >
                Adicionar campo
              </button>
              <button
                type="submit"
                disabled={specTemplateSaving}
                className="rounded bg-earth-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-earth-800 disabled:opacity-60"
              >
                {specTemplateSaving ? 'Salvando...' : (editingSpecTemplateId ? 'Salvar template' : 'Criar template')}
              </button>
              {editingSpecTemplateId && (
                <button
                  type="button"
                  onClick={resetSpecTemplateForm}
                  className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-700 hover:bg-earth-100"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>

          <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
            <p className="text-xs font-semibold text-earth-800">Templates cadastrados</p>
            {specTemplatesLoading && <p className="mt-2 text-xs text-earth-600">Carregando templates...</p>}
            {!specTemplatesLoading && specTemplates.length === 0 && (
              <p className="mt-2 text-xs text-earth-600">Nenhum template cadastrado.</p>
            )}
            <div className="mt-2 space-y-2">
              {specTemplates.map((template) => (
                <div key={template.id} className="rounded border border-earth-200 bg-white p-2">
                  <p className="text-sm font-medium text-earth-900">{template.name}</p>
                  <p className="text-xs text-earth-600">
                    {(Array.isArray(template.fields) ? template.fields.length : 0)} campos
                    {template.category ? ` • ${template.category}` : ''}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSpecTemplate(template)}
                      className="rounded border border-earth-300 px-2 py-1 text-xs text-earth-700 hover:bg-earth-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSpecTemplate(template.id)}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {catalogCreateOpen && (
        <form
          ref={catalogEditorRef}
          onSubmit={handleSave}
          className="mt-4 space-y-3 rounded-lg border border-earth-200 bg-white p-4"
        >
          <ProductScrapeBlock
            sourceUrl={catalogSourceUrlInput}
            setSourceUrl={(next) => {
              setCatalogSourceUrlInput(next)
              setForm((f) => ({ ...f, source_url: next }))
            }}
            onScrape={handleScrapeCatalogProduct}
            scraping={catalogScraping}
            scrapeMeta={catalogScrapeMeta}
            scrapePreview={catalogScrapePreview}
            onApplyPreview={() => {
              applyScrapedCatalogData(catalogScrapePreview, { force: true })
              setCatalogScrapeFeedback('Dados do scrape aplicados ao formulário.')
            }}
            onDiscardPreview={() => {
              setCatalogScrapePreview(null)
              setCatalogScrapeFeedback('Dados do scrape descartados.')
            }}
            feedback={catalogScrapeFeedback}
            placeholder="URL do produto para preencher dados automaticamente"
          />

          <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
            <p className="mb-2 text-sm font-medium text-earth-800">Modo de formulário</p>
            <div className="inline-flex rounded-lg border border-earth-300 bg-white p-1 text-sm">
              <button
                type="button"
                onClick={() => switchCatalogFormMode('simple')}
                className={`rounded-md px-3 py-1.5 ${catalogFormMode === 'simple' ? 'bg-earth-900 text-white' : 'text-earth-700 hover:bg-earth-100'}`}
              >
                Simples (padrão)
              </button>
              <button
                type="button"
                onClick={() => switchCatalogFormMode('variants')}
                className={`rounded-md px-3 py-1.5 ${catalogFormMode === 'variants' ? 'bg-earth-900 text-white' : 'text-earth-700 hover:bg-earth-100'}`}
              >
                Com versões
              </button>
            </div>
            <div className="mt-2">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                catalogFormMode === 'simple' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
              }`}>
                Modo atual: {catalogFormMode === 'simple' ? 'Simples' : 'Com versões'}
              </span>
            </div>
          </div>

          {catalogFormMode === 'variants' ? (
            <>
          <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
            <p className="mb-2 text-sm font-medium text-earth-800">Dados globais do produto pai</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-xs text-earth-700">
                Nome do produto pai
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
                />
              </label>
              <label className="text-xs text-earth-700">
                Categoria global
                <div className="mt-1 grid grid-cols-1 gap-1">
                  <select
                    value={selectedGlobalCategoryOption}
                    onChange={(e) => {
                      const nextCategory = e.target.value
                      applyCatalogGlobalCategory(nextCategory)
                    }}
                    className="block w-full rounded border border-earth-300 bg-white px-2 py-1 text-sm text-earth-900"
                  >
                    <option value="">Selecionar existente</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={form.category ?? ''}
                    onChange={(e) => applyCatalogGlobalCategory(e.target.value)}
                    placeholder="Ou digite nova categoria"
                    className="block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
                    autoComplete="off"
                  />
                </div>
              </label>
              <label className="text-xs text-earth-700">
                Condição global
                <select
                  value={form.item_condition}
                  onChange={(e) => setForm((f) => ({ ...f, item_condition: e.target.value }))}
                  className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
                >
                  {PRODUCT_CONDITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-earth-700">
                Link interno (admin)
                <input
                  type="url"
                  value={form.admin_product_url ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, admin_product_url: e.target.value }))}
                  placeholder="https://... (interno)"
                  className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm text-earth-900"
                />
              </label>
              <label className="text-xs text-earth-700 md:col-span-2">
                Template de ficha técnica
                <select
                  value={form.spec_template_id ?? ''}
                  onChange={(e) => applySpecTemplateToForm(e.target.value)}
                  className="mt-1 block w-full rounded border border-earth-300 bg-white px-2 py-1 text-sm text-earth-900"
                >
                  <option value="">Sem ficha técnica estruturada</option>
                  {specTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}{tpl.category ? ` (${tpl.category})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3">
              <ProductTechnicalSpecsEditor
                template={selectedSpecTemplate}
                value={form.technical_specs}
                onChange={(next) => setForm((prev) => ({ ...prev, technical_specs: next }))}
                title="Ficha técnica global do produto"
              />
            </div>
            <div className="mt-2 block text-xs text-earth-700">
              <span className="block font-medium text-earth-700">Descrição global</span>
              <RichTextEditor
                value={form.description}
                onChange={(nextHtml) => setForm((f) => ({ ...f, description: nextHtml }))}
                placeholder="Detalhes visíveis ao cliente; valem para todas as versões (opcional)"
              />
            </div>
            <p className="mt-2 text-xs text-earth-600">
              Preço, estoque e imagens são definidos por versão abaixo.
            </p>
          </div>

          <div className="rounded-lg border border-earth-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-earth-800">Versões do produto</p>
              <button
                type="button"
                onClick={() => setForm((f) => ({
                  ...f,
                  variants: [...(Array.isArray(f.variants) ? f.variants : []), { title: '', version: '', price_jpy: f.price || '0', stock_quantity: '', sku: '', image_url: '', image_urls: [], technical_specs: {}, is_active: true, is_default: false }],
                }))}
                className="rounded border border-earth-300 px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-50"
              >
                Adicionar versão
              </button>
            </div>
            <div className="space-y-2">
              {(Array.isArray(form.variants) ? form.variants : []).map((variant, index) => (
                <div key={index} className="rounded-lg border border-earth-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-earth-800">
                      Versão {index + 1}{variant.version ? ` • ${variant.version}` : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1 text-xs text-earth-700">
                        <input
                          type="checkbox"
                          checked={variant.is_active ?? true}
                          onChange={(e) => updateVariantAt(index, { is_active: e.target.checked })}
                        />
                        Ativa
                      </label>
                      <button
                        type="button"
                        onClick={() => setForm((f) => {
                          const next = (Array.isArray(f.variants) ? [...f.variants] : []).map((it, i) => ({ ...it, is_default: i === index }))
                          return { ...f, variants: next }
                        })}
                        className="rounded border border-earth-300 px-2 py-1 text-xs hover:bg-earth-50"
                      >
                        {variant.is_default ? 'Padrão' : 'Definir padrão'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => {
                          const next = (Array.isArray(f.variants) ? [...f.variants] : []).filter((_, i) => i !== index)
                          if (next.length > 0 && !next.some((v) => v.is_default)) next[0] = { ...next[0], is_default: true }
                          return { ...f, variants: next }
                        })}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                    <input
                      type="search"
                      value={variantReferenceSearch[index] ?? ''}
                      onChange={(e) => setVariantReferenceSearch((prev) => ({ ...prev, [index]: e.target.value }))}
                      placeholder="Buscar item na Lista de Produtos..."
                      className="min-w-0 w-full shrink rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900 sm:flex-1 sm:basis-[min(100%,14rem)]"
                    />
                    <select
                      value={variantReferenceId[index] ?? ''}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setVariantReferenceId((prev) => ({ ...prev, [index]: nextId }))
                        const ref = (products || []).find((p) => p.id === nextId)
                        if (ref) applyReferenceToVariant(index, ref)
                      }}
                      className="min-w-0 w-full max-w-full shrink rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-900 sm:flex-1 sm:basis-[min(100%,14rem)]"
                    >
                      <option value="">Selecionar referência do catálogo</option>
                      {(products || [])
                        .filter((p) => {
                          const term = String(variantReferenceSearch[index] || '').trim().toLowerCase()
                          if (!term) return true
                          const hay = [
                            p?.name,
                            p?.id,
                            p?.description,
                            p?.category,
                          ].map((v) => String(v || '').toLowerCase())
                          return hay.some((v) => v.includes(term))
                        })
                        .slice(0, 80)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({String(p.id).slice(0, 8)}…)
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const ref = (products || []).find((p) => p.id === (variantReferenceId[index] ?? ''))
                        if (ref) applyReferenceToVariant(index, ref)
                      }}
                      disabled={!variantReferenceId[index]}
                      className="w-full shrink-0 rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm font-medium text-earth-700 hover:bg-earth-100 disabled:opacity-60 sm:w-auto sm:self-center"
                    >
                      Aplicar referência
                    </button>
                  </div>

                  <ProductCoreFields
                    form={getVariantForm(variant)}
                    setForm={(updater) => setVariantForm(index, updater)}
                    productCategorySuggestions={productCategorySuggestions}
                    images={getVariantImages(variant)}
                    imageUploading={imageUploading}
                    setImageUploading={setImageUploading}
                    imageUploadError={imageUploadError}
                    setImageUploadError={setImageUploadError}
                    newImageUrl={variantImageDrafts[index] ?? ''}
                    setNewImageUrl={(val) => setVariantImageDrafts((prev) => ({ ...prev, [index]: val }))}
                    addImage={(url) => {
                      addVariantImage(index, url)
                      setVariantImageDrafts((prev) => ({ ...prev, [index]: '' }))
                    }}
                    moveImage={(from, to) => moveVariantImage(index, from, to)}
                    setCover={(imgIndex) => moveVariantImage(index, imgIndex, 0)}
                    removeImageAt={(imgIndex) => removeVariantImageAt(index, imgIndex)}
                    showCondition
                    conditionOptions={PRODUCT_CONDITION_OPTIONS}
                  />

                  <div className="mt-2">
                    <label className="text-xs text-earth-700">
                      SKU da versão
                      <input
                        type="text"
                        value={variant.sku ?? ''}
                        onChange={(e) => updateVariantAt(index, { sku: e.target.value })}
                        placeholder="SKU (opcional)"
                        className="mt-1 block w-full rounded border border-earth-300 px-2 py-1 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-3">
                    <ProductTechnicalSpecsEditor
                      template={selectedSpecTemplate}
                      value={variant?.technical_specs}
                      onChange={(next) => updateVariantAt(index, { technical_specs: next })}
                      title="Sobrescritas técnicas da versão"
                      emptyMessage="Selecione um template no bloco global para habilitar sobrescritas por versão."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
            </>
          ) : (
            <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
              <p className="mb-2 text-sm font-medium text-earth-800">Produto simples</p>
              <label className="mb-3 block text-xs text-earth-700">
                Template de ficha técnica
                <select
                  value={form.spec_template_id ?? ''}
                  onChange={(e) => applySpecTemplateToForm(e.target.value)}
                  className="mt-1 block w-full rounded border border-earth-300 bg-white px-2 py-1 text-sm text-earth-900"
                >
                  <option value="">Sem ficha técnica estruturada</option>
                  {specTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}{tpl.category ? ` (${tpl.category})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <ProductCoreFields
                form={form}
                setForm={setForm}
                productCategorySuggestions={productCategorySuggestions}
                images={Array.isArray(form.image_urls) ? form.image_urls.filter(Boolean) : (form.image_url ? [form.image_url] : [])}
                imageUploading={imageUploading}
                setImageUploading={setImageUploading}
                imageUploadError={imageUploadError}
                setImageUploadError={setImageUploadError}
                newImageUrl={newImageUrl}
                setNewImageUrl={setNewImageUrl}
                addImage={addProductImage}
                moveImage={moveProductImage}
                setCover={setProductCover}
                removeImageAt={removeProductImageAt}
                showCondition
                conditionOptions={PRODUCT_CONDITION_OPTIONS}
              />
              <div className="mt-3">
                <ProductTechnicalSpecsEditor
                  template={selectedSpecTemplate}
                  value={form.technical_specs}
                  onChange={(next) => setForm((prev) => ({ ...prev, technical_specs: next }))}
                  title="Ficha técnica do produto"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="catalog_is_active"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="rounded border-earth-300"
            />
            <label htmlFor="catalog_is_active" className="text-sm font-medium text-earth-700">
              Ativo (visível na loja)
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-earth-900 px-4 py-2 text-sm font-medium text-white hover:bg-earth-800 disabled:opacity-60"
            >
              {submitting ? 'Salvando...' : (editingId ? 'Salvar produto' : 'Adicionar produto')}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm()
                setCatalogCreateOpen(false)
              }}
              className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-3 text-xs text-earth-600">
        Exibindo {catalogProducts.length} de {products.length} produtos.
      </div>

      {loading && <p className="mt-4 text-sm text-earth-600">Carregando catálogo...</p>}
      {!loading && catalogProducts.length === 0 && (
        <p className="mt-4 text-sm text-earth-600">Nenhum produto encontrado com os filtros atuais.</p>
      )}

      {!loading && catalogProducts.length > 0 && (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-earth-200 bg-white">
            <table className="min-w-full divide-y divide-earth-200 text-sm">
              <thead className="bg-earth-100 text-left text-earth-700">
                <tr>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 font-medium">Contexto</th>
                  <th className="px-3 py-2 font-medium">Publicado na loja</th>
                  <th className="px-3 py-2 font-medium">Preco</th>
                  <th className="px-3 py-2 font-medium">Condicao</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 font-medium">Estoque</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {catalogProducts.map((p) => (
                  <tr key={p.id} className="align-top">
                    {(() => {
                      const v = getVariantSummary(p)
                      return (
                        <>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-earth-200" />
                        )}
                        <div className="min-w-0">
                          <Link
                            to={appStoreProductPath(p.id, locale)}
                            className="font-medium text-earth-900 hover:text-earth-700 hover:underline"
                          >
                            {p.name || 'Sem nome'}
                          </Link>
                          <div className="mt-1">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                v.activeCount <= 0
                                  ? 'bg-red-100 text-red-800'
                                  : v.activeCount < v.variantsCount
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {v.variantsCount} versões ({v.activeCount} ativas)
                            </span>
                          </div>
                          {p.description && (
                            <p className="line-clamp-2 text-xs text-earth-600">{richTextToPlainText(p.description)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-earth-700">
                      {p.purchase_group_id ? 'Produto de grupo' : 'Produto-base'}
                    </td>
                    <td className="px-3 py-2 text-earth-700">
                      {!p.purchase_group_id && p.store_linked ? 'Sim' : 'Não'}
                    </td>
                    <td className="px-3 py-2 text-earth-700">
                      {v.minPrice != null ? `${formatJPY(v.minPrice)} (a partir de)` : formatJPY(getProductBasePriceJpy(p))}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const condition = getProductConditionMeta(p.item_condition)
                        return (
                          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${condition.className}`}>
                            {condition.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2 text-earth-700">
                      {p.category ? String(p.category) : '—'}
                    </td>
                    <td className="px-3 py-2 text-earth-700">
                      {v.stockLabel}
                      <div className="text-xs text-earth-500">
                        {v.activeCount}/{v.variantsCount} versões ativas
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {p.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-earth-500">{p.id}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openCatalogEditorForProduct(p)}
                        className="mr-3 text-sm font-medium text-earth-600 hover:text-earth-900"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(p)}
                        disabled={duplicatingId === p.id}
                        className="mr-3 text-sm font-medium text-earth-600 hover:text-earth-900 disabled:opacity-50"
                      >
                        {duplicatingId === p.id ? 'Duplicando...' : 'Duplicar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Remover
                      </button>
                    </td>
                        </>
                      )
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={productsPage}
            hasMore={productsHasMore}
            loading={loading}
            onPrev={() => setProductsPage((p) => Math.max(0, p - 1))}
            onNext={() => setProductsPage((p) => p + 1)}
          />
        </div>
      )}
    </section>
  )
}
