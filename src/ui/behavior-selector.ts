import type { BehaviorOption } from '@ai/behavior-registry';

let selectEl: HTMLSelectElement | null = null;
let changeHandler: ((id: string) => void) | null = null;

function populateSelect(options: BehaviorOption[], selectedId: string) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.id;
    optionEl.textContent = opt.label;
    selectEl.appendChild(optionEl);
  }
  selectEl.value = selectedId;
}

export function initBehaviorSelector(
  options: BehaviorOption[],
  initialId: string,
  onChange: (id: string) => void
) {
  selectEl = document.getElementById('btSelect') as HTMLSelectElement | null;
  if (!selectEl) return;
  changeHandler = onChange;

  populateSelect(options, initialId);

  selectEl.addEventListener('change', () => {
    if (!selectEl) return;
    changeHandler?.(selectEl.value);
  });
}

export function refreshBehaviorSelector(options: BehaviorOption[], selectedId: string) {
  if (!selectEl) return;
  populateSelect(options, selectedId);
}
