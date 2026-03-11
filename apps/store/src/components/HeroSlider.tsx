"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ButtonLink } from "@/components/Button";

export type HeroBanner = {
  id: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
  imageUrl?: string;
  order: number;
};

const AUTOPLAY_INTERVAL_MS = 6000;

export function HeroSlider({
  banners,
  loading = false,
}: {
  banners: HeroBanner[];
  loading?: boolean;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    duration: 25,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", () => setSelectedIndex(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  const startAutoplay = useCallback(() => {
    if (!emblaApi) return;
    autoplayRef.current = setInterval(() => {
      emblaApi.scrollNext();
    }, AUTOPLAY_INTERVAL_MS);
  }, [emblaApi]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    startAutoplay();
    return () => stopAutoplay();
  }, [emblaApi, startAutoplay, stopAutoplay]);

  const slides =
    banners.length > 0
      ? banners
      : [
          {
            id: "default",
            title: "Каталог стоматологічних компонентів",
            subtitle: "Якість та надійність для професійної практики.",
            ctaText: "Перейти в каталог",
            ctaHref: "#catalog",
            order: 0,
          } as HeroBanner,
        ];

  if (loading) {
    return (
      <section
        className="min-h-[320px] bg-[var(--primary)] px-4 py-16 md:py-24 flex flex-col justify-center"
        aria-hidden
      >
        <div className="mx-auto max-w-6xl md:max-w-none md:px-6">
          <div className="h-10 w-3/4 max-w-md animate-pulse rounded bg-white/20" />
          <div className="mt-3 h-5 w-1/2 max-w-sm animate-pulse rounded bg-white/10" />
        </div>
      </section>
    );
  }

  return (
    <div
      className="overflow-hidden"
      onMouseEnter={stopAutoplay}
      onMouseLeave={() => startAutoplay()}
    >
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex touch-pan-y">
          {slides.map((slide) => (
            <div
              key={slide.id}
              className="relative min-w-0 flex-[0_0_100%]"
              style={{ minHeight: "min(70vh, 420px)" }}
            >
              <div
                className={
                  slide.imageUrl
                    ? "flex min-h-[320px] flex-col justify-center px-4 py-16 md:min-h-[380px] md:py-24 md:px-6"
                    : "hero-slide-gradient flex min-h-[320px] flex-col justify-center px-4 py-16 md:min-h-[380px] md:py-24 md:px-6"
                }
                style={
                  slide.imageUrl
                    ? {
                        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.4), rgba(0,0,0,0.2)), url(${slide.imageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                <div
                  className={`mx-auto max-w-6xl md:max-w-none ${slide.imageUrl ? "text-white" : "text-white"}`}
                >
                  <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
                    {slide.title}
                  </h1>
                  {slide.subtitle && (
                    <p className="mt-3 max-w-xl text-lg text-blue-100">
                      {slide.subtitle}
                    </p>
                  )}
                  {(slide.ctaText && slide.ctaHref) && (
                    <div className="mt-8">
                      <ButtonLink
                        href={slide.ctaHref}
                        variant="secondary"
                        className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                      >
                        {slide.ctaText}
                      </ButtonLink>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && emblaApi && (
        <div className="flex justify-center gap-2 py-3">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi.scrollTo(i)}
              className={`h-2 w-2 rounded-full transition hover:opacity-100 ${
                i === selectedIndex ? "bg-[var(--primary)] opacity-100" : "bg-[var(--primary)]/40 opacity-70"
              }`}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === selectedIndex ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
