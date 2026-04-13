// components/CardCarousel.tsx
import React from "react"
import { Swiper, SwiperSlide } from "swiper/react"

import "swiper/css"
import "swiper/css/effect-coverflow"
import "swiper/css/pagination"
import "swiper/css/navigation"

import {
  Autoplay,
  EffectCoverflow,
  Navigation,
  Pagination,
} from "swiper/modules"


interface CarouselProps {
  images: { src: string; alt: string }[]
  autoplayDelay?: number
  showPagination?: boolean
  showNavigation?: boolean
}

const CardCarousel: React.FC<CarouselProps> = ({
  images,
  autoplayDelay = 1500,
  showPagination = true,
  showNavigation = true,
}) => {
  const shouldUseSwiper = images.length > 1
  const shouldLoop = images.length > 2

  const swiperCss = `
    .swiper {
      width: 100%;
      padding-bottom: 50px;
    }

    .swiper-slide {
      background-position: center;
      background-size: cover;
      width: 300px;
    }

    .swiper-slide img {
      display: block;
      width: 100%;
    }

    .swiper-3d .swiper-slide-shadow-left,
    .swiper-3d .swiper-slide-shadow-right {
      background: none;
    }
  `

  return (
    <section className="w-full space-y-4 mt-15">
      <style>{swiperCss}</style>

      <div className="w-full rounded-3xl border border-black/5 p-2 shadow-sm md:rounded-t-[44px]">
        <div className="relative mx-auto flex w-full flex-col rounded-3xl border border-black/5 bg-neutral-800/5 p-2 shadow-sm md:items-start md:gap-8 md:rounded-b-[20px] md:rounded-t-[40px] md:p-2">
          {/* Title & Description */}
          <div className="flex flex-col items-center justify-center pb-2 pt-2 w-full">
            <h3 className="bg-linear-to-r from-rose-600 to-pink-500 bg-clip-text text-2xl md:text-4xl font-bold text-transparent mt-8 text-center w-full">
              Different attractions over World
            </h3>

            {/* <p>Seamless Images carousel animation.</p> */}
          </div>

          {/* Swiper Carousel */}
          <div className="flex w-full items-center justify-center gap-4">
            <div className="w-full">
              {shouldUseSwiper ? (
                <Swiper
                  spaceBetween={50}
                  autoplay={{
                    delay: autoplayDelay,
                    disableOnInteraction: false,
                  }}
                  effect="coverflow"
                  grabCursor
                  centeredSlides
                  loop={shouldLoop}
                  slidesPerView="auto"
                  coverflowEffect={{
                    rotate: 0,
                    stretch: 0,
                    depth: 100,
                    modifier: 2.5,
                  }}
                  pagination={showPagination}
                  navigation={
                    showNavigation
                      ? {
                          nextEl: ".swiper-button-next",
                          prevEl: ".swiper-button-prev",
                        }
                      : undefined
                  }
                  modules={[EffectCoverflow, Autoplay, Pagination, Navigation]}
                >
                  {images.map((image, index) => (
                    <SwiperSlide key={index}>
                      <div className="aspect-4/3 w-full overflow-hidden rounded-xl">
                        <img
                          src={image.src}
                          width={500}
                          height={500}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover rounded-xl"
                          alt={image.alt}
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              ) : (
                <div className="aspect-4/3 w-full overflow-hidden rounded-xl">
                  <img
                    src={images[0].src}
                    width={500}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover rounded-xl"
                    alt={images[0].alt}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CardCarousel;