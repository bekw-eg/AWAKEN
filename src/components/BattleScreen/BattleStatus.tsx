import type { CameraTelemetry } from '../Camera/CameraView';
import type { ExerciseType } from '../../game/types';
import { ATTACKS } from './AttackSelector';
import { Icon } from '../UI/Icon';

export type BattleFeedback = { kind: 'player' | 'enemy'; damage: number } | null;
export function BattleStatus({ telemetry, selected, feedback, seconds }: {
  telemetry: CameraTelemetry; selected: ExerciseType; feedback: BattleFeedback; seconds: number;
}) {
  const attack = ATTACKS.find(({ exercise }) => exercise === selected)!;
  const ready = telemetry.active && telemetry.isPersonDetected && telemetry.trackingStatus === 'ready';
  const heading = feedback?.kind === 'player' ? 'ATTACK SUCCESSFUL' : feedback?.kind === 'enemy' ? 'ENEMY STRIKE'
    : !telemetry.active ? 'CONNECT YOUR CAMERA' : !ready ? 'GET INTO POSITION' : `PERFORM A ${attack.title.toUpperCase()}`;
  const detail = feedback ? `${feedback.damage} damage dealt${feedback.kind === 'enemy' ? ' to you' : ''}. Keep moving.`
    : !ready ? 'Enemy attacks remain active. Get ready to strike back.' : 'Complete the full movement to land your next hit.';
  return <div className={`battle-status${feedback?.kind === 'enemy' ? ' enemy-strike' : ''}`}>
    <div className="battle-status-copy" role="status"><Icon name={feedback ? feedback.kind === 'player' ? 'CheckCircle' : 'Shield' : ready ? 'Activity' : 'Camera'} /><div><strong>{heading}</strong><p>{detail}</p></div></div>
    <div className="next-strike"><Icon name="Clock" /><span>NEXT ENEMY STRIKE<strong>{seconds.toFixed(1)}<small>s</small></strong></span></div>
  </div>;
}
