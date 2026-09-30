import { expect, it } from 'vitest';
import { PoseFeedbackController } from '../exercise-engine/poseFeedbackController';
import { CORRECT_FORM, NEUTRAL_FORM, poseColorStatus, toFormFeedback, type FormFeedback } from '../exercise-engine/formFeedback';
import { resolvePoseFeedback } from '../game/resolvePoseFeedback';
import { isPushupReadyPose, pushupReadyState, readyPoseTrackingReliable, standingPoseFeedback } from '../game/handsFreePoses';
import { pushUpFrame } from './fixtures/pushUpFrames';
import { squatFrame } from './fixtures/squatFrames';

const arms: FormFeedback = { status: 'error', regions: ['arms'], message: 'arms' };

it('requires sustained correct form and rejects isolated bad frames after confirmation', () => {
  const ui = new PoseFeedbackController();
  for (let t = 0; t < 1000; t += 50) expect(ui.update(t % 100 ? NEUTRAL_FORM : CORRECT_FORM, true, t).status).toBe('neutral');
  ui.update(CORRECT_FORM, true, 1000);
  expect(ui.update(CORRECT_FORM, true, 1200).status).toBe('correct');
  expect(ui.update(arms, true, 1250).status).toBe('correct');
  expect(ui.update(CORRECT_FORM, true, 1300).status).toBe('correct');
  expect(ui.update(NEUTRAL_FORM, true, 1350).status).toBe('correct');
  expect(ui.update(CORRECT_FORM, true, 1400).status).toBe('correct');
});

it('stabilizes regions independently of status, region order and changing messages', () => {
  const ui = new PoseFeedbackController();
  ui.update(CORRECT_FORM, true, 0); ui.update(CORRECT_FORM, true, 200);
  ui.update(arms, true, 250);
  ui.update({ ...arms, message: 'new text', regions: ['arms', 'legs'] }, true, 350);
  ui.update(arms, true, 400);
  const stable = ui.update({ ...arms, message: 'changed again' }, true, 500);
  expect(stable).toMatchObject({ status: 'error', regions: ['arms'] });
  expect(poseColorStatus(stable, 13, 15)).toBe('error');
  expect(poseColorStatus(stable, 23, 25)).toBe('correct');
  ui.update({ ...arms, regions: ['arms', 'legs'] }, true, 550);
  expect(ui.update({ ...arms, regions: ['legs', 'arms'] }, true, 800).regions).toEqual(['arms', 'legs']);
  ui.update(arms, true, 850);
  expect(ui.update(arms, true, 1050).regions).toEqual(['arms']);
  ui.update(CORRECT_FORM, true, 1100);
  expect(ui.update(CORRECT_FORM, true, 1299).status).toBe('error');
  expect(ui.update(CORRECT_FORM, true, 1300)).toMatchObject({ status: 'correct', regions: [] });
});

it('never treats uncertain geometry as fresh error evidence or carries pending evidence across a tracking gap', () => {
  const ui = new PoseFeedbackController();
  ui.update(CORRECT_FORM, true, 0); ui.update(CORRECT_FORM, true, 200);
  ui.update(arms, true, 250);
  expect(ui.update(arms, false, 450).status).toBe('correct');
  expect(ui.update(arms, true, 500).status).toBe('correct');
  expect(ui.update(arms, true, 750).status).toBe('error');
  expect(ui.update(NEUTRAL_FORM, false, 800).status).toBe('error');
  expect(ui.update(NEUTRAL_FORM, false, 1049).status).toBe('error');
  expect(ui.update(NEUTRAL_FORM, false, 1050).status).toBe('neutral');
  expect(toFormFeedback('push-up', { formStatus: 'error', errorCode: 'body_alignment', feedback: 'error', trackingStatus: 'unreliable' })).toEqual(NEUTRAL_FORM);
});

it('selects one feedback owner by phase even when other detectors disagree', () => {
  const good = { formStatus: 'good' as const, errorCode: null, feedback: null, trackingStatus: 'ready' };
  const bad = { ...good, formStatus: 'error' as const, errorCode: 'too_shallow' };
  const input = { phase: 'selecting_attack' as const, selectedAttack: null, candidate: null, ready: false,
    squatResult: bad, jumpingJackResult: bad, pushupResult: bad };
  expect(resolvePoseFeedback(input)).toEqual(NEUTRAL_FORM);
  expect(resolvePoseFeedback({ ...input, candidate: 'basic' })).toMatchObject({ status: 'correct', regions: ['legs'] });
  expect(resolvePoseFeedback({ ...input, phase: 'performing_attack', selectedAttack: 'strong', pushupResult: good })).toEqual(CORRECT_FORM);
  expect(resolvePoseFeedback({ ...input, phase: 'performing_attack', selectedAttack: 'basic' })).toMatchObject({ status: 'error', regions: ['legs'] });
  expect(resolvePoseFeedback({ ...input, phase: 'attack_confirmed', selectedAttack: 'strong' })).toEqual(CORRECT_FORM);
});

it('uses visual elbow hysteresis without relaxing push-up selection or depending on a fixed side', () => {
  expect(pushupReadyState(pushUpFrame(0, { elbow: 161 }))).toBe(true);
  for (const elbow of [159, 162, 158, 161]) expect(pushupReadyState(pushUpFrame(0, { elbow }), true)).toBe(true);
  expect(pushupReadyState(pushUpFrame(0, { elbow: 154 }), true)).toBe(false);
  expect(isPushupReadyPose(pushUpFrame(0, { elbow: 159 }))).toBe(false);
  for (const side of ['left', 'right'] as const) expect(isPushupReadyPose(pushUpFrame(0, {
    leftConfidence: side === 'left' ? 1 : 0.1, rightConfidence: side === 'right' ? 1 : 0.1,
  }))).toBe(true);
});

it('distinguishes missing/degenerate geometry from measured bad form', () => {
  expect(pushupReadyState(pushUpFrame(0, { leftConfidence: 0.1, rightConfidence: 0.1 }))).toBeNull();
  const plank = pushUpFrame(0);
  const landmarks = plank.landmarks!.map(p => ({ ...p }));
  landmarks[13] = landmarks[11]; landmarks[14] = landmarks[12];
  expect(pushupReadyState({ ...plank, landmarks })).toBeNull();
  expect(readyPoseTrackingReliable({ ...plank, landmarks }, 'strong')).toBe(false);
  const standing = squatFrame(0);
  const worldLandmarks = standing.worldLandmarks!.map(p => ({ ...p }));
  worldLandmarks[25] = worldLandmarks[23];
  expect(standingPoseFeedback({ ...standing, worldLandmarks })).toContain('reliable body geometry');
  expect(readyPoseTrackingReliable({ ...standing, worldLandmarks }, 'basic')).toBe(false);
});
