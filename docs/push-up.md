# Push-Up mode

## Architecture and contract

- `src/exercise-engine/pushUpTypes.ts`: separate frame, result and configuration types.
- `src/exercise-engine/pushUpDetector.ts`: pure TypeScript, no React or game dependencies.
- `src/hooks/usePushUpExercise.ts`: one detector per mount, consumes the existing pose frames; no additional MediaPipe instance or animation loop.
- `src/components/PushUpFeedback/`: setup instructions, valid reps, phase, side, one prioritized error and collapsed debug metrics.
- `CameraView`: Squat / Push-Up selector; inactive detectors pause and retain their counters.
- Tests: detector, hook, feedback and mode integration; fixtures construct articulated arms with grounded wrists and ankles.

Use `PushUpDetector.update(frame)`, `pause()` and `reset()` directly or use the hook:

```ts
const pushUp = usePushUpExercise(
  landmarks, worldLandmarks, poseTimestampMs, enabled,
  undefined, videoSize.width / videoSize.height,
);
// Consume pushUp.repJustCounted in the future Strong Attack integration.
```

`repJustCounted` is true only on the update that completes a valid rep. The next update, including duplicate/out-of-order timestamps, clears it. In React consume it in an effect, with `repCount` as the rep identity; do not trigger side effects during render. A hook render does not itself constitute a new pose frame. Reset starts a new counter session.

One valid rep can later trigger one Strong Attack. No attack event, Strength, damage, HP or turn logic is implemented here. No game files were changed.

## Detection

