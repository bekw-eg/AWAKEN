import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BattleOverlay } from '../components/BattleScreen/BattleOverlay';
import { MotionProvider } from '../motion/Motion';
import { battleOverlay, type BattleOverlayState } from '../game/battleOverlay';
import { HandsFreeBattleController } from '../game/handsFreeBattleController';

afterEach(cleanup);
it('renders the clock-driven announcement in a viewport portal, with reduced motion support', () => {
  const view = render(<MotionProvider reduced><BattleOverlay announcement={{ type: 'countdown', text: '3' }} /></MotionProvider>);
  expect(screen.getByTestId('battle-overlay').parentElement).toBe(document.body);
  expect(screen.getByTestId('battle-overlay').classList.contains('reduced')).toBe(true);
  for (const announcement of [{ type: 'countdown', text: '2' }, { type: 'countdown', text: '1' },
    { type: 'fight', text: 'FIGHT!' }, { type: 'exercise', text: 'SQUAT!' },
    { type: 'exercise', text: 'JUMPING JACKS!' }, { type: 'exercise', text: 'PUSH-UPS!' },
    { type: 'victory', text: 'VICTORY' }, { type: 'defeat', text: 'DEFEAT' }] satisfies BattleOverlayState[]) {
    view.rerender(<MotionProvider reduced><BattleOverlay announcement={announcement} /></MotionProvider>);
    expect(screen.getByTestId('battle-overlay').textContent).toBe(announcement.text);
  }
  view.rerender(<BattleOverlay announcement={null} />);
  expect(screen.queryByTestId('battle-overlay')).toBeNull();
});

it.each(['victory', 'defeat'] as const)('derives %s from terminal health without another timer', phase => {
  const controller = new HandsFreeBattleController();
  controller.advance(0, { playerHp: phase === 'defeat' ? 0 : 100, enemyHp: phase === 'victory' ? 0 : 100 });
  expect(battleOverlay(controller.snapshot(0))).toEqual({ type: phase, text: phase.toUpperCase() });
});
