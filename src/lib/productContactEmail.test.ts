import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for issue #49, section 6: the product contact email.
//
// Every user-facing surface that displays a support/contact email must
// use the product address civilosaibd@gmail.com. A personal Gmail
// address must not reappear as a displayed contact email on these
// pages. (The same personal address legitimately exists inside SQL
// migrations and test fixtures as an auth/bootstrap identity — that is
// NOT a displayed contact email and is intentionally out of scope.)

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

const PRODUCT_EMAIL = "civilosaibd@gmail.com";
const PERSONAL_EMAIL = "zobaerhasan431@gmail.com";

const displayedContactSurfaces = [
  "src/components/Footer.tsx",
  "src/pages/PrivacyPolicyPage.tsx",
  "src/pages/TermsOfServicePage.tsx",
];

describe("product contact email (#49)", () => {
  for (const file of displayedContactSurfaces) {
    it(`${file} displays the product contact email only`, () => {
      const source = readSource(file);
      expect(source).toContain(`mailto:${PRODUCT_EMAIL}`);
      expect(source).not.toContain(PERSONAL_EMAIL);
    });
  }
});
