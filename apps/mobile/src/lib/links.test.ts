import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { legalLinks, supportMailto, supportTel } from "./links";

describe("links", () => {
  it("builds legal page URLs from the admin site", () => {
    assert.deepEqual(legalLinks("https://admin.maja.app/"), {
      privacy: "https://admin.maja.app/privacy",
      dataDeletion: "https://admin.maja.app/data-deletion",
    });
  });

  it("hides legal links when the site isn't configured", () => {
    assert.equal(legalLinks(undefined), null);
    assert.equal(legalLinks("  "), null);
    assert.equal(legalLinks("admin.maja.app"), null);
  });

  it("encodes the support email subject and body", () => {
    assert.equal(
      supportMailto("Bug report", "Version 1.0 & Android", "help@maja.app"),
      "mailto:help@maja.app?subject=Bug%20report&body=Version%201.0%20%26%20Android",
    );
  });

  it("builds a tel link for the support phone", () => {
    assert.equal(supportTel("7022831039"), "tel:+917022831039");
  });
});
