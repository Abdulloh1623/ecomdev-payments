import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { currentMonth, fmtDate, fmtMoney, monthLabel, parseAmount, today } from '../format';
import { useLoad } from '../useLoad';
import { ErrorBox } from './ErrorBox';

/** Предзаполнение формы из списка должников. */
export interface PayPreset {
  studentId: number;
  amount: number;
  month: string;
}

export function PaymentView({ preset, onPaid }: { preset: PayPreset | null; onPaid: (message: string) => void }) {
  const students = useLoad(() => api.students(), []);
  const [studentId, setStudentId] = useState<number | ''>(preset?.studentId ?? '');
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState(preset ? String(preset.amount) : '');
  // Оплата засчитывается в месяц по своей дате, поэтому долг за прошлый месяц
  // закрывается датой из того месяца
  const pastMonth = preset && preset.month !== currentMonth() ? preset.month : null;
  const [date, setDate] = useState(pastMonth ? `${pastMonth}-01` : today());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useLoad(() => (studentId ? api.payments(studentId) : Promise.resolve([])), [studentId]);

  const q = query.trim().toLowerCase();
  const options = (students.data ?? []).filter(
    (s) =>
      s.id === studentId ||
      !q ||
      `${s.code} ${s.name} ${s.groups.map((g) => g.name).join(' ')}`.toLowerCase().includes(q),
  );
  const selected = students.data?.find((s) => s.id === studentId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = parseAmount(amount);
    if (!studentId) return setError('Выберите ученика');
    if (value <= 0) return setError('Введите сумму больше нуля');
    if (!date) return setError('Укажите дату');

    setSubmitting(true);
    try {
      const payment = await api.createPayment({ studentId, amount: value, date });
      onPaid(`Оплата ${fmtMoney(payment.amount)} внесена — ${selected ? `${selected.code} ${selected.name}` : studentId}`);
      setAmount('');
      history.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <form className="card form" onSubmit={submit} noValidate>
        <h2>Новая оплата</h2>

        {students.error && <ErrorBox message={students.error} onRetry={students.reload} />}

        <label className="field">
          <span>Поиск ученика</span>
          <input
            type="search"
            placeholder="Имя, группа или код ST-…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Ученик</span>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : '')}
            disabled={students.loading}
            required
          >
            <option value="">{students.loading ? 'Загрузка…' : options.length ? 'Выберите ученика' : 'Никого не найдено'}</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} {s.name}
              </option>
            ))}
          </select>
          {selected && (
            <small className="hint">
              {selected.groups.map((g) => g.name).join(', ')} · в месяц {fmtMoney(selected.monthlyFee)}
            </small>
          )}
        </label>

        <div className="grid2">
          <label className="field">
            <span>Сумма</span>
            <input
              inputMode="numeric"
              placeholder="0"
              value={amount ? fmtMoney(parseAmount(amount)) : ''}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Дата</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        {pastMonth && (
          <p className="hint">
            Оплата засчитывается в месяц по своей дате. Чтобы закрыть долг за {monthLabel(pastMonth).toLowerCase()},
            дата должна быть в этом месяце.
          </p>
        )}

        {error && <ErrorBox message={error} />}

        <button className="btn block" type="submit" disabled={submitting}>
          {submitting ? 'Сохранение…' : 'Внести оплату'}
        </button>
      </form>

      {studentId !== '' && (
        <div className="card">
          <h2>История оплат{selected ? ` — ${selected.name}` : ''}</h2>
          {history.error && <ErrorBox message={history.error} onRetry={history.reload} />}
          {history.data?.length === 0 && <p className="muted">Оплат пока нет</p>}
          {history.data && history.data.length > 0 && (
            <ul className="history">
              {history.data.map((p) => (
                <li key={p.id} className="row between">
                  <span className="meta">{fmtDate(p.date)}</span>
                  <span className="num">{fmtMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
