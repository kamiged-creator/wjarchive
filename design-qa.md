# 복작소 스토어 디자인 QA

- source visual truth path: `/workspace/scratch/68fd2bc448da/upload/ChatGPT Image 2026년 9월 2일 오후 06_47_25.png` (PC), `/workspace/scratch/68fd2bc448da/upload/ChatGPT Image 2026년 9월 2일 오후 06_45_12.png` (mobile)
- implementation screenshot path: Cloud Browser capture of `store.html` and `qa-mobile.html` in this QA run (the cloud-browser image stream is not filesystem-exportable)
- viewport: PC 1363 × 936 CSS px; mobile iframe viewports 360 × 850, 390 × 850, 430 × 850 CSS px
- source pixels: PC 1536 × 1024; mobile 864 × 1821
- implementation pixels: PC browser capture at 1363 CSS px; mobile comparison capture contains exact 360/390/430 CSS-pixel iframes at deviceScaleFactor 1
- density normalization: composition and responsive structure were compared at CSS-pixel viewport sizes; source images were treated as visual direction rather than pixel-identical production screenshots
- state: public store home, product list filtered to 키링, product detail open/closed, quantity 3, shipping guide anchor

**Full-view comparison evidence**

- PC retains the reference composition: centered navigation, full-width hero art, four divided service cells, four-column product rows, dark craft-story banner, new-products row, guide strip, and restrained footer.
- Mobile 360/390/430 captures show the same hierarchy with a compact header, mobile-specific hero crop, four service cells on one line, two-column cards, and fixed four-item bottom navigation. All three widths report no horizontal overflow.
- The main visual direction matches the ivory, beige, brown, black and muted red seal palette. Borders and shadows remain deliberately light.

**Focused region comparison evidence**

- Hero: desktop uses `store-desktop-hero-corrected.webp`; mobile uses the portrait `store-mobile-hero.webp`. Copy wrapping and subject placement remain readable at all checked widths.
- Service strip: four equal tracks, thin vertical dividers, consistent Bootstrap Icons line icons, and concise labels match the reference density.
- Product cards: desktop is four columns; mobile is two columns. Image ratios, heart controls, names and prices are consistent, while long descriptions and secondary buttons are removed on mobile.
- Story banner: a dedicated wide raster image uses a dark left text zone and close-up craft process on the right, matching the reference's editorial treatment.

**Findings**

- No actionable P0/P1/P2 visual or interaction issues remain.
- P3: the exact product set and prices remain dependent on Supabase content; local fallback content intentionally displays “가격 준비중.”

**Required fidelity surfaces**

- Fonts and typography: serif display type and sans-serif UI hierarchy are consistent with the source; mobile title wrapping remains stable at 360/390/430.
- Spacing and layout rhythm: 1180px desktop content width, four-column grid, generous section spacing, 8–10px radii, and subtle borders/shadows preserve the gallery-like density.
- Colors and visual tokens: ivory background, warm paper surfaces, brown accent, black text and muted seal red align with the supplied direction and maintain readable contrast.
- Image quality and asset fidelity: supplied hero assets are used at native responsive crops; product imagery remains API-first with an existing real-project fallback; the story section uses a dedicated high-resolution raster asset.
- Copy and content: service, story, product and guide copy stays specific to 복작소. Unrelated software-service benefit copy was not introduced.
- Icons: Bootstrap Icons provides one coherent line-icon family; no emoji, handcrafted SVG or CSS icon substitutes are used.
- Accessibility and behavior: semantic links/buttons, alt text, keyboard-openable product cards, Escape/close behavior, labeled quantity, and visible selected filters are present.

**Comparison history**

1. Initial PC capture found P2 issues: category pills remained visible despite the intended simplified home, four extra best cards remained in the home DOM flow, and several external product images could render blank locally.
   - Fixes: added an explicit hidden-state rule, limited the home presentation to four best cards, created a separate four-card new-products row, and added a project-image fallback.
   - Post-fix evidence: PC capture shows four complete cards with imagery and no category pills.
2. Initial mobile comparison found the header too sparse relative to the reference.
   - Fix: restored the compact line-icon tool group while retaining the fixed bottom navigation.
   - Post-fix evidence: responsive CSS and the final mobile capture maintain the compact header without horizontal overflow.

**Primary interactions tested**

- Category filter changes the all-products collection from 8 cards to the relevant subset.
- Sort selector accepts new/recommended/price ordering states.
- Product detail opens from a product card and closes from the close button.
- Quantity updates the inquiry URL (`quantity=3개`).
- Shipping guide anchor opens and is visible.
- Application console: no page-script errors; only the cloud-browser extension's own metadata warning was observed.

**Implementation checklist**

- [x] Responsive hero and navigation
- [x] Four linked service cells with dividers
- [x] Best/story/new/guide/footer home structure
- [x] Separate filtered and sorted all-products page
- [x] Product detail and inquiry quantity flow
- [x] 360/390/430 mobile and PC visual checks

**Follow-up polish**

- Replace fallback “가격 준비중” strings as final product pricing is entered in the existing admin/Supabase flow.

final result: passed
