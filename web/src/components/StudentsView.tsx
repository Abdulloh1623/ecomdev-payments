import { useState } from 'react';
import { api } from '../api';
import { fmtMoney } from '../format';
import { useLoad } from '../useLoad';
import { ErrorBox } from './ErrorBox';
import { StudentForm } from './StudentForm';

export function StudentsView({ onChanged }: { onChanged: (message: string) => void }) {
  const students = useLoad(() => api.students(), []);
  const groups = useLoad(() => api.groups(), []);
  const [editing, setEditing] = useState<number | null>(null);
  // Пересоздаём форму после сохранения, чтобы очистить поля
  const [formKey, setFormKey] = useState(0);

  async function remove(id: number, name: string) {
    if (!window.confirm(`Удалить ученика «${name}»? Он выбудет из групп, история оплат сохранится.`)) return;
    try {
      await api.deleteStudent(id);
      onChanged(`Ученик удалён: ${name}`);
      students.reload();
      groups.reload();
    } catch (err) {
      onChanged(err instanceof Error ? err.message : String(err));
    }
  }

  const loadError = students.error ?? groups.error;

  return (
    <section>
      {groups.data && (
        <StudentForm
          key={formKey}
          title="Новый ученик"
          groups={groups.data}
          submitLabel="Добавить"
          onSubmit={async (input) => {
            const s = await api.createStudent(input);
            onChanged(`Ученик добавлен: ${s.code} ${s.name}`);
            setFormKey((k) => k + 1);
            students.reload();
            groups.reload();
          }}
        />
      )}

      {loadError && (
        <ErrorBox
          message={loadError}
          onRetry={() => {
            students.reload();
            groups.reload();
          }}
        />
      )}
      {students.data?.length === 0 && <p className="empty">Учеников пока нет</p>}
      {students.data && students.data.length > 0 && (
        <ul className="list">
          {students.data.map((s) =>
            editing === s.id && groups.data ? (
              <li key={s.id}>
                <StudentForm
                  title={`${s.code} — изменение`}
                  groups={groups.data}
                  initial={{ name: s.name, phone: s.phone, groupIds: s.groups.map((g) => g.id) }}
                  submitLabel="Сохранить"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (input) => {
                    await api.updateStudent(s.id, input);
                    onChanged(`Сохранено: ${s.code} ${input.name}`);
                    setEditing(null);
                    students.reload();
                    groups.reload();
                  }}
                />
              </li>
            ) : (
              <li key={s.id} className="card">
                <div className="row between">
                  <div className="min0">
                    <div className="name">{s.name}</div>
                    <div className="meta">
                      <span className="code">{s.code}</span> · <span className="num">{s.phone}</span>
                    </div>
                  </div>
                  <strong className="num">{fmtMoney(s.monthlyFee)}</strong>
                </div>
                <div className="chips">
                  {s.groups.map((g) => (
                    <span key={g.id} className="chip">
                      {g.subjectName}: {g.name}
                    </span>
                  ))}
                </div>
                <div className="actions end">
                  <button className="btn ghost small" onClick={() => setEditing(s.id)}>
                    Изменить
                  </button>
                  <button className="btn ghost small danger" onClick={() => remove(s.id, s.name)}>
                    Удалить
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
