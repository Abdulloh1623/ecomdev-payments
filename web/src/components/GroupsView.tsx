import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { fmtMoney, parseAmount } from '../format';
import type { Group, Subject } from '../types';
import { useLoad } from '../useLoad';
import { ErrorBox } from './ErrorBox';

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface GroupFields {
  name: string;
  price: string;
  teacher: string;
  schedule: string;
}

/** Форма группы: создание внутри предмета или изменение существующей. */
function GroupForm({
  initial,
  submitLabel,
  priceHint,
  onSubmit,
  onCancel,
}: {
  initial: GroupFields;
  submitLabel: string;
  priceHint?: string;
  onSubmit: (fields: GroupFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof GroupFields) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(f);
    } catch (err) {
      setError(errText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form subform" onSubmit={submit} noValidate>
      <div className="grid2">
        <label className="field">
          <span>Название</span>
          <input value={f.name} onChange={set('name')} required />
        </label>
        <label className="field">
          <span>Цена в месяц</span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={f.price ? fmtMoney(parseAmount(f.price)) : ''}
            onChange={set('price')}
            required
          />
        </label>
      </div>
      {priceHint && <p className="hint">{priceHint}</p>}
      <div className="grid2">
        <label className="field">
          <span>Преподаватель</span>
          <input value={f.teacher} onChange={set('teacher')} />
        </label>
        <label className="field">
          <span>Расписание</span>
          <input value={f.schedule} onChange={set('schedule')} placeholder="Пн/Ср 18:00" />
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn grow" type="submit" disabled={submitting}>
          {submitting ? 'Сохранение…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

const emptyGroup: GroupFields = { name: '', price: '', teacher: '', schedule: '' };

export function GroupsView({ onChanged }: { onChanged: (message: string) => void }) {
  const data = useLoad(() => Promise.all([api.subjects(), api.groups()]), []);
  const [subjectName, setSubjectName] = useState('');
  const [subjectError, setSubjectError] = useState<string | null>(null);
  // Какая форма открыта: новая группа в предмете или изменение группы
  const [open, setOpen] = useState<{ kind: 'new'; subjectId: number } | { kind: 'edit'; groupId: number } | null>(null);

  async function addSubject(e: FormEvent) {
    e.preventDefault();
    setSubjectError(null);
    try {
      const s = await api.createSubject(subjectName);
      onChanged(`Предмет добавлен: ${s.name}`);
      setSubjectName('');
      data.reload();
    } catch (err) {
      setSubjectError(errText(err));
    }
  }

  async function removeSubject(s: Subject) {
    if (!window.confirm(`Удалить предмет «${s.name}»?`)) return;
    try {
      await api.deleteSubject(s.id);
      onChanged(`Предмет удалён: ${s.name}`);
      data.reload();
    } catch (err) {
      onChanged(errText(err));
    }
  }

  async function removeGroup(g: Group) {
    if (!window.confirm(`Удалить группу «${g.name}»?`)) return;
    try {
      await api.deleteGroup(g.id);
      onChanged(`Группа удалена: ${g.name}`);
      data.reload();
    } catch (err) {
      onChanged(errText(err));
    }
  }

  const [subjects, groups] = data.data ?? [[], []];

  return (
    <section>
      <form className="card form" onSubmit={addSubject} noValidate>
        <h2>Новый предмет</h2>
        <div className="row">
          <input
            className="input grow"
            aria-label="Название предмета"
            placeholder="Например, Английский язык"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!subjectName.trim()}>
            Добавить
          </button>
        </div>
        {subjectError && <ErrorBox message={subjectError} />}
      </form>

      {data.error && <ErrorBox message={data.error} onRetry={data.reload} />}
      {data.data && subjects.length === 0 && <p className="empty">Предметов пока нет</p>}

      {subjects.map((s) => {
        const list = groups.filter((g) => g.subjectId === s.id);
        return (
          <div key={s.id} className="card">
            <div className="row between">
              <h2 className="flush">{s.name}</h2>
              <button className="btn ghost small danger" onClick={() => removeSubject(s)} disabled={list.length > 0}>
                Удалить
              </button>
            </div>

            {list.length === 0 && <p className="muted">Групп пока нет</p>}
            <ul className="history">
              {list.map((g) =>
                open?.kind === 'edit' && open.groupId === g.id ? (
                  <li key={g.id}>
                    <GroupForm
                      initial={{
                        name: g.name,
                        price: String(g.monthlyPrice),
                        teacher: g.teacher ?? '',
                        schedule: g.schedule ?? '',
                      }}
                      submitLabel="Сохранить"
                      priceHint="Новая цена действует с текущего месяца, прошлые месяцы не пересчитываются."
                      onCancel={() => setOpen(null)}
                      onSubmit={async (f) => {
                        const price = parseAmount(f.price);
                        await api.updateGroup(g.id, {
                          name: f.name,
                          teacher: f.teacher,
                          schedule: f.schedule,
                          ...(price !== g.monthlyPrice ? { monthlyPrice: price } : {}),
                        });
                        onChanged(`Группа сохранена: ${f.name}`);
                        setOpen(null);
                        data.reload();
                      }}
                    />
                  </li>
                ) : (
                  <li key={g.id} className="group-row">
                    <div className="row between">
                      <div className="min0">
                        <div className="name">{g.name}</div>
                        <div className="meta">
                          {[g.teacher, g.schedule].filter(Boolean).join(' · ') || 'Без преподавателя и расписания'}
                        </div>
                        <div className="meta">Учеников: {g.studentCount}</div>
                      </div>
                      <strong className="num">{fmtMoney(g.monthlyPrice)}</strong>
                    </div>
                    <div className="actions end">
                      <button className="btn ghost small" onClick={() => setOpen({ kind: 'edit', groupId: g.id })}>
                        Изменить
                      </button>
                      <button
                        className="btn ghost small danger"
                        onClick={() => removeGroup(g)}
                        disabled={g.studentCount > 0}
                        title={g.studentCount > 0 ? 'Сначала переведите учеников' : undefined}
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>

            {open?.kind === 'new' && open.subjectId === s.id ? (
              <GroupForm
                initial={emptyGroup}
                submitLabel="Создать группу"
                onCancel={() => setOpen(null)}
                onSubmit={async (f) => {
                  await api.createGroup({
                    subjectId: s.id,
                    name: f.name,
                    monthlyPrice: parseAmount(f.price),
                    teacher: f.teacher,
                    schedule: f.schedule,
                  });
                  onChanged(`Группа создана: ${f.name}`);
                  setOpen(null);
                  data.reload();
                }}
              />
            ) : (
              <button className="btn ghost block" onClick={() => setOpen({ kind: 'new', subjectId: s.id })}>
                + Группа
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
