import { useEffect, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { DebtorsView } from './components/DebtorsView';
import { GroupsView } from './components/GroupsView';
import { PaymentView, type PayPreset } from './components/PaymentView';
import { StudentsView } from './components/StudentsView';

type Tab = 'debtors' | 'pay' | 'students' | 'groups' | 'analytics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'debtors', label: 'Должники' },
  { id: 'pay', label: 'Оплата' },
  { id: 'students', label: 'Ученики' },
  { id: 'groups', label: 'Группы' },
  { id: 'analytics', label: 'Аналитика' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('debtors');
  const [preset, setPreset] = useState<PayPreset | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const openTab = (next: Tab) => {
    if (next !== 'pay') setPreset(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Учёт оплат</h1>
        <span className="topbar-sub">{TABS.find((t) => t.id === tab)?.label}</span>
      </header>

      <main className="content">
        {tab === 'debtors' && (
          <DebtorsView
            onPay={(p) => {
              setPreset(p);
              setTab('pay');
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {tab === 'pay' && (
          <PaymentView key={preset ? `${preset.studentId}-${preset.month}` : 'new'} preset={preset} onPaid={setToast} />
        )}
        {tab === 'students' && <StudentsView onChanged={setToast} />}
        {tab === 'groups' && <GroupsView onChanged={setToast} />}
        {tab === 'analytics' && <AnalyticsView />}
      </main>

      <nav className="tabbar" aria-label="Разделы">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => openTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
