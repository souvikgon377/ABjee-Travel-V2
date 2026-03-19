//import './App.css'
import dynamic from 'next/dynamic'
import Header1 from '@/components/mvpblocks/header-1'
import GradientTypewriter from '@/components/mvpblocks/gradient-typewriter'

const CardCarousel = dynamic(() => import('@/components/ui/card-carousel'))
const FeatureBlock3 = dynamic(() => import('@/components/mvpblocks/feature').then((mod) => mod.FeatureBlock3))
const SimplePricing = dynamic(() => import('@/components/mvpblocks/simple-pricing'))
const Faq3 = dynamic(() => import('@/components/mvpblocks/faq-3'))
const Footer4Col = dynamic(() => import('@/components/mvpblocks/footer-4col'))

function LandingPage() {
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
    </>
  );
}

export default LandingPage;