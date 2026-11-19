import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/landing/LandingClose";
import { DISCLAIMER, Disclaimer } from "@/components/site/Disclaimer";

describe("disclaimer", () => {
  it("keeps the exact wording the Zama program requires", () => {
    expect(DISCLAIMER).toBe("This project is not audited, endorsed or operated by Zama. Use at your own risk.");
  });

  it("renders the wording", () => {
    const { container } = render(<Disclaimer />);
    expect(within(container).getByText(DISCLAIMER)).toBeTruthy();
  });

  it("shows in the landing footer", () => {
    const { container } = render(<Footer />);
    expect(within(container).getByText(DISCLAIMER)).toBeTruthy();
  });
});
