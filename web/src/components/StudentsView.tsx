import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { fmtMoney, parseAmount } from '../format';
import { useLoad } from '../useLoad';
import { ErrorBox } from './ErrorBox';

const empty = { name: '', phone: '', group: '', monthlyFee: '' };

export function StudentsView({ onChanged }: { onChanged: (message: string) => void }) {
  const students = useLoad(() => api.students(), []);
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const s = await api.createStudent({
        name: form.name,
        phone: form.phone,
        group: form.group,
        monthlyFee: parseAmount(form.monthlyFee),
      });
      onChanged(`Ученик добавлен: #${s.id} ${s.name}`);
      setForm(empty);
      students.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number, name: string) {
    if (!window.confirm(`Удалить ученика «${name}»? История оплат сохранится.`)) return;
    try {
      await api.deleteStudent(id);
      onChanged(`Ученик удалён: ${name}`);
      students.reload();
    } catch (err) {
      onChanged(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <form className="card form" onSubmit={submit} noValidate>
        <h2>Новый ученик</h2>
        <label className="field">
          <span>Имя</span>
          <input value={form.name} onChange={set('name')} autoComplete="name" required />
        </label>
        <label className="field">
          <span>Телефон</span>
          <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+998 90 123-45-67" required />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Группа</span>
            <input value={form.group} onChange={set('group')} required />
          </label>
          <label className="field">
            <span>Сумма в месяц</span>
            <input
              inputMode="numeric"
              value={form.monthlyFee ? fmtMoney(parseAmount(form.monthlyFee)) : ''}
              onChange={set('monthlyFee')}
              placeholder="0"
              required
            />
          </label>
        </div>
        {error && <ErrorBox message={error} />}
        <button className="btn block" type="submit" disabled={submitting}>
          {submitting ? 'Сохранение…' : 'Добавить'}
        </button>
      </form>

      {students.error && <ErrorBox message={students.error} onRetry={students.reload} />}
      {students.data?.length === 0 && <p className="empty">Учеников пока нет</p>}
      {students.data && students.data.length > 0 && (
        <ul className="list">
          {students.data.map((s) => (
            <li key={s.id} className="card row between">
              <div className="min0">
                <div className="name">{s.name}</div>
                <div className="meta">
                  #{s.id} · {s.group}
                </div>
                <div className="meta num">{s.phone}</div>
                <div className="meta">{fmtMoney(s.monthlyFee)} в месяц</div>
              </div>
              <button className="btn ghost small danger" onClick={() => remove(s.id, s.name)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
