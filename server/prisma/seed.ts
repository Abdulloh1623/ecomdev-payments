// Демо-данные: предметы, группы (одна с изменением цены), ученики в одной и нескольких группах,
// ученик, пришедший в середине месяца, и оплаты за прошлый и текущий месяц.
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { currentMonth } from '../src/lib/dates.js';

const db = new PrismaClient();
const tz = process.env.APP_TIMEZONE ?? 'Asia/Tashkent';

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

async function main() {
  if ((await db.student.count()) > 0) {
    console.log('В базе уже есть ученики — сид пропущен');
    return;
  }

  const month = currentMonth(tz);
  const prevMonth = shiftMonth(month, -1);
  const startMonth = shiftMonth(month, -2);

  const subject = (name: string) => db.subject.create({ data: { name } });
  const [english, math, it] = [await subject('Английский язык'), await subject('Математика'), await subject('Программирование')];

  const group = (subjectId: number, name: string, teacher: string, schedule: string, prices: [string, number][]) =>
    db.group.create({
      data: {
        subjectId,
        name,
        teacher,
        schedule,
        prices: { create: prices.map(([fromMonth, amount]) => ({ fromMonth, amount })) },
      },
    });

  const a1 = await group(english.id, 'A1 утро', 'Дилноза Каримова', 'Пн/Ср/Пт 09:00', [[startMonth, 500_000]]);
  const b1 = await group(english.id, 'B1 вечер', 'Шахзод Алиев', 'Вт/Чт 18:00', [[startMonth, 600_000]]);
  // Цена выросла с текущего месяца
  const math1 = await group(math.id, 'Математика-1', 'Рустам Юлдашев', 'Пн/Ср 16:00', [
    [startMonth, 400_000],
    [month, 450_000],
  ]);
  const web = await group(it.id, 'Веб-разработка', 'Алишер Назаров', 'Сб/Вс 10:00', [[startMonth, 800_000]]);

  const since = `${startMonth}-01`;
  const students: { name: string; phone: string; groups: number[]; joinedOn?: string }[] = [
    { name: 'Азиз Каримов', phone: '+998 90 123-45-67', groups: [a1.id, math1.id] },
    { name: 'Мадина Юсупова', phone: '+998 91 234-56-78', groups: [a1.id] },
    { name: 'Тимур Рахимов', phone: '+998 93 345-67-89', groups: [math1.id] },
    { name: 'Нилуфар Ахмедова', phone: '+998 94 456-78-90', groups: [b1.id, math1.id] },
    { name: 'Жасур Тошматов', phone: '+998 95 567-89-01', groups: [web.id] },
    { name: 'Дильноза Саидова', phone: '+998 97 678-90-12', groups: [web.id, b1.id] },
    // Пришёл в середине текущего месяца — начисление пропорционально дням
    { name: 'Санжар Исмоилов', phone: '+998 99 789-01-23', groups: [b1.id], joinedOn: `${month}-15` },
  ];

  const ids: number[] = [];
  for (const s of students) {
    const created = await db.student.create({
      data: {
        name: s.name,
        phone: s.phone,
        enrollments: { create: s.groups.map((groupId) => ({ groupId, joinedOn: s.joinedOn ?? since })) },
      },
    });
    ids.push(created.id);
  }

  // [индекс ученика, сумма]
  const prev: [number, number][] = [[0, 900_000], [1, 500_000], [2, 400_000], [3, 700_000], [4, 800_000], [5, 1_400_000]];
  const current: [number, number][] = [[0, 950_000], [1, 250_000], [2, 200_000], [2, 250_000], [4, 300_000]];
  await db.payment.createMany({
    data: [
      ...prev.map(([i, amount]) => ({ studentId: ids[i], amount, date: `${prevMonth}-05` })),
      ...current.map(([i, amount]) => ({ studentId: ids[i], amount, date: `${month}-01` })),
    ],
  });

  console.log(`Создано: предметов 3, групп 4, учеников ${ids.length}, оплат ${prev.length + current.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
