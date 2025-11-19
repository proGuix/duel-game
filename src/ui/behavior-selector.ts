export type BehaviorOption = { id: string; label: string };

export function initBehaviorSelector(
  options: BehaviorOption[],
  initialId: string,
  onChange: (id: string) => void
) {
  const select = document.getElementById('btSelect') as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML = '';
  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.id;
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
  }

  select.value = initialId;
  select.addEventListener('change', () => {
    onChange(select.value);
  });
}
