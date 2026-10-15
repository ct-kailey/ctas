# UI localization

AINS has two independent language settings:

- **Interface language:** Korean (`ko`, default) or English (`en`), selected on the login screen or in appearance settings. This changes navigation, labels, instructions, and supported date/number formatting.
- **Customer question language:** the project's default language for newly generated customer questions. Existing questions can have a separate translation draft. Changing the interface language does not change this project setting, stored questions, or previously sent messages.

Documents, project/customer names, source excerpts, user-entered text, and AI results remain in their original language. The UI must not translate arbitrary API strings through the interface catalog. Known API failures may use explicit error-code mappings, while their original messages remain available for diagnosis.

Customer language support covers the current policy-risk v3 r3 flow, Question Tracker manual/follow-up records, generated pre-flight question templates, and the work-review language snapshot. The generation language is captured with the request; changing the project's default later does not change an earlier run. A Question Tracker translation is a separate draft with the source question/version preserved, and a delivery draft retains that source link. Translation does not send a message or overwrite the original question.

Legacy embedded questions retain their original content: document-change `reviews.result.questions`, `implementation_plans.result.questions`, commercial rewrite questions, Context candidate records, and domain-guide artifacts. Some legacy shared document-change prompts still specify Korean. Interface language selection neither translates these stored analytical results nor republishes their shared approval flows.

## Source-only compilation

`platform/web/i18n-transform.mjs` is a Vite pre-transform. It compiles Korean UI literals from top-level `platform/web/src/*.jsx`, `*.mjs`, and `*.js` application modules into catalog lookups. It does not inspect rendered DOM or change backend responses. CTDS/vendor components, nested application directories, and the localization runtime itself are outside this transform. Nested modules must opt in explicitly if localization is needed.

The compiler handles JSX text, known display attributes, module-level label maps, UI messages, and complete JavaScript template strings. Adjacent JSX text and expressions become one phrase with numbered placeholders. Dynamic values are passed unchanged; the JSX runtime uses keyed fragments to retain React node, list, and null behavior. Strings render as text, never as HTML.

Object keys, comparison/search operands, request payloads, editable content defaults, and non-display attributes are intentionally preserved. When a Korean literal is also used as a domain identity in a comparison, its non-display uses retain their original identity. `question-language-state.mjs` is excluded because it chooses customer message content independently of the interface language. The extraction manifest lists every exclusion for review. New application code should use language-neutral domain IDs and keep display labels separate from stored content.

Presentation calls explicitly using `ko-KR` with `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.ListFormat`, or `toLocale*String` use the selected interface locale. Search/sort operations such as `localeCompare` retain their existing semantics. The language setting does not change the project's timezone.

## Preference and navigation

`ui-language-state.mjs` resolves a validated `ui_lang=ko|en` URL override, then the saved `ains.ui.language.v1` browser preference, then Korean. The resolved locale stays fixed for the lifetime of a page, including module-level label maps. It is not changed by a storage event from another tab.

The host must resolve unsaved changes before calling `changeUiLanguage(language, window)`. That function navigates to the current URL with a validated language query parameter and retains the other parameters and hash. The next page persists the choice. Cancelling a native unload prompt therefore leaves the saved preference unchanged. The URL choice also works when browser storage is blocked. `applyUiLanguage(document.documentElement)` sets both the HTML language and CTDS's `data-lang` attribute.

## Updating the English catalog

Keep source UI copy in Korean and translations in `platform/web/src/locales/en.json`. Keys are trimmed source messages. Preserve every numbered placeholder exactly once for each occurrence in the source; translations may reorder them. Do not translate identifiers or substitute customer content into the catalog.

```sh
node platform/web/i18n-extract.mjs /tmp/ains-ui-messages.json
node platform/web/i18n-extract.mjs --check
node --test platform/tests/ui-i18n.test.js
npm run build
```

The manifest includes active keys, source module locations, and intentionally skipped literals. The check exits unsuccessfully for missing translations, blank entries, or changed placeholder sets and identifies the source modules. Run it after adding UI copy and before release. At runtime an unavailable or invalid translation falls back to the Korean source instead of dropping content. This fallback does not replace catalog verification.

To add a language, extend the validated language list, locale-tag mapping, catalog selection, and language selectors together. Verify paragraph length, button width, grouped dynamic phrases, accessible names, dates, unsaved-change navigation, and customer-language independence in a populated screen. Do not enable a language by browser detection alone; Korean remains the explicit default.
