@AGENTS.md

## Project rules

- Tailwind v4 emits `.hidden` **before** `.inline-flex`/`.flex`, so passing `hidden`
  through a component's `className` will not override a base `inline-flex`. Hide such
  components with a wrapper element instead.
