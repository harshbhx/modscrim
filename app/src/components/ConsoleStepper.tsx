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
        return <li key={label} className={active ? 'is-current' : undefined}>
          <button
            type="button"
            aria-current={active ? 'step' : undefined}
            aria-label={`Step ${step}: ${label}${locked ? ', locked' : ''}`}
            disabled={locked}
            onClick={() => onSelect(step)}
          >
            <span className="console-step-number" aria-hidden="true">{step}</span>
            <span>{label}</span>
          </button>
        </li>;
      })}
    </ol>
  </nav>;
}
