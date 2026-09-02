# 복작소 스토어 디자인 QA

- source visual truth: `../upload/ChatGPT Image 2026년 9월 2일 오후 06_47_25.png` (PC), `../upload/ChatGPT Image 2026년 9월 2일 오후 06_45_12.png` (mobile)
- implementation screenshots: browser-captured PC and 390 px mobile views
- comparison evidence: side-by-side visual comparison performed during browser QA
- tested state: store home initial state, all-products filters and sorting, product-detail open state

## Capture normalization

- PC source: 1536 × 1024 px. Browser implementation: 1348 × 2837 px at 1348 CSS px wide, device scale factor 1. Above-the-fold comparison normalized to 800 × 533 px per side.
- Mobile source: 864 × 1821 px. Browser implementation captured from a 390 CSS px iframe viewport at device scale factor 1. The visible 405 × 900 px iframe frame includes a 390 px content viewport plus scrollbar; comparison uses the same 405 × 900 display area.
- Additional responsive measurements: 360, 390, 430 and 768 CSS px.

## Full-view comparison evidence

- PC composition preserves the source hierarchy: restrained centered navigation, full-width hero, four-part service strip and four-column product gallery. The implementation intentionally includes the requested PC navigation header, which is absent from the supplied cropped PC reference.
- Mobile composition follows the source sequence and density: compact header, portrait hero, one-line four-part service strip and two-column product cards. The working view keeps the fixed bottom navigation requested for mobile.

## Focused-region comparison evidence

- Header/hero: desktop and mobile use the supplied dedicated hero assets with device-specific crops. Mobile now shows search, bag and menu controls.
- Product grid: 2 columns at 360/390/430 px, 3 columns at 768 px and 4 columns at desktop; no horizontal overflow measured.
- Story banner: the editorial hand-carving image, dark overlay, serif headline and compact CTA match the reference's handcrafted brand tone.
- Product cards: consistent image ratio, subtle border/shadow, title, price and heart action. Existing API images remain the source of truth; fallback imagery is only used when an image cannot load.

## Required fidelity surfaces

- Fonts and typography: Korean serif treatment is used for hero/story display text and system sans for navigation and commerce text. Hierarchy and wrapping match the reference closely at tested widths.
- Spacing and layout rhythm: section spacing, four-part service strip, card gaps and border radii are consistent. No overflow at 360, 390, 430, 768 or 1348 px.
- Colors and visual tokens: ivory, beige, brown, black and restrained seal red are maintained; decoration and gold use are minimal.
- Image quality and asset fidelity: supplied hero imagery is used directly; product cards retain existing product/API photos; the story image uses a purpose-built photographic asset rather than CSS art or a placeholder.
- Copy and content: requested section labels, service names, filters, sorting choices, guide anchors, detail options, quantity and inquiry flow are present.

## Interaction and console checks

- Tested category filter: 3 fallback products → 1 keyring result.
- Tested sorting: new-product order updates.
- Tested product card navigation: opens the matching detail view.
- Tested responsive services: four equal-width items on one line.
- Browser console: no application errors. Only the cloud-browser extension's own metadata warnings were observed.

## Comparison history

- P1: home lacked separate story/new-product/guide regions. Fixed by adding the requested page sequence and verifying all sections render.
- P1: service items were not links. Fixed with anchored guide sections and verified equal-width responsive layout.
- P2: tablet grid used two columns. Fixed to three columns at 768 px; post-fix measurement confirms three tracks and zero overflow.
- P2: mobile header hid all utility controls. Fixed to show search, bag and menu; post-fix measurement confirms three visible controls.
- P2: failed remote images could leave blank cards during local preview. Fixed with a real existing-image fallback while preserving Supabase/ImageKit URLs as primary.

## Findings

No actionable P0/P1/P2 differences remain. The implementation includes intentional commerce additions requested in the brief, including a separate all-products page, a guide page, mobile bottom navigation and a working product-detail flow.

## Follow-up polish

- P3: replace temporary business-information copy when registration, address and support details are finalized.
- P3: once payment is activated, replace the current inquiry-first CTA with the production checkout action.

final result: passed
