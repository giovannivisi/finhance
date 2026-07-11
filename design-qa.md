# App lock and splash follow-up design QA

- Source visual truth: `/Users/giovannivisi/.codex/visualizations/2026/07/09/019f48f3-8322-7a51-8735-031425696830/finhance-native-splash-recording-reference.png`
- Original recording: `/Users/giovannivisi/Downloads/ScreenRecording_07-10-2026 11-54-57 AM_1.MP4`
- Implementation asset render: `/Users/giovannivisi/.codex/visualizations/2026/07/09/019f48f3-8322-7a51-8735-031425696830/finhance-splash-native-assets-light-dark.png`
- Previous lock-screen surrogate: `/Users/giovannivisi/.codex/visualizations/2026/07/09/019f48f3-8322-7a51-8735-031425696830/finhance-lock-dark-web-preview.png`
- Viewport: 390 × 844 for the implementation asset render; the recording is an iPhone screen recording at 1206 × 2622 pixels.
- State: cold launch, light and dark appearance; Face ID prompt and 30-second background grace behaviour require a native device.

## Findings

- [P1] The native-to-JavaScript transition still needs an on-device capture
  - Location: cold launch in light and dark appearance.
  - Evidence: the recording proves the installed native project was still using the old dark-only splash, followed by a smaller app-rendered light icon. The regenerated iOS asset catalogue now contains matched 160-point light and dark logo variants and matched background colours, while the JavaScript launch cover uses the same source assets, size, colours and an immediate no-fade hand-off. A compiled on-device capture is not available in this environment.
  - Impact: asset fidelity is verified, but only a rebuilt native binary can prove there is no visible frame or scale change during launch.
  - Fix: rebuild/reinstall the iOS app and capture one cold launch in each appearance.

- [P1] Face ID timing and the grace-period transition require a real device
  - Location: login, initial app-lock launch, and return from background.
  - Evidence: the lifecycle state machine now bypasses app lock while signed out, keeps an unlocked session valid for 30 seconds in the background, and invalidates stale biometric attempts. Unit tests cover the state transitions, but Expo cannot exercise Face ID in a browser surrogate.
  - Impact: the product behaviour is implemented and regression-tested, but the native permission sheet and biometric prompt order are not visually verified.
  - Fix: verify no Face ID prompt appears on login, a two-second app switch resumes directly, and a return after more than 30 seconds prompts once.

## Required fidelity surfaces

- Fonts and typography: unchanged from the previously implemented Inter-based lock screen; no new typography was introduced in this follow-up.
- Spacing and layout rhythm: native and JavaScript launch artwork are both centred in a 160-point box. The prior lock-screen layout remains unchanged.
- Colours and visual tokens: light uses `#f4f4f5` with the black logo; dark uses `#050505` with the white logo. These values exactly match the app theme tokens and generated iOS colour assets.
- Image quality and asset fidelity: the supplied dark splash logo remains the source of truth. The light variant is an exact recolour with transparency and green brand mark preserved. Expo export includes both assets, and the regenerated iOS catalogue includes 1×, 2× and 3× light/dark variants.
- Copy and content: no launch copy was added. Existing lock-screen copy is unchanged.

## Comparison history

1. The supplied recording showed the old dark-only native splash changing to a smaller rounded-square light icon.
2. The splash sources were changed to matching transparent brand marks, both layers were set to 160 points, the decorative launch glow was removed, and the fade was disabled.
3. Expo prebuild regenerated the local iOS light/dark colour and image catalogues. The combined asset render confirms matched centring, scale, background treatment and brand-mark fidelity.
4. A release/dev build cannot be launched on the user's physical iPhone from this environment, so native transition and Face ID visual verification remain blocked.

## Implementation checklist

- Rebuild and reinstall the iOS binary so the native splash catalogue is refreshed.
- Capture cold launches in light and dark appearance.
- Verify signed-out launch, a return within 30 seconds, and a return after 30 seconds with Face ID enabled.
- Confirm Face ID permission is first requested only when enabling it from Settings.

final result: blocked
