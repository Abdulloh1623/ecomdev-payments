import { describe, expect, it } from 'vitest';
import { currentMonth, todayIn } from '../src/lib/dates.js';
import { makeGroup, makeStudent, setupTestApp, TZ } from './helpers.js';

const t = setupTestApp();

const post = (url: string, payload: object) => t.app.inject({ method: 'POST', url, payload });
const patch = (url: string, payload: object) => t.app.inject({ method: 'PATCH', url, payload });
const get = (url: string) => t.app.inject({ method: 'GET', url });
const del = (url: string) => t.app.inject({ method: 'DELETE', url });

describe('Предметы', () => {
  it('создание, список с числом групп, переименование', async () => {
    const created = await post('/subjects', { name: 'Математика' });
    expect(created.statusCode).toBe(201);
    const s = created.json();
    expect(s).toMatchObject({ name: 'Математика', groupCount: 0 });

    await post('/groups', { subjectId: s.id, name: 'М-1', monthlyPrice: 400_000 });
    expect((await get('/subjects')).json()).toEqual([expect.objectContaining({ id: s.id, groupCount: 1 })]);

    expect((await patch(`/subjects/${s.id}`, { name: 'Алгебра' })).json().name).toBe('Алгебра');
  });

  it('дубликат названия (без учёта регистра) → 409', async () => {
    await post('/subjects', { name: 'Физика' });
    const res = await post('/subjects', { name: 'физика' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('удаление: с группами — 409, пустой — 204 и пропадает из списка', async () => {
    const s = (await post('/subjects', { name: 'Химия' })).json();
    const g = (await post('/groups', { subjectId: s.id, name: 'Х-1', monthlyPrice: 1 })).json();
    expect((await del(`/subjects/${s.id}`)).statusCode).toBe(409);

    expect((await del(`/groups/${g.id}`)).statusCode).toBe(204);
    expect((await del(`/subjects/${s.id}`)).statusCode).toBe(204);
    expect((await get('/subjects')).json()).toEqual([]);
    expect((await get(`/subjects/${s.id}`)).statusCode).toBe(404);
  });
});

describe('Группы', () => {
  it('создание: цена действует с текущего месяца, в деталях — история цен и ученики', async () => {
    const s = (await post('/subjects', { name: 'Английский' })).json();
    const res = await post('/groups', {
      subjectId: s.id,
      name: 'A1',
      monthlyPrice: 500_000,
      teacher: 'Дилноза',
      schedule: 'Пн/Ср 18:00',
    });
    expect(res.statusCode).toBe(201);
    const g = res.json();
    expect(g).toMatchObject({
      subjectId: s.id,
      subjectName: 'Английский',
      name: 'A1',
      teacher: 'Дилноза',
      schedule: 'Пн/Ср 18:00',
      monthlyPrice: 500_000,
      studentCount: 0,
      prices: [{ amount: 500_000, fromMonth: currentMonth(TZ) }],
      students: [],
    });
  });

  it('несуществующий предмет → 404, дубликат названия в предмете → 409', async () => {
    expect((await post('/groups', { subjectId: 999, name: 'X', monthlyPrice: 1 })).statusCode).toBe(404);
    const s = (await post('/subjects', { name: 'Английский' })).json();
    await post('/groups', { subjectId: s.id, name: 'A1', monthlyPrice: 1 });
    expect((await post('/groups', { subjectId: s.id, name: 'a1', monthlyPrice: 1 })).statusCode).toBe(409);
  });

  it('фильтр списка по предмету', async () => {
    const a = await makeGroup(t.db);
    await makeGroup(t.db);
    const list = (await get(`/groups?subjectId=${a.subjectId}`)).json();
    expect(list.map((g: { id: number }) => g.id)).toEqual([a.id]);
  });

  it('новая цена с указанного месяца добавляется в историю, текущая не меняется задним числом', async () => {
    const g = await makeGroup(t.db, { prices: [['2026-01', 400_000]] });
    const res = await patch(`/groups/${g.id}`, { monthlyPrice: 450_000, priceFrom: '2099-01' });
    expect(res.statusCode).toBe(200);
    expect(res.json().prices).toEqual([
      { amount: 400_000, fromMonth: '2026-01' },
      { amount: 450_000, fromMonth: '2099-01' },
    ]);
    expect(res.json().monthlyPrice).toBe(400_000);
  });

  it('очистка необязательных полей пустой строкой', async () => {
    const s = (await post('/subjects', { name: 'Английский' })).json();
    const g = (await post('/groups', { subjectId: s.id, name: 'A1', monthlyPrice: 1, teacher: 'Иван' })).json();
    expect((await patch(`/groups/${g.id}`, { teacher: '' })).json().teacher).toBeNull();
  });

  it('удаление: с учениками — 409, без — 204', async () => {
    const g = await makeGroup(t.db);
    const s = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    expect((await del(`/groups/${g.id}`)).statusCode).toBe(409);
    await del(`/students/${s.id}`);
    expect((await del(`/groups/${g.id}`)).statusCode).toBe(204);
    expect((await get(`/groups/${g.id}`)).statusCode).toBe(404);
  });
});

describe('Ученики', () => {
  it('создание с несколькими группами: код ST-…, группы, месячная сумма', async () => {
    const a = await makeGroup(t.db, { price: 500_000 });
    const b = await makeGroup(t.db, { price: 400_000 });
    const res = await post('/students', { name: 'Азиз', phone: '+998 90 123-45-67', groupIds: [a.id, b.id, a.id] });
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s.code).toBe(`ST-${String(s.id).padStart(4, '0')}`);
    expect(s.monthlyFee).toBe(900_000);
    expect(s.groups.map((g: { id: number; joinedOn: string }) => [g.id, g.joinedOn])).toEqual([
      [a.id, todayIn(TZ)],
      [b.id, todayIn(TZ)],
    ]);

    expect((await get(`/students/${s.code}`)).json()).toEqual(s);
    expect((await get(`/groups/${a.id}`)).json().students).toEqual([expect.objectContaining({ id: s.id, code: s.code })]);
  });

  it('без групп → 400; несуществующая или удалённая группа → 400 INVALID_GROUP', async () => {
    expect((await post('/students', { name: 'A', phone: '+998901234567', groupIds: [] })).statusCode).toBe(400);

    const removed = await makeGroup(t.db);
    await t.db.group.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    for (const groupIds of [[999], [removed.id]]) {
      const res = await post('/students', { name: 'A', phone: '+998901234567', groupIds });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_GROUP');
    }
    expect((await get('/students')).json()).toEqual([]);
  });

  it('валидация полей', async () => {
    const res = await post('/students', { name: ' ', phone: 'abc', groupIds: 'x' });
    expect(res.statusCode).toBe(400);
    const paths = res.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['/name', '/phone', '/groupIds']));
  });

  it('фильтр списка по группе и предмету', async () => {
    const a = await makeGroup(t.db);
    const b = await makeGroup(t.db);
    const inA = await makeStudent(t.db, { groups: [{ groupId: a.id }] });
    await makeStudent(t.db, { groups: [{ groupId: b.id }] });
    expect((await get(`/students?groupId=${a.id}`)).json().map((s: { id: number }) => s.id)).toEqual([inA.id]);
    expect((await get(`/students?subjectId=${a.subjectId}`)).json().map((s: { id: number }) => s.id)).toEqual([inA.id]);
  });

  it('перевод между группами: старое участие закрывается датой перевода, новое начинается', async () => {
    const a = await makeGroup(t.db);
    const b = await makeGroup(t.db);
    const s = await makeStudent(t.db, { groups: [{ groupId: a.id, joinedOn: '2026-01-01' }] });

    const res = await patch(`/students/${s.id}`, { groupIds: [b.id], effectiveOn: '2026-03-10' });
    expect(res.statusCode).toBe(200);
    expect(res.json().groups.map((g: { id: number }) => g.id)).toEqual([b.id]);

    const history = await t.db.enrollment.findMany({ where: { studentId: s.id }, orderBy: { id: 'asc' } });
    expect(history.map((e) => [e.groupId, e.joinedOn, e.leftOn])).toEqual([
      [a.id, '2026-01-01', '2026-03-10'],
      [b.id, '2026-03-10', null],
    ]);
  });

  it('снятие с группы, участие в которой ещё не началось, удаляет запись', async () => {
    const a = await makeGroup(t.db);
    const b = await makeGroup(t.db);
    const s = await makeStudent(t.db, { groups: [{ groupId: a.id }, { groupId: b.id, joinedOn: '2026-05-01' }] });
    await patch(`/students/${s.id}`, { groupIds: [a.id], effectiveOn: '2026-04-01' });
    expect(await t.db.enrollment.count({ where: { studentId: s.id } })).toBe(1);
  });

  it('пустое изменение и пустой список групп → 400', async () => {
    const s = await makeStudent(t.db);
    expect((await patch(`/students/${s.id}`, {})).statusCode).toBe(400);
    expect((await patch(`/students/${s.id}`, { groupIds: [] })).statusCode).toBe(400);
  });

  it('мягкое удаление: выбывает из групп, история оплат сохранена', async () => {
    const g = await makeGroup(t.db);
    const s = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    await t.db.payment.create({ data: { studentId: s.id, amount: 100, date: '2026-03-01' } });

    expect((await del(`/students/${s.id}`)).statusCode).toBe(204);
    expect((await get(`/students/${s.id}`)).statusCode).toBe(404);
    expect((await get('/students')).json()).toEqual([]);
    expect((await del(`/students/${s.id}`)).statusCode).toBe(404);
    expect((await get(`/groups/${g.id}`)).json().studentCount).toBe(0);

    const e = await t.db.enrollment.findFirstOrThrow({ where: { studentId: s.id } });
    expect(e.leftOn).toBe(todayIn(TZ));
    expect((await get(`/students/${s.id}/payments`)).json()).toHaveLength(1);
  });

  it('несуществующий ученик и мусор вместо кода → 404', async () => {
    expect((await get('/students/999')).statusCode).toBe(404);
    expect((await get('/students/abc')).statusCode).toBe(404);
  });
});

describe('Оплаты', () => {
  it('добавление с датой и список по ученику (новые сверху)', async () => {
    const s = await makeStudent(t.db);
    const first = await post('/payments', { studentId: s.id, amount: 200_000, date: '2026-03-05' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ studentId: s.id, amount: 200_000, date: '2026-03-05' });
    await post('/payments', { studentId: s.id, amount: 1, date: '2026-03-20' });

    const nested = (await get(`/students/${s.id}/payments`)).json();
    expect(nested.map((p: { date: string }) => p.date)).toEqual(['2026-03-20', '2026-03-05']);
    expect((await get(`/payments?studentId=${s.id}`)).json()).toEqual(nested);
  });

  it('без даты — сегодняшняя дата', async () => {
    const s = await makeStudent(t.db);
    expect((await post('/payments', { studentId: s.id, amount: 100 })).json().date).toBe(todayIn(TZ));
  });

  it.each([
    [{ amount: 0 }, '/amount'],
    [{ amount: -5 }, '/amount'],
    [{ amount: 1.5 }, '/amount'],
    [{ date: '2026-02-30' }, '/date'],
    [{ date: '05.03.2026' }, '/date'],
  ])('валидация %o', async (override, path) => {
    const s = await makeStudent(t.db);
    const res = await post('/payments', { studentId: s.id, amount: 100, ...override });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toBe(path);
  });

  it('несуществующему или удалённому ученику — 404', async () => {
    const deleted = await makeStudent(t.db, { deletedOn: '2026-02-01' });
    for (const studentId of [999, deleted.id]) {
      expect((await post('/payments', { studentId, amount: 100 })).statusCode).toBe(404);
    }
    expect((await get('/students/999/payments')).statusCode).toBe(404);
  });
});
