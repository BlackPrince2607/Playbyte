import { displayCopy, hasDevanagari } from "./displayLang";

describe("displayCopy", () => {
  it("strips Devanagari in English mode", () => {
    expect(displayCopy("How often do you check news? कितनी बार?", "en")).toBe("How often do you check news?");
    expect(displayCopy("India / भारत", "en")).toBe("India");
  });

  it("keeps Hindi and drops Latin halves in Hindi mode", () => {
    expect(displayCopy("एक्साइटेड!", "hi")).toBe("एक्साइटेड!");
    expect(displayCopy("Excited! / एक्साइटेड!", "hi")).toBe("एक्साइटेड!");
  });

  it("leaves Latin-only text alone in Hindi mode as fallback", () => {
    expect(displayCopy("Once a day.", "hi")).toBe("Once a day.");
  });

  it("detects Devanagari", () => {
    expect(hasDevanagari("hello")).toBe(false);
    expect(hasDevanagari("नमस्ते")).toBe(true);
  });
});
