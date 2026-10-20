import { fmtMoney } from '../format';
import type { Group } from '../types';

/** Выбор групп ученика: чекбоксы, сгруппированные по предметам, и итог в месяц. */
export function GroupPicker({
  groups,
  selected,
  onChange,
}: {
  groups: Group[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  if (groups.length === 0) {
    return <p className="hint">Сначала создайте предмет и группу во вкладке «Группы».</p>;
  }

  const bySubject = new Map<string, Group[]>();
  for (const g of groups) bySubject.set(g.subjectName, [...(bySubject.get(g.subjectName) ?? []), g]);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const total = groups.filter((g) => selected.includes(g.id)).reduce((sum, g) => sum + g.monthlyPrice, 0);

  return (
    <fieldset className="picker">
      <legend>Группы</legend>
      {[...bySubject].map(([subject, list]) => (
        <div key={subject} className="picker-subject">
          <div className="label">{subject}</div>
          {list.map((g) => (
            <label key={g.id} className={selected.includes(g.id) ? 'check checked' : 'check'}>
              <input type="checkbox" checked={selected.includes(g.id)} onChange={() => toggle(g.id)} />
              <span className="check-name">{g.name}</span>
              <span className="meta num">{fmtMoney(g.monthlyPrice)}</span>
            </label>
          ))}
        </div>
      ))}
      <div className="row between picker-total">
        <span className="meta">Выбрано групп: {selected.length}</span>
        <strong className="num">{fmtMoney(total)} в месяц</strong>
      </div>
    </fieldset>
  );
}
