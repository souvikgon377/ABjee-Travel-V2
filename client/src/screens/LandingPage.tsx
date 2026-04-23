'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Users, Camera, Map, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { publicAsset } from '@/lib/publicAsset'

const Header1 = dynamic(() => import('@/components/mvpblocks/header-1'), {
  ssr: false,
  loading: () => <div className="h-16 w-full md:h-20" />,
})
const GradientTypewriter = dynamic(() => import('@/components/mvpblocks/gradient-typewriter'), {
  ssr: false,
  loading: () => <div className="min-h-14 w-full px-4 pt-9" />,
})
const CardCarousel = dynamic(() => import('@/components/ui/card-carousel'), { ssr: false })
const FeatureBlock3 = dynamic(() => import('@/components/mvpblocks/feature').then((mod) => mod.FeatureBlock3), { ssr: false })
const Faq3 = dynamic(() => import('@/components/mvpblocks/faq-3'), { ssr: false })
const Footer4Col = dynamic(() => import('@/components/mvpblocks/footer-4col'), { ssr: false })
const OfferSpotlightPopup = dynamic(() => import('@/components/ui/offer-spotlight-popup'), { ssr: false })

const landingHighlights = [
  {
    title: 'Travel Community',
    description: 'Meet travelers, exchange ideas, and discover people planning similar journeys.',
    href: '/community',
    cta: 'Explore Community',
    icon: Users,
  },
  {
    title: 'Chat Communities',
    description: 'Join active travel communities or create your own space to plan with your group in real-time.',
    href: '/community',
    cta: 'Open Chat Communities',
    icon: MessageCircle,
  },
  {
    title: 'Trip Stories',
    description: 'Get inspired by real travel photos and stories shared by fellow travelers.',
    href: '/trip-stories',
    cta: 'View Trip Stories',
    icon: Camera,
  },
  {
    title: 'Travel Itinerary',
    description: 'Browse destination plans with top places, restaurants, hotels, media, and travel maps.',
    href: '/travel-destinations',
    cta: 'Plan Your Trip',
    icon: Map,
  },
]

type HomeOffer = {
  id: string
  title: string
  description: string
  badge: string
  ctaText: string
  ctaHref: string
  isActive: boolean
  priority?: number
}

