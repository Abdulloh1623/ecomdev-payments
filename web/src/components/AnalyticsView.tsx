import { useState } from 'react';
import { api } from '../api';
import { currentMonth, fmtMoney, monthLabel, shiftMonth } from '../format';
import type { AnalyticsBreakdown, SummaryMonth } from '../types';
import { useLoad } from '../useLoad';
import { ColumnChart, fmtCompact, Legend, LineChart } from './charts';
import { ErrorBox } from './ErrorBox';

const SPANS = [3, 6, 12] as const;
const DUE = { name: 'Начислено', color: 'var(--series-1)' };
const PAID = { name: 'Оплачено', color: 'var(--series-2)' };

const shortMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
};
const pct = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`);

function Kpis({ m }: { m: SummaryMonth }) {
  const tiles = [
    { label: 'Начислено', value: fmtMoney(m.due) },
    { label: 'Оплачено', value: fmtMoney(m.paid), note: m.overpaid > 0 ? `переплата ${fmtMoney(m.overpaid)}` : undefined },
    { label: 'Долг', value: fmtMoney(m.debt), note: `должников ${m.debtors}` },
    { label: 'Собираемость', value: pct(m.collectionRate) },
    { label: 'Учеников', value: String(m.activeStudents), note: `новых ${m.newStudents} · ушли ${m.leftStudents}` },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div key={t.label} className="summary-item">
          <span className="label">{t.label}</span>
          <strong>{t.value}</strong>
          {t.note && <span className="meta">{t.note}</span>}
        </div>
      ))}
    </div>
  );
}

function Meter({ value }: { value: number | null }) {
  return (
    <div className="meter" role="meter" aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, value ?? 0)}%` }} />
    </div>
  );
}

