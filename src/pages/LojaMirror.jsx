/**
 * Loja (espelho) - Versão pública para quem não está logado.
 * Mostra os mesmos produtos da loja, mas sem opção de comprar.
 * Usuário deve fazer login para comprar.
 */
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../hooks/useLocalizedPath'
import { getProducts } from '../services/productService'
import { jpyToBrl } from '../lib/fx'
import { getCardThumbnailUrl } from '../lib/imageUtils'
import { TriCurrencyDisplay } from '../components/TriCurrencyDisplay'
import ImageLightbox from '../components/ImageLightbox'
import { getProductConditionMeta } from '../lib/productCondition'
import RichTextContent from '../components/RichTextContent'
import ProductTechnicalSpecs from '../components/ProductTechnicalSpecs'
import { richTextToPlainText } from '../lib/richText'

function getProductImages(p) {
  if (Array.isArray(p?.image_urls) && p.image_urls.length > 0) {
    return p.image_urls.filter(Boolean)
  }
  if (p?.image_url) return [p.image_url]
  return []
}

export default function LojaMirror() {
  const lp = useLocalizedPath()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailImageIndex, setDetailImageIndex] = useState(0)
  const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0, alt: '' })

  useEffect(() => {
    let isActive = true
    const run = async () => {
      try {
        const { data, error } = await getProducts()
        if (!isActive) return
        setProducts(data ?? [])
        if (error) setMessage(error.message)
      } catch (e) {
        if (isActive) setMessage(e?.message || 'Erro ao carregar produtos')
      } finally {
        if (isActive) setLoading(false)
      }
    }
    run()
    return () => { isActive = false }
  }, [])

  const openDetail = (p) => {
    setDetailProduct(p)
    setDetailImageIndex(0)
  }

  const images = detailProduct ? getProductImages(detailProduct) : []
  const openLightbox = (images, index, alt, event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    setLightbox({ open: true, images, index, alt })
  }

  return (
    <>
      <Helmet>
        <title>Loja | Delivery</title>
      </Helmet>
      <div className="px-4 pt-24 pb-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold text-earth-900">Loja</h1>
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm text-amber-900">
              Faça <Link to={lp('login')} className="font-semibold underline hover:text-amber-700">login</Link> ou{' '}
              <Link to={lp('register')} className="font-semibold underline hover:text-amber-700">cadastre-se</Link> para comprar.
            </p>
          </div>
          {message && (
            <p className="mt-4 rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-800">{message}</p>
          )}
          {loading && <p className="mt-6 text-earth-600">Carregando...</p>}
          {!loading && products.length === 0 && (
            <p className="mt-6 text-earth-600">Nenhum produto disponível no momento.</p>
          )}
          {!loading && products.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => {
                const imgs = getProductImages(p)
                const mainImg = imgs[0]
                const thumbUrl = mainImg ? getCardThumbnailUrl(mainImg) : null
                const condition = getProductConditionMeta(p.item_condition)
                return (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-lg border border-earth-200 bg-earth-50 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => openDetail(p)}
                      className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-earth-500 focus:ring-inset rounded-t-lg"
                    >
                      {mainImg ? (
                        <img
                          src={thumbUrl || mainImg}
                          alt={p.name}
                          className="h-36 w-full cursor-zoom-in object-cover"
                          loading="lazy"
                          onError={(e) => { if (e.target.src !== mainImg) e.target.src = mainImg }}
                          onClick={(e) => openLightbox(imgs, 0, p.name, e)}
                        />
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-earth-200 text-earth-500 text-sm">
                          Sem imagem
                        </div>
                      )}
                      <div className="p-3">
                        <h2 className="font-semibold text-earth-900 text-sm line-clamp-2">{p.name}</h2>
                        <span className={`mt-1 inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${condition.className}`}>
                          {condition.label}
                        </span>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-earth-600">
                            {richTextToPlainText(p.description)}
                          </p>
                        )}
                        {(() => {
                          const jpy = Number(p.price_jpy ?? p.price) || 0
                          const brl = Number(p.price_brl)
                          const usd = Number(p.price_usd)
                          const hasDeriv = Number.isFinite(brl) && brl > 0 && Number.isFinite(usd) && usd > 0
                          return (
                            <div className="mt-1.5">
                              {hasDeriv ? (
                                <TriCurrencyDisplay brl={brl} jpy={jpy} usd={usd} variant="card" />
                              ) : (
                                <TriCurrencyDisplay
                                  brl={jpyToBrl(jpy)}
                                  jpy={jpy}
                                  usd={NaN}
                                  variant="card"
                                  footnote="Cotação BRL/USD em atualização — valor em dólar após refresh."
                                />
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </button>
                    <div className="px-3 pb-3">
                      <Link
                        to={lp('login')}
                        className="block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-center text-xs font-medium text-earth-700 hover:bg-earth-50"
                      >
                        Entre para comprar
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Modal detalhes do produto */}
          {detailProduct && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setDetailProduct(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-detail-title"
            >
              <div
                className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative bg-earth-100">
                  {images.length > 0 ? (
                    <>
                      <img
                        src={images[detailImageIndex]}
                        alt={detailProduct.name}
                        className="h-64 w-full cursor-zoom-in object-contain sm:h-80"
                        onClick={(e) => openLightbox(images, detailImageIndex, detailProduct.name, e)}
                      />
                      {images.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetailImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))
                            }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                            aria-label="Foto anterior"
                          >
                            <svg className="h-5 w-5 text-earth-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetailImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                            aria-label="Próxima foto"
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
                                onClick={(e) => { e.stopPropagation(); setDetailImageIndex(i) }}
                                className={`h-2 w-2 rounded-full ${i === detailImageIndex ? 'bg-earth-800' : 'bg-earth-300'}`}
                                aria-label={`Foto ${i + 1}`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-earth-200 text-earth-500 sm:h-80">
                      Sem imagem
                    </div>
                  )}
                </div>
                <div className="p-5">
                  {(() => {
                    const condition = getProductConditionMeta(detailProduct.item_condition)
                    return (
                      <span className={`mb-2 inline-flex rounded border px-2 py-0.5 text-xs font-medium ${condition.className}`}>
                        {condition.label}
                      </span>
                    )
                  })()}
                  <h2 id="product-detail-title" className="text-xl font-bold text-earth-900">
                    {detailProduct.name}
                  </h2>
                  {detailProduct.description && (
                    <RichTextContent html={detailProduct.description} className="mt-2 text-earth-600" />
                  )}
                  <ProductTechnicalSpecs
                    template={detailProduct.spec_template}
                    specs={detailProduct.technical_specs}
                    className="mt-3"
                  />
                  {(() => {
                    const p = detailProduct
                    const jpy = Number(p.price_jpy ?? p.price) || 0
                    const brl = Number(p.price_brl)
                    const usd = Number(p.price_usd)
                    const hasDeriv = Number.isFinite(brl) && brl > 0 && Number.isFinite(usd) && usd > 0
                    return (
                      <div className="mt-4">
                        {hasDeriv ? (
                          <TriCurrencyDisplay brl={brl} jpy={jpy} usd={usd} variant="modal" />
                        ) : (
                          <TriCurrencyDisplay
                            brl={jpyToBrl(jpy)}
                            jpy={jpy}
                            usd={NaN}
                            variant="modal"
                            footnote="Cotação BRL/USD em atualização — valor em dólar após refresh."
                          />
                        )}
                      </div>
                    )
                  })()}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      to={lp('login')}
                      className="rounded-xl bg-earth-900 px-6 py-3 font-medium text-white hover:bg-earth-800"
                    >
                      Entre para comprar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDetailProduct(null)}
                      className="rounded-xl border border-earth-200 px-6 py-3 font-medium text-earth-600 hover:bg-earth-50"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
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
            prevLabel="Foto anterior"
            nextLabel="Próxima foto"
          />
        </div>
      </div>
    </>
  )
}
