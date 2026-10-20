import { useState } from 'react';
import { api } from '../api';
import { currentMonth, fmtMoney, monthLabel, shiftMonth } from '../format';
import { useLoad } from '../useLoad';
import { ErrorBox } from './ErrorBox';
import type { PayPreset } from './PaymentView';

export function DebtorsView({ onPay }: { onPay: (preset: PayPreset) => void }) {
  const [month, setMonth] = useState(currentMonth);
  const { data, error, loading, reload } = useLoad(() => api.debtors(month), [month]);

  return (
    <section>
      <div className="month-switch">
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <span className="month-label">{monthLabel(month)}</span>
        <button className="icon-btn" aria-label="Следующий месяц" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <p className="muted center">Загрузка…</p>}

      {data && (
        <>
          <div className="summary">
            <div className="summary-item">
              <span className="label">Должников</span>
              <strong>{data.count}</strong>
            </div>
            <div className="summary-item">
              <span className="label">Общий долг</span>
              <strong className="num">{fmtMoney(data.totalDebt)}</strong>
            </div>
          </div>

          {data.count === 0 ? (
            <p className="empty">За этот месяц должников нет</p>
          ) : (
            <ul className="list" aria-busy={loading}>
              {data.debtors.map((d) => {
                const paidPct = Math.min(100, Math.round((d.paid / d.monthlyFee) * 100));
                return (
                  <li key={d.id} className="card debtor">
                    <div className="row between">
                      <div className="min0">
                        <div className="name">
                          {d.name} {d.deleted && <span className="badge">удалён</span>}
                        </div>
                        <div className="meta">
                          #{d.id} · {d.group}
                        </div>
                        <a className="meta num" href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}>
                          {d.phone}
                        </a>
                      </div>
                      <div className="debt num">{fmtMoney(d.debt)}</div>
                    </div>
                    <div className="progress" role="progressbar" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${paidPct}%` }} />
                    </div>
                    <div className="row between">
                      <span className="meta">
                        Оплачено {fmtMoney(d.paid)} из {fmtMoney(d.monthlyFee)}
                      </span>
                      {!d.deleted && (
                        <button className="btn small" onClick={() => onPay({ studentId: d.id, amount: d.debt, month })}>
                          Внести оплату
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
