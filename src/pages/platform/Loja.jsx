/**
 * Loja: aba Em estoque (catálogo com pronta entrega) + aba Vitrine (grupos de compra).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { useSiteLocale } from '../../hooks/useSiteLocale'
import { appStoreProductPath, publicStoreProductPath } from '../../lib/localeRoutes'
import { PageSeo } from '../../components/PageSeo'
import { getProducts } from '../../services/productService'
import { addToCart } from '../../services/cartService'
import { useAuth } from '../../hooks/useAuth'
import { getCardThumbnailUrl } from '../../lib/imageUtils'
import { showCartToast } from '../../lib/cartToast'
import ImageLightbox from '../../components/ImageLightbox'
import { getProductConditionMeta } from '../../lib/productCondition'
import { richTextToPlainText } from '../../lib/richText'
import {
  ProductPriceBlock,
  getProductImages,
  isOutOfStock,
  isVariantOutOfStock,
  variantDisplayLabel,
} from '../../components/StoreProductDisplay'
import StoreProductCategorySection from '../../components/StoreProductCategorySection'
import GrupoDeCompras from './GrupoDeCompras'

function readVariantCategory(variant) {
  const attrs = variant?.attributes && typeof variant.attributes === 'object' ? variant.attributes : {}
  const raw = variant?.category ?? attrs?.category
  const value = String(raw || '').trim()
  return value || ''
}

function getEffectiveCardCategory(product, preferredVariant = null) {
  const parentCategory = String(product?.category || '').trim()
  if (parentCategory) return parentCategory
  const preferred = readVariantCategory(preferredVariant)
  if (preferred) return preferred
  const active = Array.isArray(product?.variants) ? product.variants.filter((v) => v?.is_active !== false) : []
  for (const variant of active) {
    const fromVariant = readVariantCategory(variant)
    if (fromVariant) return fromVariant
  }
  return ''
}

/** 1 card por versão ativa; produtos sem versão ativa viram 1 card legado. */
function flattenCatalogProductsToVariantCards(products) {
  const out = []
  for (const p of products || []) {
    const all = Array.isArray(p.variants) ? p.variants : []
    const active = all.filter((v) => v?.is_active !== false)
    if (active.length === 0) {
      out.push({
        ...p,
        __cardKey: String(p.id),
        __variantId: null,
        __displayName: p.name,
        category: getEffectiveCardCategory(p, null),
      })
      continue
    }
    for (const v of active) {
      const lab = variantDisplayLabel(v)
      const __displayName = active.length === 1 && lab === 'Padrão' ? p.name : `${p.name} — ${lab}`
      out.push({
        ...p,
        variants: [v],
        __cardKey: `${p.id}:${v.id}`,
        __variantId: v.id,
        __displayName,
        category: getEffectiveCardCategory(p, v),
      })
    }
  }
  return out
}

function getStoreCardImages(card) {
  const v = Array.isArray(card.variants) ? card.variants[0] : null
  if (v) {
    const fromVar = getProductImages(v)
    if (fromVar.length > 0) return fromVar
  }
  return getProductImages(card)
}

