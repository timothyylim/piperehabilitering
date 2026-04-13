# SEO Playbook — pipe-rehab.no

## Quick wins (low effort, high impact)

- [x] **Fix on-page metadata** — done 2026-04-13, commit `99360ce`
  Replaced the bare `<title>` with `Piperehabilitering – Fast pris & gratis befaring | Piperehabilitering AS`. Added `<meta name="description">`, `<meta name="robots" content="index,follow">`, `<link rel="canonical" href="https://pipe-rehab.no/">`, full Open Graph block (`og:type`, `og:url`, `og:title`, `og:description`, `og:image`, `og:locale`, `og:site_name`), and Twitter card tags.

- [x] **Upgrade schema.org to LocalBusiness** — done 2026-04-13, commit `f03a24a`
  Replaced `Organization` JSON-LD with `HomeAndConstructionBusiness`. Added `address` (Skien / Telemark / NO), `geo` (59.2103, 9.6088), `areaServed` (6 kommuner: Skien, Porsgrunn, Bamble, Siljan, Drangedal, Kragerø), `openingHoursSpecification` (Mon-Fri 08:00-16:00), `priceRange` ($$), `telephone`, `email`, `image`, `logo`, `sameAs` (empty). See follow-up tasks below.

- [ ] **Populate schema.org `sameAs` with social URLs**
  Currently `sameAs: []`. Add the real Facebook / Instagram / LinkedIn URLs (and any others) once the accounts exist. Helps Google tie the site to the brand across the web. File: `index.html` `<head>` schema block.

- [x] **Mention service region in H1/hero copy** — done 2026-04-13, commit `d343abd`
  H1 changed to `Piperehabilitering i Skien og Grenland`. Added a new service-region subtitle under the tagline listing all 6 kommuner (`Skien · Porsgrunn · Bamble · Siljan · Drangedal · Kragerø`). Reinforces the `areaServed` schema and gives Google text-content signals for local queries.

- [ ] **Set up Google Business Profile**
  Create/claim Google Business Profile for Piperehabilitering AS. Highest-ROI item for a local trades business — drives most phone calls via reviews and map pack.

- [~] **Add sitemap.xml + robots.txt and submit to Search Console** — partial 2026-04-13, commit `865413c`
  Created `sitemap.xml` (single URL, `lastmod 2026-04-13`, monthly changefreq) and `robots.txt` (allow all, disallow `/admin.html` + `/api/`, sitemap reference). **Still manual:** verify domain in Google Search Console and submit the sitemap.

## Medium effort

- [ ] **Split single page into multiple service pages**
  Break the one-page site into discrete HTML pages: `/piperehabilitering` (method overview), `/foring-stalpipe`, `/inspeksjon`, `/pris` (critical — "pris piperehabilitering" is heavily searched), `/befaring` or contact. No build step needed — just additional `.html` files.

- [ ] **Create city/region landing pages**
  Build per-city landing pages for the regions Piperehabilitering AS actually serves (e.g. `/piperehabilitering-oslo`, `/piperehabilitering-baerum`, etc.). Same template, swapped city. This is the playbook competitors like Pipefiks use to dominate local SERPs.

- [~] **Add trust signals to the site** — partial 2026-04-13, commit `658b80a`
  Added footer legal line (`Piperehabilitering AS · Org.nr 935 662 834 · MVA-registrert · Skien, Norge`) and three trust badges in the contact section (`Registrert i Foretaksregisteret`, `MVA-registrert`, `Fast pris & gratis befaring`). **Still missing:** sentral godkjenning / mesterbrev cert, insurance (ansvarsforsikring), FG-sertifikat, review count/stars, completed-jobs counter, before/after photo gallery, 3-4 customer reviews with names — all blocked on real content from the client.

- [ ] **Add real project photos with image SEO**
  Replace logo-only image set with real before/after project photos. Use descriptive filenames (e.g. `piperehabilitering-foring-stalrør-oslo.jpg`) and meaningful `alt` text. Google Images is a real traffic source for trades.

## Polish

- [ ] **Performance / Core Web Vitals tweaks**
  Site is already fast. Minor: consider self-hosting Inter to remove the render-blocking Google Fonts request (`font-display: swap` is already set).

- [ ] **Add internal linking and breadcrumbs**
  Once multiple pages exist, add internal links between service/city pages and breadcrumb navigation (with `BreadcrumbList` JSON-LD) so Google understands site structure.
