# AWAKEN interface redesign

The interface shares a dark neutral shell, restrained lime accent, Feather icons,
tabular game values, and reusable health/XP progress bars. The shell covers Home,
Journey, Training, Profile, Settings, battle, victory, and defeat. As in the original
app, navigation uses React state rather than a URL router.

## UI structure

- `src/styles/tokens.css`: colors, surfaces, spacing, radii, type, shared controls,
  progress transitions, focus styles, and reduced-motion behavior.
- `AppShell`: sidebar on desktop, icon rail on tablets, bottom navigation on phones.
- `MainScreen/JourneyMap`: connected encounter path with completed, current, locked,
  and boss states. Current encounters have an accessible battle action.
- `CameraView`: the existing camera and pose hooks, a framed video, adjacent movement
  feedback, and camera start/stop/retry. Video and canvas use the same dimensions,
  containment, and mirroring so the pose overlay stays aligned without cropping.
- `BattleScreen`: separate fighter health, incoming-strike countdown, damage feedback,
  and three large selectable attack controls. UI states reflect the actual reducer.
- `BattleResult`: a presentation of the existing terminal transition; it does not
  grant rewards or change the reducer. Camera and enemy timers unmount at battle end.
- `ProfileScreen` and `SettingsScreen`: real session progress and working camera
  mirroring, automatic start, and reduced-motion preferences.

## Preserved game rules

The existing game has **nine enemies followed by the boss at encounter 10**. Every
correct rep attacks, including jumping jacks. Enemies attack every five seconds; the
existing interval restarts when their state changes after a player hit. There is no
round counter or alternating-turn state machine in this version. The UI does not
invent those states or silently introduce a five-rep requirement.

Normal enemies award 50 player XP, the boss awards 200, and training reps award 15.
The boss resets the encounter index to 1. Defeat restores player health. These rules,
damage calculations, exercise mastery, quest rewards, and level scaling are unchanged.
Game progress and display preferences remain session-only.

One existing connection was missing: only squat repetitions reached the game event
handler. The existing once-per-rep adapter now accepts an exercise type and also
connects push-up and jumping-jack counters. Detector algorithms and the camera /
MediaPipe lifecycle are unchanged. No damage calculation was added to UI components.

## Validation

- `npm test`: 132 tests across 13 files. Real pose-sequence fixtures exercise all three
  counters and check event identity across exercise switches. Integration tests use
  the real game reducer to verify all attack types, incorrect reps, enemy timing,
  navigation, preferences, defeat/retry, all encounters, boss rewards, and the next cycle.
- `npm run build`: TypeScript checking and production Vite build; local MediaPipe
  model and WASM assets are prepared successfully.
- Browser inspection covers all screens, attack selection, camera loading/offline,
  result layouts, and responsive widths. No new application console errors.
- A disposable local fixture feeds a synthetic video into the **real** MediaPipe
  engine, verifying model initialization, inference without a person, stop/restart,
  and identical video/canvas sizing. MediaPipe emits its existing diagnostic messages
  about XNNPACK, OpenGL error checking, and feedback tensors. The fixture is not shipped.
- This does not replace a physical session in front of a real webcam; real human
  movement was not manually captured during this review.

All UI icons come from `react-feather`. No additional icon sets, emoji icons,
animation libraries, or external font requests are used.