function Breakdown({ data }: { data: AnalyticsBreakdown }) {
  if (data.subjects.length === 0) return <p className="muted">В этом месяце начислений нет</p>;
  return (
    <>
      {data.subjects.map((s) => (
        <div key={s.subjectId} className="bd-subject">
          <div className="row between">
            <div className="name">{s.name}</div>
            <span className="meta num">{pct(s.collectionRate)}</span>
          </div>
          <Meter value={s.collectionRate} />
          <div className="meta">
            Учеников {s.students} · начислено {fmtMoney(s.due)} · оплачено {fmtMoney(s.paid)} · долг {fmtMoney(s.debt)}
          </div>
          <ul className="bd-groups">
            {s.groups.map((g) => (
              <li key={g.groupId} className="row between">
                <span className="min0">
                  {g.name} <span className="meta">· {g.students} уч.</span>
                </span>
                <span className="meta num">
                  {fmtMoney(g.paid)} / {fmtMoney(g.due)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="row between bd-total">
        <span className="meta">Не распределено (переплаты и оплаты без групп)</span>
        <span className="num">{fmtMoney(data.totals.unallocated)}</span>
      </div>
    </>
  );
}

export function AnalyticsView() {
  const [to, setTo] = useState(currentMonth);
  const [span, setSpan] = useState<(typeof SPANS)[number]>(6);
  const from = shiftMonth(to, -(span - 1));

  const summary = useLoad(() => api.summary(from, to), [from, to]);
  const breakdown = useLoad(() => api.breakdown(to), [to]);
  const daily = useLoad(() => api.daily(to), [to]);

  const months = summary.data?.months ?? [];
  const last = months.at(-1);
  const error = summary.error ?? breakdown.error ?? daily.error;

  return (
    <section>
      <div className="month-switch">
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setTo((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <span className="month-label">{monthLabel(to)}</span>
        <button className="icon-btn" aria-label="Следующий месяц" onClick={() => setTo((m) => shiftMonth(m, 1))}>
          ›
        </button>
      </div>

      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            summary.reload();
            breakdown.reload();
            daily.reload();
          }}
        />
      )}
      {last && <Kpis m={last} />}

      <div className="card">
        <div className="row between wrap">
          <h2 className="flush">Начислено и оплачено</h2>
          <div className="segmented" role="group" aria-label="Период">
            {SPANS.map((s) => (
              <button key={s} className={s === span ? 'active' : ''} aria-pressed={s === span} onClick={() => setSpan(s)}>
                {s} мес
              </button>
            ))}
          </div>
        </div>
        <Legend series={[DUE, PAID]} />
        {months.length > 0 && (
          <ColumnChart
            labels={months.map((m) => m.month)}
            ticks={months.map((m) => shortMonth(m.month))}
            series={[
              { ...DUE, values: months.map((m) => m.due) },
              { ...PAID, values: months.map((m) => m.paid) },
            ]}
            format={fmtCompact}
            ariaLabel="Начислено и оплачено по месяцам"
            tooltip={(i) => ({
              title: monthLabel(months[i].month),
              rows: [
                <Legend key="d" series={[{ ...DUE, name: `Начислено ${fmtMoney(months[i].due)}` }]} />,
                <Legend key="p" series={[{ ...PAID, name: `Оплачено ${fmtMoney(months[i].paid)}` }]} />,
                `Долг ${fmtMoney(months[i].debt)}`,
                `Собираемость ${pct(months[i].collectionRate)}`,
              ],
            })}
          />
        )}
        <details className="viz-table">
          <summary>Таблица</summary>
          <table>
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Начислено</th>
                <th>Оплачено</th>
                <th>Долг</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>
                    {shortMonth(m.month)} {m.month.slice(0, 4)}
                  </td>
                  <td>{fmtMoney(m.due)}</td>
                  <td>{fmtMoney(m.paid)}</td>
                  <td>{fmtMoney(m.debt)}</td>
                  <td>{pct(m.collectionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="card">
        <h2>Активные ученики</h2>
        {months.length > 0 && (
          <LineChart
            labels={months.map((m) => m.month)}
            ticks={months.map((m) => shortMonth(m.month))}
            series={[{ name: 'Активных', color: 'var(--series-1)', values: months.map((m) => m.activeStudents) }]}
            format={(n) => String(n)}
            ariaLabel="Активные ученики по месяцам"
            tooltip={(i) => ({
              title: monthLabel(months[i].month),
              rows: [`Активных ${months[i].activeStudents}`, `Новых ${months[i].newStudents} · ушли ${months[i].leftStudents}`],
            })}
          />
        )}
        <details className="viz-table">
          <summary>Таблица</summary>
          <table>
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Активных</th>
                <th>Новых</th>
                <th>Ушли</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>
                    {shortMonth(m.month)} {m.month.slice(0, 4)}
                  </td>
                  <td>{m.activeStudents}</td>
                  <td>{m.newStudents}</td>
                  <td>{m.leftStudents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="card">
        <h2>Оплаты по дням</h2>
        {daily.data && (
          <>
            <p className="meta flush">
              {daily.data.count} оплат на {fmtMoney(daily.data.total)}
            </p>
            <ColumnChart
              labels={daily.data.days.map((d) => d.date)}
              ticks={daily.data.days.map((d) => String(Number(d.date.slice(8))))}
              series={[{ name: 'Оплачено', color: 'var(--series-2)', values: daily.data.days.map((d) => d.amount) }]}
              height={160}
              format={fmtCompact}
              ariaLabel="Оплаты по дням месяца"
              tooltip={(i) => {
                const d = daily.data!.days[i];
                return {
                  title: new Date(`${d.date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
                  rows: [`${fmtMoney(d.amount)} · оплат ${d.count}`],
                };
              }}
            />
          </>
        )}
      </div>

      <div className="card">
        <h2>По предметам и группам</h2>
        {breakdown.data && <Breakdown data={breakdown.data} />}
      </div>

      <div className="actions">
        <a className="btn ghost grow center" href={`/analytics/summary.csv?from=${from}&to=${to}`} download>
          CSV: по месяцам
        </a>
        <a className="btn ghost grow center" href={`/analytics/breakdown.csv?month=${to}`} download>
          CSV: по группам
        </a>
      </div>
    </section>
  );
}