function LojaEstoqueCatalog({ publicMode = false }) {
  const { t } = useTranslation()
  const lp = useLocalizedPath()
  const locale = useSiteLocale()
  const isEn = locale === 'en'
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0, alt: '' })

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3000)
    return () => clearTimeout(timer)
  }, [message])

  useEffect(() => {
    let isActive = true
    const run = async () => {
      try {
        const { data, error } = await getProducts()
        if (!isActive) return
        setProducts(data ?? [])
        if (error) setMessage(error.message)
      } catch (e) {
        if (isActive) setMessage(e?.message || t('platform.store.loadError'))
      } finally {
        if (isActive) setLoading(false)
      }
    }
    run()
    return () => {
      isActive = false
    }
  }, [t])

  const productCards = useMemo(() => flattenCatalogProductsToVariantCards(products), [products])

  const handleComprar = async (card) => {
    if (!user?.id) {
      setMessage(t('platform.groupBuy.loginToBuy'))
      return
    }
    const variants = Array.isArray(card?.variants) ? card.variants.filter((v) => v?.is_active !== false) : []
    const fallback = variants.find((v) => v?.is_default) || variants[0]
    const variantId = card?.__variantId || fallback?.id || ''
    if (!variantId) {
      setMessage('Produto sem versão disponível no momento.')
      return
    }
    const { error } = await addToCart(user.id, card.id, 1, variantId)
    if (error) {
      setMessage(error.message)
      return
    }
    showCartToast(t('platform.store.added'))
  }

  const productHref = (productId, variantId) =>
    publicMode
      ? publicStoreProductPath(productId, locale, variantId ? { variantId } : {})
      : appStoreProductPath(productId, locale, variantId ? { variantId } : {})
  const openLightbox = (images, index, alt, event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    setLightbox({ open: true, images, index, alt })
  }

  return (
    <div>
      <h2 className="sr-only">{t('platform.store.pageTitle')}</h2>
      <div className="mt-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-earth-900">
          {isEn ? 'Search partner marketplaces' : 'Busca em marketplaces parceiros'}
        </p>
        <p className="mt-1 text-xs text-earth-600">
          {isEn
            ? 'Compare external offers in one search before finalizing your purchase.'
            : 'Compare ofertas externas em uma busca unificada e volte para finalizar sua compra com mais contexto.'}
        </p>
        <Link
          to={lp('catalogSearchPublic')}
          className="mt-3 inline-flex rounded-lg border border-earth-300 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-800 hover:bg-earth-100"
        >
          {isEn ? 'Open external search' : 'Abrir busca externa'}
        </Link>
      </div>
      {message && <p className="mt-4 rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-800">{message}</p>}
      {loading && <p className="mt-6 text-earth-600">{t('platform.store.loading')}</p>}
      {!loading && products.length === 0 && (
        <p className="mt-6 text-earth-600">{t('platform.store.empty')}</p>
      )}
      {!loading && products.length > 0 && (
        <div className="mt-6">
          <StoreProductCategorySection
            products={productCards}
            uncategorizedLabel={t('platform.store.categoryUncategorized')}
            searchPlaceholder={t('platform.store.categorySearchPlaceholder')}
            filterAllLabel={t('platform.store.categoryFilterAll')}
            gridClassName="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            renderProduct={(p) => {
              const imgs = getStoreCardImages(p)
              const mainImg = imgs[0]
              const thumbUrl = mainImg ? getCardThumbnailUrl(mainImg) : null
              const condition = getProductConditionMeta(p.item_condition)
              const condLabel = t(`platform.productCondition.${condition.value}`, {
                defaultValue: condition.label,
              })
              const activeVariants = Array.isArray(p.variants) ? p.variants.filter((v) => v?.is_active !== false) : []
              const primaryVariant = p.__variantId
                ? activeVariants.find((v) => v.id === p.__variantId) || activeVariants[0]
                : activeVariants.find((v) => v?.is_default) || activeVariants[0]
              const cardOut =
                primaryVariant != null ? isVariantOutOfStock(primaryVariant) : isOutOfStock(p)
              const displayName = p.__displayName || p.name
              return (
                <div
                  key={p.__cardKey || p.id}
                  className="overflow-hidden rounded-md border border-earth-200 bg-earth-50 shadow-sm transition hover:border-earth-400 hover:shadow-md"
                >
                  <Link
                    to={productHref(p.id, p.__variantId)}
                    className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-earth-500 focus:ring-inset rounded-t-lg"
                  >
                    {mainImg ? (
                      <img
                        src={thumbUrl || mainImg}
                        alt={displayName}
                        className="aspect-[4/5] w-full cursor-zoom-in bg-white object-contain p-2"
                        loading="lazy"
                        onError={(e) => {
                          if (e.target.src !== mainImg) e.target.src = mainImg
                        }}
                        onClick={(e) => openLightbox(imgs, 0, displayName, e)}
                      />
                    ) : (
                      <div className="flex aspect-[4/5] w-full items-center justify-center bg-earth-200 text-earth-500 text-xs">
                        {t('platform.store.noImage')}
                      </div>
                    )}
                    <div className="p-2">
                      <h3 className="font-semibold text-earth-900 text-xs leading-snug line-clamp-2 sm:text-sm">{displayName}</h3>
                      <span className={`mt-1 inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${condition.className}`}>
                        {condLabel}
                      </span>
                      {p.description && (
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-earth-600">
                          {richTextToPlainText(p.description)}
                        </p>
                      )}
                      <ProductPriceBlock product={p} />
                    </div>
                  </Link>
                  <div className="flex gap-1.5 px-2 pb-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => !cardOut && handleComprar(p)}
                      disabled={cardOut}
                      className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-earth-300 disabled:text-earth-600 bg-earth-900 text-white hover:bg-earth-800"
                    >
                      {cardOut ? t('platform.store.outOfStock') : t('platform.store.addToCart')}
                    </button>
                    {cardOut && (
                      <Link
                        to={lp('appServices')}
                        className="rounded-md border border-earth-300 bg-white px-2 py-1.5 text-[11px] font-medium text-earth-700 hover:bg-earth-100"
                      >
                        {t('platform.store.requestOrder')}
                      </Link>
                    )}
                  </div>
                </div>
              )
            }}
          />
        </div>
      )}

      {!loading && (
        <div className="mt-10 rounded-xl border border-earth-200 bg-earth-50 p-5 sm:p-6">
          <p className="text-sm text-earth-700 sm:text-base">{t('platform.store.ctaBody')}</p>
          <Link
            to={lp('appServices')}
            className="mt-3 inline-flex rounded-lg bg-earth-900 px-4 py-2 text-sm font-medium text-white hover:bg-earth-800"
          >
            {t('platform.store.ctaButton')}
          </Link>
        </div>
      )}

      <ImageLightbox
        open={lightbox.open}
        src={lightbox.images[lightbox.index]}
        alt={lightbox.alt}
        onClose={() => setLightbox({ open: false, images: [], index: 0, alt: '' })}
        hasNavigation={lightbox.images.length > 1}
        onPrev={() => {
          setLightbox((prev) => ({
            ...prev,
            index: prev.index === 0 ? prev.images.length - 1 : prev.index - 1,
          }))
        }}
        onNext={() => {
          setLightbox((prev) => ({
            ...prev,
            index: prev.index === prev.images.length - 1 ? 0 : prev.index + 1,
          }))
        }}
        prevLabel={t('platform.store.prevPhoto')}
        nextLabel={t('platform.store.nextPhoto')}
      />
    </div>
  )
}

