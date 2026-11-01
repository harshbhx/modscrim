import { Icon } from './ConsoleIcons';

const STEPS = [
  'Read filters',
  'Configure',
  'Run the drill',
  'Twitch grades',
  'Fix the rules',
  'Fresh wave and push'
] as const;

export type ConsoleStep = 1 | 2 | 3 | 4 | 5 | 6;

export function ConsoleStepper({
  current,
  unlockedThrough,
  onSelect
}: {
  current: ConsoleStep;
  unlockedThrough: ConsoleStep;
  onSelect: (step: ConsoleStep) => void;
}) {
  return <nav className="console-stepper" aria-label="Drill steps">
    <ol>
      {STEPS.map((label, index) => {
        const step = (index + 1) as ConsoleStep;
        const active = current === step;
        const locked = step > unlockedThrough;
        // A step is done once the one after it has been unlocked.
        const done = !locked && step < unlockedThrough;
        const state = active ? 'current' : locked ? 'locked' : done ? 'done' : 'open';
        return <li key={label} className={active ? 'is-current' : undefined} data-state={state} data-done={done ? 'true' : undefined}>
          <button
            type="button"
            aria-current={active ? 'step' : undefined}
            aria-label={`Step ${step}: ${label}${locked ? ', locked' : ''}`}
            title={label}
            disabled={locked}
            onClick={() => onSelect(step)}
          >
            <span className="console-step-number" aria-hidden="true">
              {done && !active ? <Icon name="check" size={14} /> : locked ? <Icon name="lock" size={13} /> : step}
            </span>
            <span className="console-step-label" aria-hidden="true">{label}</span>
          </button>
        </li>;
      })}
    </ol>
  </nav>;
}
