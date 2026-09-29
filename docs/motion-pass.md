# Motion pass

## Game rules

The motion layer presents existing state changes. Damage, rewards, enemy generation,
exercise detectors, and MediaPipe are unchanged. The existing five-second enemy
interval still resets after a player hit. The countdown warns during the last
800 ms; it does not introduce turn locks or change when attacks apply.

Every correct jumping jack still deals damage. The new 1/5–5/5 indicator celebrates
a series of five reps; it does not withhold four attacks or change damage.

## Presentation

- `src/motion/Motion.tsx`: timing constants, reduced-motion context, interruptible
  number interpolation, stable feedback text, and semantic motion events.
- `AnimatedNumber`: animates changes locally, cancels RAF on unmount, and exposes
  the target number to assistive technology without announcing every intermediate integer.
- `ProgressBar`: uses `scaleX`, with a 220 ms delayed damage trail for HP.
- Camera setup percentages describe completion of three observed stages: camera
  access, video readiness, and pose model readiness. The application chunk loader
  is indeterminate because its byte progress is unavailable. Neither uses fake progress.
- Rep confirmation uses changes in rep count. Pose frames do not restart it.
  Technique messages must remain stable for 160 ms before replacing the message.
- Battle entry lasts 1.6 seconds, or 650 ms when revisiting the same encounter.
- At a terminal reducer transition, Dashboard retains the mounted arena with a
  presentation snapshot for 760 ms. This shows HP reaching zero before the result.
  The camera and enemy timer stop immediately. Rewards are never applied by the animation.
- Victory reveals rewards and fills XP using the existing `addPlayerXp` function.
  A new level gets a fresh progress track and a short level-up event.
- Journey animates only the just-completed node, its connector, and the newly
  current node. The existing boss-to-encounter-1 reset is preserved.
- System reduced motion and the Settings toggle disable movement and number
  interpolation. Status text and final values remain available.

## Future sound adapter

Listen to the `awaken:motion` CustomEvent on `window`. Its typed `MotionEvent`
detail carries a unique `id`, `type`, and optional `exercise`, `amount`, and `target`.
Events include `rep-success`, `attack`, `damage`, `boss-attack`, `victory`, `defeat`,
and `level-up`. They describe already-confirmed game changes; subscribers must
not dispatch gameplay actions in response. No audio assets are included.

## Verification

Run `npm test` and `npm run build` (which includes TypeScript checking).

`scripts/check-motion.mjs` performs browser QA against a running Vite dev server.
It replaces only the camera transport in that browser using a Playwright route.
Synthetic poses from the existing fixtures pass through the real exercise hooks,
detectors, event adapter, reducer, and UI. No test input endpoint ships in the app.

Set `AWAKEN_URL` to the dev server address. Playwright must be available to Node;
alternatively set `AWAKEN_PLAYWRIGHT` to its module URL. Set `AWAKEN_QA_OUTPUT`
to choose a screenshot directory (default: the operating system's temporary directory).
Run `node scripts/check-motion.mjs`.

The browser run covers initial loading, camera stages, all three exercises,
jumping-jack series completion, both attack directions, ten encounters including
the boss, XP, level-up, Journey progression, defeat, retry, mobile layouts, and
reduced motion. The Vitest suite also checks StrictMode replay, repeated pose
renders, independently expiring damage numbers, interrupted number changes,
terminal HP snapshots, unchanged damage and rewards, and timer cleanup.

Synthetic camera QA does not verify real-world webcam accuracy or device-specific
MediaPipe FPS. Those require a person exercising in front of the target webcam.

Verified on 2026-09-30: 137 Vitest tests and the production build passed. The full
browser scenario passed at 1440 px and 390 px with no uncaught JavaScript errors.
A separate browser run loaded the actual MediaPipe WASM/model with Chromium's
test video device, stopped the stream, and restarted tracking successfully.
