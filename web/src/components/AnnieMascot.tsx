import { useEffect, useRef } from "react";
import lottie from "lottie-web";

interface AnnieMascotProps {
  size?: number;
  className?: string;
}

export function AnnieMascot({ size = 34, className = "" }: AnnieMascotProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim = lottie.loadAnimation({
      container: el,
      renderer: "svg",
      loop: true,
      autoplay: !reduce,
      path: "/annie-mascot.json",
    });
    return () => {
      anim.destroy();
      el.replaceChildren();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ width: size, height: size }}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}
