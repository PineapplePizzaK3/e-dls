/**
 * Página individual de produto (vitrine em estoque ou item de grupo).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { useSiteLocale } from '../../hooks/useSiteLocale'
import { appStoreGroupPath, publicStoreGroupPath } from '../../lib/localeRoutes'
import { PageSeo } from '../../components/PageSeo'
import { getPublicProductById } from '../../services/productService'
import { addToCart } from '../../services/cartService'
import { useAuth } from '../../hooks/useAuth'
import { showCartToast } from '../../lib/cartToast'
import ImageLightbox from '../../components/ImageLightbox'
import { getProductConditionMeta } from '../../lib/productCondition'
import RichTextContent from '../../components/RichTextContent'
import ProductTechnicalSpecs from '../../components/ProductTechnicalSpecs'
import {
  ProductPriceBlock,
  getProductImages,
  isOutOfStock,
  isVariantOutOfStock,
  variantDisplayLabel,
} from '../../components/StoreProductDisplay'

export default function StoreProductDetail({ publicMode = false }) {
  const { t } = useTranslation()
  const { productId: rawProductId } = useParams()
  const productId = rawProductId ? decodeURIComponent(rawProductId) : ''
  const [searchParams, setSearchParams] = useSearchParams()
  const groupIdFromQuery = (searchParams.get('group') || '').trim()
  const variantIdFromQuery = (searchParams.get('v') || '').trim()
  const lp = useLocalizedPath()
  const locale = useSiteLocale()
  const { user } = useAuth()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const selectedVariantIdRef = useRef('')
  const [imageIndex, setImageIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const backHref = useMemo(() => {
    if (groupIdFromQuery) {
      return publicMode
        ? publicStoreGroupPath(groupIdFromQuery, locale)
        : appStoreGroupPath(groupIdFromQuery, locale)
    }
    return publicMode ? lp('lojaPublicVitrine') : lp('appLoja')
  }, [groupIdFromQuery, publicMode, locale, lp])

  const backLabel = groupIdFromQuery
    ? t('platform.store.productPageBackToGroup')
    : t('platform.store.productPageBack')
  useEffect(() => {
    if (!message) return
    const tmr = setTimeout(() => setMessage(''), 3200)
    return () => clearTimeout(tmr)
  }, [message])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!productId) {
        setProduct(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setMessage('')
      try {
        const { data, error } = await getPublicProductById(productId)
        if (!active) return
        if (error) {
          setMessage(error.message || t('platform.store.productPageLoadError'))
          setProduct(null)
        } else {
          setProduct(data && typeof data === 'object' ? data : null)
        }
      } catch (e) {
        if (active) {
          setMessage(e?.message || t('platform.store.productPageLoadError'))
          setProduct(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [productId, t])

  useEffect(() => {
    setImageIndex(0)
  }, [product?.id, selectedVariantId])

  useEffect(() => {
    selectedVariantIdRef.current = selectedVariantId || ''
  }, [selectedVariantId])

  /** Sincroniza variante com `?v=` na URL (ou remove `v` inválido). */
  useEffect(() => {
    if (!product) return
    const variants = Array.isArray(product.variants) ? product.variants : []
    const active = variants.filter((v) => v?.is_active !== false)
    if (active.length === 0) {
      setSelectedVariantId('')
      return
    }
    const fromUrl = variantIdFromQuery && active.some((v) => v.id === variantIdFromQuery)
    if (fromUrl) {
      setSelectedVariantId(variantIdFromQuery)
      return
    }
    const def = active.find((v) => v?.is_default) || active[0]
    setSelectedVariantId(def?.id || '')
    if (variantIdFromQuery) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('v')
          return next
        },
        { replace: true }
      )
    }
  }, [product, variantIdFromQuery, setSearchParams])

  const selectedVariant = useMemo(() => {
    const variants = Array.isArray(product?.variants) ? product.variants : []
    const active = variants.filter((v) => v?.is_active !== false)
    if (!selectedVariantId) return active.find((v) => v?.is_default) || active[0] || null
    return active.find((v) => v?.id === selectedVariantId) || null
  }, [product?.variants, selectedVariantId])

  const activeVariants = useMemo(() => {
    return Array.isArray(product?.variants)
      ? product.variants.filter((v) => v?.is_active !== false)
      : []
  }, [product?.variants])

  const headingTitle = useMemo(() => {
    if (!product) return ''
    const active = Array.isArray(product.variants)
      ? product.variants.filter((v) => v?.is_active !== false)
      : []
    if (active.length <= 1) return product.name
    const sv = selectedVariant || active[0]
    const lab = sv ? variantDisplayLabel(sv) : ''
    return lab ? `${product.name} — ${lab}` : product.name
  }, [product, selectedVariant])

  const displayDescription = useMemo(() => {
    const attrs = selectedVariant?.attributes && typeof selectedVariant.attributes === 'object'
      ? selectedVariant.attributes
      : {}
    const variantDescription = String(selectedVariant?.description ?? attrs?.description ?? '').trim()
    if (variantDescription) return variantDescription
    const productDescription = String(product?.description ?? '').trim()
    return productDescription
  }, [product?.description, selectedVariant])

  const effectiveTechnicalSpecs = useMemo(() => {
    const globalSpecs =
      product?.technical_specs && typeof product.technical_specs === 'object' && !Array.isArray(product.technical_specs)
        ? product.technical_specs
        : {}
    const variantAttrs =
      selectedVariant?.attributes && typeof selectedVariant.attributes === 'object'
        ? selectedVariant.attributes
        : {}
    const variantSpecs =
      variantAttrs?.technical_specs && typeof variantAttrs.technical_specs === 'object' && !Array.isArray(variantAttrs.technical_specs)
        ? variantAttrs.technical_specs
        : {}
    return { ...globalSpecs, ...variantSpecs }
  }, [product?.technical_specs, selectedVariant])

  const images = useMemo(() => {
    const variantImages = selectedVariant
      ? getProductImages(selectedVariant)
      : []
    if (variantImages.length > 0) return variantImages
    return product ? getProductImages(product) : []
  }, [product, selectedVariant])

  const fallbackProductImage = useMemo(() => {
    if (!product) return ''
    const list = getProductImages(product)
    return list[0] || ''
  }, [product])

  const handleComprar = async () => {
    if (!user?.id) {
      setMessage(t('platform.groupBuy.loginToBuy'))
      return
    }
    if (!product?.id) return
    if (!selectedVariantId) {
      setMessage('Selecione uma versão do produto.')
      return
    }
    const vid = selectedVariant?.id || selectedVariantId
    const nextVid = vid || selectedVariantIdRef.current || variantIdFromQuery
    if (!nextVid) {
      setMessage('Selecione uma versão do produto.')
      return
    }
    const { error } = await addToCart(user.id, product.id, 1, nextVid)
    if (error) setMessage(error.message || t('platform.store.addError'))
    else showCartToast(t('platform.store.added'))
  }

  const openLightbox = (event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    setLightboxOpen(true)
  }

  const selectVariant = (nextId) => {
    selectedVariantIdRef.current = nextId || ''
    setSelectedVariantId(nextId)
    setImageIndex(0)
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        if (nextId) nextParams.set('v', nextId)
        else nextParams.delete('v')
        return nextParams
      },
      { replace: true }
    )
  }

  return (
    <>
      <PageSeo
        routeKey={publicMode ? 'lojaPublicVitrine' : 'appLoja'}
        title={headingTitle ? `${headingTitle} | ${t('platform.storeHub.pageTitle')}` : t('platform.store.metaTitle')}
        description={t('meta.appStore.description')}
        noindex
      />
      <div className={publicMode ? 'px-4 pt-24 pb-12' : ''}>
        <div className="mx-auto w-full max-w-3xl">
          <Link
            to={backHref}
            className="inline-flex text-sm font-medium text-earth-600 hover:text-earth-900"
          >
            ← {backLabel}
          </Link>

          {loading && <p className="mt-8 text-earth-600">{t('platform.store.loading')}</p>}

          {!loading && !product && (
            <p className="mt-8 rounded-lg bg-earth-100 px-4 py-3 text-earth-800">
              {message || t('platform.store.productPageNotFound')}
            </p>
          )}

          {!loading && product && (
            <article className="mt-6 overflow-hidden rounded-2xl border border-earth-200 bg-white shadow-sm">
              <div className="relative bg-white">
                {images.length > 0 ? (
                  <>
                    <img
                      src={images[imageIndex]}
                      alt={headingTitle || product.name}
                      className="h-72 w-full cursor-zoom-in object-contain sm:h-96"
                      onClick={openLightbox}
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                          aria-label={t('platform.store.prevPhoto')}
                        >
                          <svg className="h-5 w-5 text-earth-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                          aria-label={t('platform.store.nextPhoto')}
                        >
                          <svg className="h-5 w-5 text-earth-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="flex justify-center gap-1 pb-2">
                          {images.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setImageIndex(i)}
                              className={`h-2 w-2 rounded-full ${i === imageIndex ? 'bg-earth-800' : 'bg-earth-300'}`}
                              aria-label={t('platform.store.photoDot', { n: i + 1 })}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-72 items-center justify-center text-earth-500 sm:h-96">
                    {t('platform.store.noImage')}
                  </div>
                )}
              </div>

              <div className="p-6">
                {(() => {
                  const condition = getProductConditionMeta(product.item_condition)
                  const condLabel = t(`platform.productCondition.${condition.value}`, {
                    defaultValue: condition.label,
                  })
                  return (
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${condition.className}`}>
                      {condLabel}
                    </span>
                  )
                })()}
                <h1 className="mt-3 text-2xl font-bold text-earth-900">{headingTitle}</h1>
                {displayDescription && (
                  <RichTextContent html={displayDescription} className="mt-4 text-earth-600" />
                )}
                <ProductTechnicalSpecs
                  template={product?.spec_template}
                  specs={effectiveTechnicalSpecs}
                  className="mt-5"
                />
                <div className="mt-6">
                  <ProductPriceBlock
                    product={
                      selectedVariant ? { ...product, variants: [selectedVariant] } : product
                    }
                    variant="page"
                  />
                </div>
                {activeVariants.length > 0 && (
                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-earth-700">Versão</label>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {activeVariants.map((v) => {
                        const versao = variantDisplayLabel(v)
                        const out = isVariantOutOfStock(v)
                        const varImgs = getProductImages(v)
                        const thumb = varImgs[0] || fallbackProductImage
                        const selected = selectedVariantId === v.id
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => !out && selectVariant(v.id)}
                            disabled={out}
                            title={`${versao}${out ? ' (Sem estoque)' : ''}`}
                            className={`group relative w-[92px] rounded-lg border p-1 text-left transition ${
                              selected
                                ? 'border-earth-900 ring-2 ring-earth-300'
                                : 'border-earth-300 hover:border-earth-500'
                            } ${out ? 'cursor-not-allowed opacity-60' : ''}`}
                          >
                            <div className="relative mx-auto overflow-hidden rounded-md">
                              {thumb ? (
                                <img src={thumb} alt={versao} className="h-16 w-full object-cover" />
                              ) : (
                                <div className="flex h-16 w-full items-center justify-center bg-earth-100 text-[10px] text-earth-600">
                                  {versao.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              {out && (
                                <span className="absolute inset-x-0 bottom-0 bg-red-600/90 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                                  Sem estoque
                                </span>
                              )}
                            </div>
                            <span className="mt-1 block truncate text-center text-[11px] font-medium text-earth-700">
                              {versao}
                            </span>
                            {out && (
                              <span className="block text-center text-[10px] text-red-700">
                                Indisponivel
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {message && (
                  <p className="mt-4 rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-800">{message}</p>
                )}
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleComprar()}
                    disabled={
                      selectedVariant != null
                        ? isVariantOutOfStock(selectedVariant)
                        : isOutOfStock(product)
                    }
                    className="rounded-xl px-6 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-earth-300 disabled:text-earth-600 bg-earth-900 text-white hover:bg-earth-800"
                  >
                    {selectedVariant != null
                      ? isVariantOutOfStock(selectedVariant)
                        ? t('platform.store.outOfStock')
                        : t('platform.store.addToCart')
                      : isOutOfStock(product)
                        ? t('platform.store.outOfStock')
                        : t('platform.store.addToCart')}
                  </button>
                  {(selectedVariant != null
                    ? isVariantOutOfStock(selectedVariant)
                    : isOutOfStock(product)) && (
                    <Link
                      to={lp('appServices')}
                      className="rounded-xl border border-earth-300 bg-white px-6 py-3 font-medium text-earth-700 hover:bg-earth-50"
                    >
                      {t('platform.store.requestOrder')}
                    </Link>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
      <ImageLightbox
        open={lightboxOpen}
        src={images[imageIndex]}
        alt={headingTitle || product?.name}
        onClose={() => setLightboxOpen(false)}
        hasNavigation={images.length > 1}
        onPrev={() => setImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))}
        onNext={() => setImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))}
        prevLabel={t('platform.store.prevPhoto')}
        nextLabel={t('platform.store.nextPhoto')}
      />
    </>
  )
}
