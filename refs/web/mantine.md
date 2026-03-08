# Mantine + Bun notes

- Import `@mantine/core/styles.css` once in app entry before rendering.
- `MantineProvider` at root is enough for this client-only SPA; no SSR color script needed.
- Bun HTML entry + browser build handles Mantine CSS imports cleanly; no Vite/Next layer needed.
- Mantine PostCSS is optional. Skip until custom CSS needs Mantine mixins/functions.
- GitHub Pages still needs hash routing for reliable deep-link refresh behavior.
- Keep custom CSS for brand/background polish only; use Mantine primitives for layout, cards, tables, buttons, and typography.
