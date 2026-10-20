import { describe, expect, it } from 'vitest';
import { todayIn } from '../src/lib/dates.js';
import { makeStudent, setupTestApp, TZ } from './helpers.js';

const t = setupTestApp();

const validStudent = { name: 'Азиз Каримов', phone: '+998 90 123-45-67', group: 'A1', monthlyFee: 500_000 };

describe('Ученики', () => {
  it('создание, получение, список', async () => {
    const created = await t.app.inject({ method: 'POST', url: '/students', payload: validStudent });
    expect(created.statusCode).toBe(201);
    const student = created.json();
    expect(student).toMatchObject({ id: expect.any(Number), ...validStudent });

    const one = await t.app.inject({ method: 'GET', url: `/students/${student.id}` });
    expect(one.json()).toEqual(student);

    const list = await t.app.inject({ method: 'GET', url: '/students' });
    expect(list.json()).toEqual([student]);
  });

  it('фильтр списка по группе', async () => {
    await t.app.inject({ method: 'POST', url: '/students', payload: validStudent });
    await t.app.inject({ method: 'POST', url: '/students', payload: { ...validStudent, group: 'B2' } });
    const list = await t.app.inject({ method: 'GET', url: '/students?group=B2' });
    expect(list.json()).toHaveLength(1);
  });

  it('валидация при создании', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/students',
      payload: { name: ' ', phone: 'abc', group: 'A1', monthlyFee: 10.5 },
    });
    expect(res.statusCode).toBe(400);
    const paths = res.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['/name', '/phone', '/monthlyFee']));
  });

  it('частичное изменение', async () => {
    const s = await makeStudent(t.db);
    const res = await t.app.inject({ method: 'PATCH', url: `/students/${s.id}`, payload: { monthlyFee: 600_000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: s.id, name: s.name, monthlyFee: 600_000 });
  });

  it('пустое изменение → 400', async () => {
    const s = await makeStudent(t.db);
    const res = await t.app.inject({ method: 'PATCH', url: `/students/${s.id}`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('мягкое удаление: ученик скрыт, история оплат сохранена', async () => {
    const s = await makeStudent(t.db);
    await t.db.payment.create({ data: { studentId: s.id, amount: 100, date: '2026-03-01' } });

    const del = await t.app.inject({ method: 'DELETE', url: `/students/${s.id}` });
    expect(del.statusCode).toBe(204);

    expect((await t.app.inject({ method: 'GET', url: `/students/${s.id}` })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/students' })).json()).toEqual([]);
    expect((await t.app.inject({ method: 'DELETE', url: `/students/${s.id}` })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'PATCH', url: `/students/${s.id}`, payload: { name: 'X' } })).statusCode).toBe(404);

    const history = await t.app.inject({ method: 'GET', url: `/students/${s.id}/payments` });
    expect(history.json()).toHaveLength(1);
  });

  it('несуществующий и некорректный id', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/students/999' })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/students/abc' })).statusCode).toBe(400);
  });
});

describe('Оплаты', () => {
  it('добавление с датой и список по ученику (новые сверху)', async () => {
    const s = await makeStudent(t.db);
    const first = await t.app.inject({
      method: 'POST',
      url: '/payments',
      payload: { studentId: s.id, amount: 200_000, date: '2026-03-05' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ studentId: s.id, amount: 200_000, date: '2026-03-05' });
    await t.app.inject({ method: 'POST', url: '/payments', payload: { studentId: s.id, amount: 1, date: '2026-03-20' } });

    const nested = (await t.app.inject({ method: 'GET', url: `/students/${s.id}/payments` })).json();
    expect(nested.map((p: { date: string }) => p.date)).toEqual(['2026-03-20', '2026-03-05']);

    const byQuery = (await t.app.inject({ method: 'GET', url: `/payments?studentId=${s.id}` })).json();
    expect(byQuery).toEqual(nested);
  });

  it('без даты — сегодняшняя дата', async () => {
    const s = await makeStudent(t.db);
    const res = await t.app.inject({ method: 'POST', url: '/payments', payload: { studentId: s.id, amount: 100 } });
    expect(res.json().date).toBe(todayIn(TZ));
  });

  it.each([
    [{ amount: 0 }, '/amount'],
    [{ amount: -5 }, '/amount'],
    [{ amount: 1.5 }, '/amount'],
    [{ date: '2026-02-30' }, '/date'],
    [{ date: '05.03.2026' }, '/date'],
  ])('валидация %o', async (patch, path) => {
    const s = await makeStudent(t.db);
    const res = await t.app.inject({
      method: 'POST',
      url: '/payments',
      payload: { studentId: s.id, amount: 100, ...patch },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toBe(path);
  });

  it('несуществующему или удалённому ученику — 404', async () => {
    const deleted = await makeStudent(t.db, { deletedOn: '2026-02-01' });
    for (const studentId of [999, deleted.id]) {
      const res = await t.app.inject({ method: 'POST', url: '/payments', payload: { studentId, amount: 100 } });
      expect(res.statusCode).toBe(404);
    }
    expect((await t.app.inject({ method: 'GET', url: '/students/999/payments' })).statusCode).toBe(404);
  });
});
