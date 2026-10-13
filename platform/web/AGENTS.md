# AINS frontend

Before changing UI, read the root `DESIGN.md` and `ctds.config.json`.
CTDS rules live only in `docs/ctds/prompts/`: start with `PRINCIPLES.md`,
then `OVERRIDE.md` and the relevant component/theme documents. App-specific
adaptations are in `docs/ctds/ains-components.md` and `ains-styles.md`.
Use `npm run ctds:check-update` before CTDS work, and `npm run check:ctds`
after changing styles. Do not run the Next.js-only CTDS init/update CLI in this
Vite host; follow the safe update steps in `DESIGN.md`.