export default function Loja({ publicMode = false }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  // Default: Em Estoque. Vitrine only when explicitly requested.
  const tabParam = String(searchParams.get('tab') || '').toLowerCase()
  const tab = tabParam === 'vitrine' || tabParam === 'grupos' ? 'grupos' : 'estoque'

  const tabLinks = useMemo(
    () => ({
      estoque: pathname,
      grupos: `${pathname}?tab=vitrine`,
    }),
    [pathname]
  )

  return (
    <>
      <PageSeo
        routeKey="appLoja"
        title={t('meta.appStore.title')}
        description={t('meta.appStore.description')}
        noindex
      />
      <div className={publicMode ? 'px-4 pt-24 pb-12' : ''}>
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-2xl font-bold text-earth-900">{t('platform.groupBuy.pageTitle')}</h1>
          <p className="mt-2 text-earth-600">{t('platform.groupBuy.intro')}</p>

          <div className="mt-5 flex flex-wrap gap-2 rounded-xl border border-earth-200 bg-earth-50 p-2">
            <Link
              to={tabLinks.estoque}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === 'estoque' ? 'bg-earth-900 text-earth-50' : 'bg-white text-earth-700 hover:bg-earth-100'
              }`}
            >
              {t('platform.storeHub.tabStock')}
            </Link>
            <Link
              to={tabLinks.grupos}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === 'grupos' ? 'bg-earth-900 text-earth-50' : 'bg-white text-earth-700 hover:bg-earth-100'
              }`}
            >
              {t('platform.storeHub.tabShowcase')}
            </Link>
          </div>

          <div className="mt-6">
            {tab === 'estoque' ? (
              <LojaEstoqueCatalog publicMode={publicMode} />
            ) : (
              <GrupoDeCompras embedded hideHeader destination="all" publicMode={publicMode} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