function LandingPage() {
  const [showCommunityPopup, setShowCommunityPopup] = useState(false)
  const [showFeaturesOverlay, setShowFeaturesOverlay] = useState(false)
  const [offers, setOffers] = useState<HomeOffer[]>([])

  useEffect(() => {
    const dismissed = window.sessionStorage.getItem('abjee-community-popup-dismissed')
    if (dismissed === '1') return

    const timer = window.setTimeout(() => {
      setShowCommunityPopup(true)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadOffers = async () => {
      try {
        const response = await fetch('/api/offers')
        const payload = await response.json().catch(() => ({ success: false }))
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || 'Failed to fetch offers')
        }
        if (cancelled) return

        const rows = (Array.isArray(payload?.data) ? payload.data : [])
          .map((offer: any) => ({ id: String(offer.id || ''), ...(offer as Omit<HomeOffer, 'id'>) }))
          .filter((offer: HomeOffer) => offer.isActive)
          .sort((a: HomeOffer, b: HomeOffer) => (a.priority ?? 999) - (b.priority ?? 999))
        setOffers(rows)
      } catch {
        if (!cancelled) setOffers([])
      }
    }

    void loadOffers()

    return () => {
      cancelled = true
    }
  }, [])

  const closeCommunityPopup = () => {
    window.sessionStorage.setItem('abjee-community-popup-dismissed', '1')
    setShowCommunityPopup(false)
    setShowFeaturesOverlay(true)
  }

  return (
    <main className="overflow-x-clip pt-16 md:pt-20">
      <Header1 />
      <GradientTypewriter/>
      <section className="w-full" aria-label="Featured travel video">
        <video
          src={publicAsset('/video1.mp4')}
          className="h-[58vw] max-h-170 min-h-55 w-full object-cover pt-2 sm:h-[52vw]"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
      </section>

      <AnimatePresence>
        {showCommunityPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.28 }}
              className="relative my-4 max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-xl sm:my-6 sm:rounded-3xl sm:p-6 md:p-8"
            >
              <button
                onClick={closeCommunityPopup}
                className="absolute top-4 right-4 h-9 w-9 rounded-full border border-border bg-card/80 text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                aria-label="Close community popup"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-3 lg:items-center">
                <div className="lg:col-span-2">
                  <p className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-rose-600 bg-rose-500/10 border border-rose-500/20 mb-3">
                    Most Loved Feature
                  </p>
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
                    Join the ABJEE Travel Community
                  </h2>
                  <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-3xl">
                    Connect with travelers, discover active groups, ask questions, and plan trips together in real-time chat communities.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href="/community"
                      onClick={() => {
                        window.sessionStorage.setItem('abjee-community-popup-dismissed', '1')
                        setShowCommunityPopup(false)
                      }}
                      className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 transition-colors"
                    >
                      Enter Community
                    </Link>
                    <Link
                      href="/community"
                      onClick={() => {
                        window.sessionStorage.setItem('abjee-community-popup-dismissed', '1')
                        setShowCommunityPopup(false)
                      }}
                      className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold border border-border text-foreground hover:bg-muted transition-colors"
                    >
                      Browse Chat Communities
                    </Link>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card/70 p-5">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Why community first?</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Meet travelers by destination and travel style</li>
                    <li>• Get local tips instantly from active members</li>
                    <li>• Plan itineraries faster with group collaboration</li>
                  </ul>
                </div>
              </div>

              {offers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.35 }}
                  className="mt-6 rounded-2xl border border-rose-300/50 bg-linear-to-br from-rose-100/70 via-orange-100/70 to-amber-100/70 dark:from-rose-950/35 dark:via-orange-950/30 dark:to-amber-950/30 p-4 sm:p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-lg sm:text-xl font-extrabold tracking-tight bg-linear-to-r from-rose-600 to-orange-500 bg-clip-text text-transparent">
                      Live Offers
                    </h3>
                    <span className="rounded-full border border-rose-400/40 bg-white/70 dark:bg-black/20 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                      Updated by admin
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {offers.slice(0, 6).map((offer, index) => (
                      <motion.div
                        key={offer.id}
                        initial={{ opacity: 0, y: 18, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: index * 0.06, duration: 0.3 }}
                        className="group relative overflow-hidden rounded-xl border border-rose-300/40 bg-white/85 dark:bg-slate-900/70 p-4 shadow-sm"
                      >
                        <div className="absolute inset-0 bg-linear-to-br from-rose-500/0 via-orange-500/0 to-amber-500/0 group-hover:from-rose-500/10 group-hover:via-orange-500/10 group-hover:to-amber-500/10 transition-all duration-300" />
                        <div className="relative">
                          <p className="inline-flex items-center rounded-full border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                            {offer.badge || 'Featured'}
                          </p>
                          <h4 className="mt-2 text-base font-bold text-foreground line-clamp-2">{offer.title}</h4>
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-3 min-h-16">{offer.description}</p>
                          <Link
                            href={offer.ctaHref || '/community'}
                            onClick={() => {
                              window.sessionStorage.setItem('abjee-community-popup-dismissed', '1')
                              setShowCommunityPopup(false)
                            }}
                            className="mt-3 inline-flex items-center justify-center rounded-lg bg-linear-to-r from-rose-500 to-orange-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:from-rose-600 hover:to-orange-600"
                          >
                            {offer.ctaText || 'Explore'}
                          </Link>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <OfferSpotlightPopup
        offers={offers}
        contextLabel="Home Offers"
      />

      <section className="bg-linear-to-b from-background to-muted/30 px-4 py-12 md:px-8 md:py-14">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">
              Explore ABJEE Travel
            </h2>
            <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-3xl mx-auto">
              Everything you need in one place: community, live chat communities, traveler stories, and curated itineraries.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {landingHighlights.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-card/70 backdrop-blur p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="h-11 w-11 rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="mb-5 min-h-20 text-sm text-muted-foreground">{item.description}</p>
                  <Link
                    href={item.href}
                    className="inline-flex items-center justify-center rounded-xl bg-linear-to-r from-rose-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:from-rose-600 hover:to-orange-600"
                  >
                    {item.cta}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <CardCarousel
        images={[
          { src: publicAsset('/img1.png'), alt: "Image 1" },
          { src: publicAsset('/img2.png'), alt: "Image 2" },
          { src: publicAsset('/img3.png'), alt: "Image 3" },
          { src: publicAsset('/img4.png'), alt: "Image 3" },
          { src: publicAsset('/img5.png'), alt: "Image 3" },
          { src: publicAsset('/img6.jpg'), alt: "Image 3" },
          { src: publicAsset('/img7.jpg'), alt: "Image 3" },
          { src: publicAsset('/img8.jpg'), alt: "Image 3" },
        ]}
        autoplayDelay={2000}
        showPagination={true}
        showNavigation={true}
      />
      <FeatureBlock3/>
      <Faq3/>
      <Footer4Col/>

      <button
        onClick={() => setShowFeaturesOverlay(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-linear-to-r from-rose-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-xl transition-all duration-300 hover:from-rose-600 hover:to-orange-600 sm:bottom-6 sm:right-6 sm:px-5 sm:py-3"
      >
        Explore Features
      </button>

      <AnimatePresence>
        {showFeaturesOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ duration: 0.28 }}
              className="relative my-4 max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-xl sm:my-6 sm:rounded-3xl sm:p-6 md:p-7"
            >
              <button
                onClick={() => setShowFeaturesOverlay(false)}
                className="absolute top-4 right-4 h-9 w-9 rounded-full border border-border bg-card/80 text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                aria-label="Close feature overlay"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-2xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent mb-5">
                ABJEE Travel Features
              </h2>

              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {landingHighlights.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, y: 16, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: index * 0.08, duration: 0.35 }}
                      className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm"
                    >
                      <div className="h-10 w-10 rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center mb-3">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">{item.description}</p>
                      <Link
                        href={item.href}
                        onClick={() => setShowFeaturesOverlay(false)}
                        className="inline-flex w-full items-center justify-center rounded-lg bg-linear-to-r from-rose-500 to-orange-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:from-rose-600 hover:to-orange-600 sm:w-auto"
                      >
                        {item.cta}
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default LandingPage;