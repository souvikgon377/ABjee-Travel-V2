'use client'

//import './App.css'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Users, Camera, Map, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Header1 from '@/components/mvpblocks/header-1'
import GradientTypewriter from '@/components/mvpblocks/gradient-typewriter'

const CardCarousel = dynamic(() => import('@/components/ui/card-carousel'))
const FeatureBlock3 = dynamic(() => import('@/components/mvpblocks/feature').then((mod) => mod.FeatureBlock3))
const SimplePricing = dynamic(() => import('@/components/mvpblocks/simple-pricing'))
const Faq3 = dynamic(() => import('@/components/mvpblocks/faq-3'))
const Footer4Col = dynamic(() => import('@/components/mvpblocks/footer-4col'))

const landingHighlights = [
  {
    title: 'Travel Community',
    description: 'Meet travelers, exchange ideas, and discover people planning similar journeys.',
    href: '/chat',
    cta: 'Explore Community',
    icon: Users,
  },
  {
    title: 'Chat Rooms',
    description: 'Join active travel rooms or create your own space to plan with your group in real-time.',
    href: '/chat',
    cta: 'Open Chat Rooms',
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

function LandingPage() {
  const [showCommunityPopup, setShowCommunityPopup] = useState(true)
  const [showFeaturesOverlay, setShowFeaturesOverlay] = useState(false)

  const closeCommunityPopup = () => {
    setShowCommunityPopup(false)
    setShowFeaturesOverlay(true)
  }

  return (
    <>
      <Header1 />
      <GradientTypewriter/>
      <section className="w-full">
        <video
          src="/video1.mp4" //add video link here..
          className="w-full h-[60vw] max-h-150 object-cover pt-2"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          // controls
        >
          
        </video>
      </section>

      <AnimatePresence>
        {showCommunityPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-6xl rounded-3xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-6 md:p-8 relative"
            >
              <button
                onClick={closeCommunityPopup}
                className="absolute top-4 right-4 h-9 w-9 rounded-full border border-border bg-card/80 text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                aria-label="Close community popup"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-2">
                  <p className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-rose-600 bg-rose-500/10 border border-rose-500/20 mb-3">
                    Most Loved Feature
                  </p>
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
                    Join the ABJEE Travel Community
                  </h2>
                  <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-3xl">
                    Connect with travelers, discover active groups, ask questions, and plan trips together in real-time chat rooms.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href="/chat"
                      onClick={() => setShowCommunityPopup(false)}
                      className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 transition-colors"
                    >
                      Enter Community
                    </Link>
                    <Link
                      href="/chat"
                      onClick={() => setShowCommunityPopup(false)}
                      className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold border border-border text-foreground hover:bg-muted transition-colors"
                    >
                      Browse Chat Rooms
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="py-14 px-4 md:px-8 bg-linear-to-b from-background to-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">
              Explore ABJEE Travel
            </h2>
            <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-3xl mx-auto">
              Everything you need in one place: community, live chat rooms, traveler stories, and curated itineraries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
                  <p className="text-sm text-muted-foreground mb-5 min-h-20">{item.description}</p>
                  <Link
                    href={item.href}
                    className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 transition-colors"
                  >
                    {item.cta}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>
 
      {/* <Globe1/> */}
      
      <CardCarousel
        images={[
          { src: "/img1.png", alt: "Image 1" },
          { src: "/img2.png", alt: "Image 2" },
          { src: "/img3.png", alt: "Image 3" },
          { src: "/img4.png", alt: "Image 3" },
          { src: "/img5.png", alt: "Image 3" },
          { src: "/img6.jpg", alt: "Image 3" },
          { src: "/img7.jpg", alt: "Image 3" },
          { src: "/img8.jpg", alt: "Image 3" },
        ]}
        autoplayDelay={2000}
        showPagination={true}
        showNavigation={true}
      />
      <FeatureBlock3/>
      <div id="pricing">
        <SimplePricing/>
      </div>
      <Faq3/>
      <Footer4Col/>

      <button
        onClick={() => setShowFeaturesOverlay(true)}
        className="fixed bottom-6 right-6 z-40 rounded-full px-5 py-3 text-sm font-semibold text-white bg-linear-to-r from-rose-500 to-orange-500 shadow-xl hover:from-rose-600 hover:to-orange-600 transition-all duration-300"
      >
        Explore Features
      </button>

      <AnimatePresence>
        {showFeaturesOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ duration: 0.28 }}
              className="w-full max-w-6xl rounded-3xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-6 md:p-7 relative"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
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
                        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 transition-colors"
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
    </>
  );
}

export default LandingPage;