import Header1 from '@/components/mvpblocks/header-1'
import { FeatureBlock3 } from '@/components/mvpblocks/feature'
import Footer4Col from '@/components/mvpblocks/footer-4col'

function LandingPage() {
  return (
    <>
      <Header1 />
      <div className="h-10 bg-white dark:bg-black"></div>
      
      <section className="w-full">
        <video
          src="/video1.mp4"
          className="w-full h-[60vw] max-h-[600px] object-cover pt-2"
          autoPlay
          loop
          muted
        />
      </section>
 
      <FeatureBlock3 />
      <Footer4Col />
    </>
  )
}

export default LandingPage;
