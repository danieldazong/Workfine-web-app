import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function useScrollReveal() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      // ── Standard fade-up reveals (scroll-scrubbed) ────────────
      const targets = gsap.utils.toArray<HTMLElement>("[data-reveal]");

      targets.forEach((target) => {
        gsap.fromTo(
          target,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: target,
              start: "top 90%",
              end: "top 55%",
              scrub: true,
            },
          }
        );
      });

      // ── Directional card reveals (scroll-scrubbed) ────────────
      const cards = gsap.utils.toArray<HTMLElement>("[data-reveal-card]");

      cards.forEach((card) => {
        const dir = card.getAttribute("data-reveal-dir");
        const fromVars =
          dir === "left"
            ? { opacity: 0, x: -80 }
            : dir === "right"
            ? { opacity: 0, x: 80 }
            : { opacity: 0, y: 60 };

        gsap.fromTo(card, fromVars, {
          opacity: 1,
          x: 0,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: card,
            start: "top 90%",
            end: "top 55%",
            scrub: true,
          },
        });
      });
    }, el);

    const t = setTimeout(() => ScrollTrigger.refresh(), 400);

    return () => {
      clearTimeout(t);
      ctx.revert();
    };
  }, []);

  return containerRef;
}
