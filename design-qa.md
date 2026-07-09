# Lock screen design QA

- Source visual truth (dark): `/Users/giovannivisi/.codex/generated_images/019f48f3-8322-7a51-8735-031425696830/exec-9c780c6c-79b4-425d-8b4b-d52edf0d7b59.png`
- Source visual truth (light): `/Users/giovannivisi/.codex/generated_images/019f48f3-8322-7a51-8735-031425696830/exec-5112453e-0c29-4614-bf0c-6d3f06196ca6.png`
- Implementation screenshot: `/Users/giovannivisi/.codex/visualizations/2026/07/09/019f48f3-8322-7a51-8735-031425696830/finhance-lock-dark-web-preview.png`
- Viewport: 390 × 844
- State: dark theme, eight entered digits, passcode check in progress
- Surface: Expo React Native Web surrogate for an iOS-native screen

## Findings

- [P1] The web surrogate did not render native image and icon-font layers
  - Location: app logo, Face ID key, submit arrow, backspace key and shield footer icon.
  - Evidence: the source shows every supplied/icon-library asset; the browser capture omitted the React Native `Image` background layer and Ionicons glyphs even though their layout boxes were present. The iOS export resolved both PNG assets and the Ionicons font successfully.
  - Impact: the available browser screenshot cannot prove asset fidelity for the actual native target.
  - Fix: capture the release/dev build on an iPhone after reinstalling the native splash configuration.

- [P1] The light implementation state could not be captured
  - Location: complete lock screen.
  - Evidence: the dark browser surrogate was captured, but the preview server needed a cleared restart before the light pass. The environment rejected that restart after its execution allowance was exhausted.
  - Impact: light-theme contrast, icon selection and glow fidelity remain unverified visually.
  - Fix: capture the same checking state on-device with the app theme set to Light.

- [P2] The final lower logo position was not recaptured
  - Location: upper lock-screen composition.
  - Evidence: the initial comparison showed the intro approximately 80 points higher than the chosen reference. The implementation was adjusted to a 168-point minimum top inset for regular-height phones, but the environment could not restart the preview to capture the post-fix result.
  - Impact: the code matches the measured target more closely, but the final spacing still requires visual confirmation.
  - Fix: confirm the logo begins around 168 points from the top of a 390 × 844 content frame and that the keypad/footer remain fully visible.

## Required fidelity surfaces

- Fonts and typography: Inter families, weights, sizes and wrapping are mapped to the existing app tokens. The web screenshot used a fallback rendering, so native optical fidelity is unverified.
- Spacing and layout rhythm: keypad and footer positions matched the reference closely in the first comparison. The intro offset was corrected after comparison; recapture is pending.
- Colours and visual tokens: the implementation uses the existing dark/light theme tokens and shared `ScreenGlow`, avoiding the rejected wallpaper treatment.
- Image quality and asset fidelity: supplied 1024 px light/dark app icons are used directly. Native export includes both. Browser visual proof is blocked by the React Native Web image layer.
- Copy and content: matches the approved direction, with the platform-neutral Android biometric label intentionally replacing “Face ID” off iOS.

## Comparison history

1. The first preview rendered the real storage-error gate because SecureStore is unavailable on web. A temporary development-only fixture exposed the implemented passcode screen for comparison.
2. Full-view comparison found the keypad scale and lower-half rhythm close to the source, but the intro was too high and native asset layers were absent in the web surrogate.
3. The intro minimum top inset was increased from 96 to 168 points. Temporary preview-only code was removed. A post-fix native-equivalent capture could not be produced because the preview restart was rejected by the environment.

## Implementation checklist

- Capture dark and light checking states on a real iPhone/dev build.
- Confirm the native splash follows the device appearance and transitions to the hydrated app-theme launch cover.
- Confirm Face ID appears over the launch cover, successful authentication opens the app directly, and failure/cancellation reveals the keypad.
- Confirm create/change passcode buttons show loading feedback immediately.

final result: blocked
