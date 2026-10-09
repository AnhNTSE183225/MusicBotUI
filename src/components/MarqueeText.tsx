import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export interface MarqueeTextProps {
  text: string;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  speed?: number; // Pixels per second
  active?: boolean;
  hoverOnly?: boolean;
  as?: "div" | "span";
  children?: ReactNode;
}

export function MarqueeText({
  text,
  className = "",
  contentClassName = "",
  style,
  speed = 26,
  active = true,
  hoverOnly = false,
  as = "div",
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement | HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const updateOverflow = () => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const diff = content.scrollWidth - container.clientWidth;
      if (diff > 4) {
        setOverflowDistance(diff);
      } else {
        setOverflowDistance(0);
      }
    };

    updateOverflow();

    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateOverflow);
      observer.observe(container);
      return () => observer.disconnect();
    } else {
      window.addEventListener("resize", updateOverflow);
      return () => window.removeEventListener("resize", updateOverflow);
    }
  }, [text]);

  const isOverflowing = overflowDistance > 0;
  const shouldAnimate = isOverflowing && active && (!hoverOnly || isHovered);

  // Time to scroll across distance at `speed` px/sec, with 20% pause at each end
  const scrollSeconds = overflowDistance / speed;
  const duration = Math.max(5, Math.round(scrollSeconds / 0.55));

  const dynamicStyle: CSSProperties & Record<string, string> = {
    ...style,
    "--marquee-dist": `${overflowDistance}px`,
    "--marquee-dur": `${duration}s`,
  };

  const sharedProps = {
    className: `marquee-container ${shouldAnimate ? "is-marquee" : ""} ${className}`,
    style: dynamicStyle,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    title: text,
  };

  const innerContent = (
    <span ref={contentRef} className={`marquee-content ${contentClassName}`}>
      {text}
    </span>
  );

  if (as === "span") {
    return (
      <span ref={containerRef as React.RefObject<HTMLSpanElement>} {...sharedProps}>
        {innerContent}
      </span>
    );
  }

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} {...sharedProps}>
      {innerContent}
    </div>
  );
}
