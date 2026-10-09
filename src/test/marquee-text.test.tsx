import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarqueeText } from "@/components/MarqueeText";

describe("MarqueeText Component", () => {
  it("renders text content with title attribute", () => {
    render(<MarqueeText text="Know My Name ft. True Damage" />);
    const el = screen.getByTitle("Know My Name ft. True Damage");
    expect(el).toBeDefined();
    expect(el.textContent).toContain("Know My Name ft. True Damage");
  });

  it("renders custom class and custom component element", () => {
    const { container } = render(
      <MarqueeText text="Short Title" as="span" className="custom-marquee" />,
    );
    const span = container.querySelector("span.marquee-container");
    expect(span).not.toBeNull();
    expect(span?.classList.contains("custom-marquee")).toBe(true);
  });
});
