import { describe, expect, it } from 'vitest';
import { currentMonth, shiftMonth } from '../src/lib/dates.js';
import { makeGroup, makeStudent, pay, setupTestApp, TZ } from './helpers.js';

const t = setupTestApp();

const json = async (url: string) => {
  const res = await t.app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
};

interface GroupRow {
  groupId: number;
  name: string;
}

describe('GET /analytics/summary', () => {
  it('деньги за месяц: начислено, оплачено, переплата, собираемость; движение учеников', async () => {
    const g = await makeGroup(t.db, { price: 310_000 });
    const full = await makeStudent(t.db, { groups: [{ groupId: g.id, joinedOn: '2026-02-01' }] });
    // С 16 марта: 16 дней из 31 → 160 000
    const late = await makeStudent(t.db, { groups: [{ groupId: g.id, joinedOn: '2026-03-16' }] });
    // Учился до 31 марта включительно
    await makeStudent(t.db, { groups: [{ groupId: g.id, joinedOn: '2026-02-01', leftOn: '2026-04-01' }] });

    await pay(t.db, full.id, 310_000, '2026-03-05');
    await pay(t.db, late.id, 200_000, '2026-03-20'); // переплата 40 000

    const { status, body } = await json('/analytics/summary?from=2026-02&to=2026-04');
    expect(status).toBe(200);
    const [feb, mar, apr] = body.months;

    expect(feb).toMatchObject({ month: '2026-02', due: 620_000, paid: 0, debt: 620_000, collectionRate: 0, newStudents: 2 });
    expect(mar).toMatchObject({
      month: '2026-03',
      due: 310_000 + 160_000 + 310_000,
      paid: 510_000,
      collected: 470_000,
      overpaid: 40_000,
      debt: 310_000,
      activeStudents: 3,
      newStudents: 1,
      leftStudents: 1,
      debtors: 1,
    });
    expect(mar.collectionRate).toBe(60.3);
    expect(apr).toMatchObject({ activeStudents: 2, leftStudents: 0 });

    expect(body.totals.due).toBe(feb.due + mar.due + apr.due);
    expect(body.totals.paid).toBe(510_000);
    expect(body.totals.newStudents).toBe(3);
  });

  it('месяц без начислений — собираемость null', async () => {
    const { body } = await json('/analytics/summary?from=2026-03&to=2026-03');
    expect(body.months[0]).toMatchObject({ due: 0, collectionRate: null, activeStudents: 0 });
  });

  it('по умолчанию — 6 месяцев до текущего', async () => {
    const { body } = await json('/analytics/summary');
    expect(body.months).toHaveLength(6);
    expect(body.to).toBe(currentMonth(TZ));
    expect(body.from).toBe(shiftMonth(currentMonth(TZ), -5));
  });

  it.each([
    ['from=2026-05&to=2026-03', 'BAD_REQUEST'],
    ['from=2024-01&to=2026-03', 'BAD_REQUEST'],
    ['from=2026-13', 'VALIDATION_ERROR'],
  ])('некорректный период %s → 400', async (query, code) => {
    const { status, body } = await json(`/analytics/summary?${query}`);
    expect(status).toBe(400);
    expect(body.error.code).toBe(code);
  });
});

describe('GET /analytics/breakdown', () => {
  it('оплата делится между группами пропорционально, переплата и оплата без групп — не распределено', async () => {
    const a = await makeGroup(t.db, { price: 500_000, name: 'A' });
    const b = await makeGroup(t.db, { price: 400_000, name: 'B' });
    const both = await makeStudent(t.db, { groups: [{ groupId: a.id }, { groupId: b.id }] });
    const onlyA = await makeStudent(t.db, { groups: [{ groupId: a.id }] });
    const noGroups = await makeStudent(t.db);

    await pay(t.db, both.id, 450_000, '2026-03-10'); // → A 250 000, B 200 000
    await pay(t.db, onlyA.id, 600_000, '2026-03-10'); // → A 500 000, переплата 100 000
    await pay(t.db, noGroups.id, 50_000, '2026-03-10'); // → не распределено

    const { body } = await json('/analytics/breakdown?month=2026-03');
    const groups: GroupRow[] = body.subjects.flatMap((s: { groups: GroupRow[] }) => s.groups);
    expect(groups.find((g) => g.groupId === a.id)).toMatchObject({
      students: 2,
      due: 1_000_000,
      paid: 750_000,
      debt: 250_000,
      collectionRate: 75,
    });
    expect(groups.find((g) => g.groupId === b.id)).toMatchObject({
      students: 1,
      due: 400_000,
      paid: 200_000,
      debt: 200_000,
      collectionRate: 50,
    });
    expect(body.totals).toMatchObject({ due: 1_400_000, paid: 1_100_000, debt: 450_000, unallocated: 150_000 });

    // Распределённое + не распределённое = все оплаты месяца
    const allocated = body.subjects.reduce((s: number, x: { paid: number }) => s + x.paid, 0);
    expect(allocated + body.totals.unallocated).toBe(body.totals.paid);
  });

  it('предмет объединяет группы и считает учеников без повторов', async () => {
    const a = await makeGroup(t.db, { price: 100 });
    const b = await t.db.group.create({
      data: { subjectId: a.subjectId, name: 'Вторая', prices: { create: { fromMonth: '2026-01', amount: 200 } } },
    });
    await makeStudent(t.db, { groups: [{ groupId: a.id }, { groupId: b.id }] });
    const { body } = await json('/analytics/breakdown?month=2026-03');
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({ students: 1, due: 300 });
    expect(body.subjects[0].groups.map((g: GroupRow) => g.name)).toEqual(['Вторая', a.name]);
  });
});

describe('GET /analytics/daily', () => {
  it('все дни месяца, суммы и число оплат по дням', async () => {
    const s = await makeStudent(t.db);
    await pay(t.db, s.id, 100, '2026-02-03');
    await pay(t.db, s.id, 200, '2026-02-03');
    await pay(t.db, s.id, 50, '2026-02-28');
    await pay(t.db, s.id, 999, '2026-03-01');

    const { body } = await json('/analytics/daily?month=2026-02');
    expect(body.days).toHaveLength(28);
    expect(body.days[2]).toEqual({ date: '2026-02-03', amount: 300, count: 2 });
    expect(body.days[27]).toEqual({ date: '2026-02-28', amount: 50, count: 1 });
    expect(body).toMatchObject({ total: 350, count: 3 });
  });
});

describe('CSV', () => {
  it('summary.csv: BOM, «;», заголовок и строка на каждый месяц', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/analytics/summary.csv?from=2026-01&to=2026-03' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('summary_2026-01_2026-03.csv');
    expect(res.body.startsWith('﻿Месяц;Начислено;')).toBe(true);
    expect(res.body.trim().split('\r\n')).toHaveLength(4);
  });

  it('breakdown.csv: строки предмета, групп, «не распределено» и итог', async () => {
    const g = await makeGroup(t.db, { price: 100, name: 'Группа; с точкой с запятой' });
    await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    const res = await t.app.inject({ method: 'GET', url: '/analytics/breakdown.csv?month=2026-03' });
    const lines = res.body.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Предмет;Группа;Учеников;Начислено;Оплачено;Долг;Собираемость, %');
    expect(lines).toContainEqual(expect.stringContaining('"Группа; с точкой с запятой";1;100;0;100;0'));
    expect(lines.at(-1)).toBe('Всего;;;100;0;100;0');
  });
});
