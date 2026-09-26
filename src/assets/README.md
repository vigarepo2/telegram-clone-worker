# Visual assets

All application icons are local SVG files in `icons/`. The application mark is `logo.svg`.

The standalone `favicon.svg` uses its own light and dark colors and a slightly heavier stroke for browser tabs. Keep `logo.svg` color-independent for use inside the application.

- 24 × 24 view box, rounded joins and a consistent 1.75 px stroke.
- Icons inherit the text color through `currentColor`.
- Use the shared `Icon` component with an asset name, such as `<Icon name="copy" />`.
- Artwork is bundled inline so it inherits the surrounding text color in light and dark modes without a network request.
- Icon-only buttons need an accessible label on the button. Decorative icons are hidden from assistive technology automatically.
- For an icon that conveys information by itself, provide a short title, such as `<Icon name="check-circle" title="Connected" />`.
- Add new artwork here so source assets remain easy to find and change.
