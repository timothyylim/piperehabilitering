# SEO Playbook — pipe-rehab.no

## Quick wins (low effort, high impact)

- [x] **Fix on-page metadata**
  Replaced the bare `<title>` with `Piperehabilitering – Fast pris & gratis befaring | Piperehabilitering AS`. Added `<meta name="description">`, `<meta name="robots" content="index,follow">`, `<link rel="canonical" href="https://pipe-rehab.no/">`, full Open Graph block (`og:type`, `og:url`, `og:title`, `og:description`, `og:image`, `og:locale`, `og:site_name`), and Twitter card tags.

- [ ] **Upgrade schema.org to LocalBusiness**
  Replace the existing `Organization` JSON-LD with `LocalBusiness` (or `HomeAndConstructionBusiness`). Add `address`, `areaServed`, `geo`, `openingHours`, `priceRange`. Mention service region in the H1/hero copy too.

- [ ] **Set up Google Business Profile**
  Create/claim Google Business Profile for Piperehabilitering AS. Highest-ROI item for a local trades business — drives most phone calls via reviews and map pack.

- [ ] **Add sitemap.xml + robots.txt and submit to Search Console**
  Create `sitemap.xml` and `robots.txt` at the site root. Verify the domain in Google Search Console and submit the sitemap so we can see indexing status and ranking keywords.

## Medium effort

- [ ] **Split single page into multiple service pages**
  Break the one-page site into discrete HTML pages: `/piperehabilitering` (method overview), `/foring-stalpipe`, `/inspeksjon`, `/pris` (critical — "pris piperehabilitering" is heavily searched), `/befaring` or contact. No build step needed — just additional `.html` files.

- [ ] **Create city/region landing pages**
  Build per-city landing pages for the regions Piperehabilitering AS actually serves (e.g. `/piperehabilitering-oslo`, `/piperehabilitering-baerum`, etc.). Same template, swapped city. This is the playbook competitors like Pipefiks use to dominate local SERPs.

- [ ] **Add trust signals to the site**
  Surface org.nr, sentral godkjenning / mesterbrev, insurance, certifications, review count/stars, completed-jobs counter, and before/after photos. Add 3–4 customer reviews with names. Improves both conversion and indexable content.

- [ ] **Add real project photos with image SEO**
  Replace logo-only image set with real before/after project photos. Use descriptive filenames (e.g. `piperehabilitering-foring-stalrør-oslo.jpg`) and meaningful `alt` text. Google Images is a real traffic source for trades.

## Polish

- [ ] **Performance / Core Web Vitals tweaks**
  Site is already fast. Minor: consider self-hosting Inter to remove the render-blocking Google Fonts request (`font-display: swap` is already set).

- [ ] **Add internal linking and breadcrumbs**
  Once multiple pages exist, add internal links between service/city pages and breadcrumb navigation (with `BreadcrumbList` JSON-LD) so Google understands site structure.
