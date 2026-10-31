export type ModKeyboardOptions = {
  openLineIds: readonly string[];
  onAction: (lineId: string, action: 'delete' | 'timeout' | 'ban') => void;
  onHelp: () => void;
};

export function handleModKeyboard(event: KeyboardEvent, container: HTMLElement | null, options: ModKeyboardOptions): void {
  if (!container) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-line-id]'));
  const current = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-line-id]')?.dataset.lineId : undefined;
  const available = options.openLineIds.filter((id) => buttons.some((button) => button.dataset.lineId === id && !button.disabled));
  const focus = (id: string | undefined): void => {
    if (id) buttons.find((button) => button.dataset.lineId === id && !button.disabled)?.focus();
  };
  const currentIndex = current ? available.indexOf(current) : -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (available.length === 0) return;
    const index = currentIndex < 0 ? (event.key === 'ArrowDown' ? 0 : available.length - 1) :
      (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length;
    focus(available[index]);
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    focus(event.key === 'Home' ? available[0] : available[available.length - 1]);
    return;
  }
  if (event.key === '?') {
    event.preventDefault();
    options.onHelp();
    return;
  }
  const key = event.key.toLowerCase();
  const action = key === 'd' ? 'delete' : key === 't' ? 'timeout' : key === 'b' ? 'ban' : null;
  if (action && current && available.includes(current)) {
    event.preventDefault();
    options.onAction(current, action);
  }
}