The detector uses normalized image landmarks from the existing pose engine. Pass the source video width / height as `imageAspectRatio` on a frame (or the hook's sixth argument). X is multiplied by this ratio and Z is set to zero before measuring elbow/body/knee angles and hip distance to the shoulder–ankle line, divided by shoulder–ankle length. Omitted aspect ratio assumes a square image; the camera integration always supplies the actual ratio. Changing it cancels the current attempt. World landmarks remain in the API for compatibility but do not determine push-up geometry or confidence.

This avoids false bent legs and incorrect elbow angles caused by noisy model-estimated depth. It cannot repair misplaced image landmarks, so the camera still needs a clear side view. Confirm body and knee angles in DEBUG METRICS while holding a straight plank.

Both sides require shoulder, elbow, wrist, hip, knee and ankle. Select the side with the strongest average minimum image visibility/presence. Knees and ankles use `minLegVisibility` (0.45); other required joints use `minVisibility` (0.6). All required joints must remain in frame with sufficient presence. Missing presence defaults to 1 to match the existing landmark contract; missing visibility is unreliable. A confidence margin avoids idle side jitter. After TOP confirmation the selected side stays fixed throughout the attempt. Loss of that side cancels the attempt even if the other side is visible.

Side-view validation compares aspect-corrected image shoulder and hip pair separation against torso length. Unreliable far-side pairs are ignored, allowing occlusion. This is a demo heuristic, not a full orientation classifier: oblique views with an occluded far side can pass. A horizontal-body check rejects standing arm curls; a knee-angle check rejects bent-knee variants. Use full plank push-ups for this MVP.

The first TOP must be held. Valid sequence: TOP → DESCENDING → BOTTOM → ASCENDING → TOP. Elbow smoothing, angle direction margins and timed holds suppress single-frame noise. Bottom depth uses the observed elbow angle with an 80 ms hold, so smoothing cannot erase a brief valid bottom. A confirmed final TOP also arms the next rep without a second hold. No depth can carry over after failed lockout, tracking loss, camera pause, mode switch, frame gap or attempt timeout. Completed counts survive all of these; only reset clears them.

Errors have priority: body alignment, too shallow, incomplete lockout. Sustained body errors latch for the attempt. A shallow reversal cannot become a valid rep later. Incomplete lockout is reported after an ascent stalls or reverses before TOP; the attempt ends and requires a new TOP. Short body noise is debounced, but a currently misaligned frame cannot complete TOP. Too-short cycles and cooldown violations never emit a rep event.

## Default thresholds and tuning

All values live in `DEFAULT_PUSH_UP_CONFIG`; pass a partial config to the detector/hook. Hook config is captured on mount.

| Setting | Default | Purpose |
| --- | ---: | --- |
| minVisibility / minPresence | 0.6 / 0.6 | Arm/hip visibility and presence for every required joint |
| minLegVisibility | 0.45 | Knee/ankle visibility in side view |
| frameMargin | 0.01 | Keep joints inside the image |
| sideSwitchScoreMargin | 0.1 | Idle side-selection hysteresis |
| maxSidePairToTorsoRatio | 0.55 | Reject visibly frontal shoulder/hip pairs |
| maxBodyVerticalRatio | 0.6 | Reject upright poses |
| minKneeAngle | 155° | Require straight legs |
| topElbowAngleMin | 160° | Full extension |
| bottomElbowAngleMax | 100° | Sufficient depth |
| minBodyAngle | 155° | Straight shoulder–hip–ankle line |
| maxHipOffsetRatio | 0.15 | Hip deviation divided by body length |
| directionAngleDelta / progressAngleDelta | 8° / 3° | Direction and ascent progress |
| transitionHoldMs / bottomHoldMs / topHoldMs | 120 / 80 / 120 ms | Stable phase transitions |
| formErrorHoldMs | 180 ms | Sustained bad alignment |
| lockoutFeedbackDelayMs | 900 ms | Ascent stalls below TOP |
| feedbackHoldMs | 1600 ms | Retain outcome feedback |
| smoothingTimeMs | 60 ms | Elbow smoothing time constant |
| minRepDurationMs / maxAttemptDurationMs | 700 / 15000 ms | Attempt duration limits |
| repCooldownMs | 700 ms | Minimum interval between finished attempts |
| maxFrameGapMs | 400 ms | Lost/stalled pose stream |

Tune in this order, observing DEBUG METRICS:

1. Fix camera side angle, lighting, distance and full-body visibility first. If reliable side views are rejected, inspect `maxSidePairToTorsoRatio` and confidence thresholds.
2. Measure comfortable TOP/BOTTOM elbow values. Tune `topElbowAngleMin` and `bottomElbowAngleMax` first for rep recognition.
3. Tune `minBodyAngle` and `maxHipOffsetRatio` for form errors. Inspect `Knee angle` before tuning `minKneeAngle`; the default still requires straight legs. `minLegVisibility` controls tolerance to partial leg occlusion, not actual leg bending.
4. For jitter, tune `smoothingTimeMs`, `directionAngleDelta` and hold durations. Increasing holds adds delay and can miss fast movements.
5. If slow valid ascents fail early, increase `lockoutFeedbackDelayMs`; inspect frame timing before increasing `maxFrameGapMs`.

These are demo thresholds, not medical standards. Synthetic tests validate state transitions; live-camera accuracy still needs the manual scenario below.

## Manual webcam test

Run `npm run dev`, open the local URL, allow camera access, and choose **PUSH-UP**.

1. Put the camera to your side.
2. Keep your whole body, including wrists and ankles, visible.
3. Take the top push-up position, with arms and legs straight.
4. Wait for READY.
5. Perform one full push-up.
6. Check VALID REPS = 1.
7. Make a shallow descent and return upward.
8. Check “Опустись ниже”; count stays 1.
9. Reach the bottom, rise without full extension and pause for about a second or descend again.
10. Check “Полностью выпрями руки”; count stays 1. Return to TOP and wait for READY.
11. During the next attempt, move your hips substantially away from the body line for at least 180 ms.
12. Check “Держи корпус ровнее”; that attempt must not count, even after correcting your hips.
13. Return to TOP, wait for READY and perform another correct rep.
14. Check VALID REPS = 2.

Also test both visible sides, frontal rejection, leaving the frame at BOTTOM, stopping/restarting the camera, switching modes and resetting. Tracking recovery must require TOP and must preserve completed reps. Squat mode should continue behaving as before.

## Validation

Run `npm test` and `npm run build`. Tests cover the full cycle, stationary holds, all three errors, error priority/recovery, side selection/locking, tracking loss, timestamp replay, cooldown, duration, reset, frozen camera, StrictMode and the mode selector. They use synthetic frames; they do not run the real MediaPipe model or substitute for a physical webcam test.
