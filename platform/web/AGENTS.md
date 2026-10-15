# AINS frontend

Before changing UI, read the root `DESIGN.md` and `ctds.config.json`.
CTDS rules live only in `docs/ctds/prompts/`: start with `PRINCIPLES.md`,
then `OVERRIDE.md` and the relevant component/theme documents. App-specific
adaptations are in `docs/ctds/ains-components.md` and `ains-styles.md`.
Use `npm run ctds:check-update` before CTDS work, and `npm run check:ctds`
after changing styles. Do not run the Next.js-only CTDS init/update CLI in this
Vite host; follow the safe update steps in `DESIGN.md`.

For spacing, compose explicit AINS recipes using CTDS tokens: parent
`.ains-section-stack` owns sibling gaps (`--space-4`); the opt-in AINS Button
extension `layout="card"` owns all four card insets (`--space-3`). Keep existing
`layout="content"` behavior and ordinary CTDS buttons unchanged. Use
`ctds-lists.jsx` List/ListItem compounds for all lists; `.ains-prose-list` may arrange those vendor rows and pass Notice action buttons through its
`actions` slot. Do not add global element spacing or duplicate a parent gap
with child margins. These recipes are opt-in, not a claim that all pages have
been migrated.

Token/component lint does not prove rendered spacing. Before completing a
spacing change, verify computed gaps and card padding plus actual element
separation on a populated screen in compact, default, and comfortable density
and a narrow viewport. Check long text, clipping, and unintended page overflow;
preserve intended board scrolling and existing compact controls.
