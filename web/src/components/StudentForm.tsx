import { useState, type FormEvent } from 'react';
import type { Group, StudentInput } from '../types';
import { ErrorBox } from './ErrorBox';
import { GroupPicker } from './GroupPicker';

/** Форма ученика — для создания и для изменения. */
export function StudentForm({
  title,
  groups,
  initial = { name: '', phone: '', groupIds: [] },
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  groups: Group[];
  initial?: StudentInput;
  submitLabel: string;
  onSubmit: (input: StudentInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.groupIds.length === 0) return setError('Выберите хотя бы одну группу');
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>{title}</h2>
      <label className="field">
        <span>Имя</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required />
      </label>
      <label className="field">
        <span>Телефон</span>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+998 90 123-45-67"
          required
        />
      </label>
      <GroupPicker groups={groups} selected={form.groupIds} onChange={(groupIds) => setForm({ ...form, groupIds })} />
      {error && <ErrorBox message={error} />}
      <div className="actions">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button className="btn grow" type="submit" disabled={submitting}>
          {submitting ? 'Сохранение…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
