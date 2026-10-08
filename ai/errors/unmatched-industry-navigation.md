# Unmatched industry navigation route

- **Symptoms:** Route contract test found `/industries/merchants` in the menu while the site only implemented `/industries`.
- **Root cause:** Navigation had a placeholder detail route without a page implementation.
- **Affected files:** `content/site.js`, `tests/site-routes.test.js`.
- **Solution:** Point the menu to the supported Industries landing route and keep the route test covering every menu destination.
- **Tests:** `npm test` passes 6/6 after correction.
- **Regression risk:** Low; new detail pages must be added to routes, sitemap and route contract together.
