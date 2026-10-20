// Демо-данные: ученики, записанные два месяца назад, и оплаты за прошлый и текущий месяц.
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { currentMonth, zonedStartOfDay } from '../src/lib/dates.js';

const db = new PrismaClient();
const tz = process.env.APP_TIMEZONE ?? 'Asia/Tashkent';

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

const students = [
  { name: 'Азиз Каримов', phone: '+998 90 123-45-67', group: 'Английский A1', monthlyFee: 500_000 },
  { name: 'Мадина Юсупова', phone: '+998 91 234-56-78', group: 'Английский A1', monthlyFee: 500_000 },
  { name: 'Тимур Рахимов', phone: '+998 93 345-67-89', group: 'Математика', monthlyFee: 400_000 },
  { name: 'Нилуфар Ахмедова', phone: '+998 94 456-78-90', group: 'Математика', monthlyFee: 400_000 },
  { name: 'Жасур Тошматов', phone: '+998 95 567-89-01', group: 'Программирование', monthlyFee: 800_000 },
  { name: 'Дильноза Саидова', phone: '+998 97 678-90-12', group: 'Программирование', monthlyFee: 800_000 },
];

// [индекс ученика, сумма]
const prevMonthPayments: [number, number][] = [
  [0, 500_000], [1, 500_000], [2, 400_000], [3, 200_000], [4, 800_000], [5, 800_000],
];
const thisMonthPayments: [number, number][] = [
  [0, 500_000], [1, 250_000], [2, 100_000], [2, 300_000], [4, 300_000],
];

async function main() {
  if ((await db.student.count()) > 0) {
    console.log('В базе уже есть ученики — сид пропущен');
    return;
  }

  const month = currentMonth(tz);
  const prevMonth = shiftMonth(month, -1);
  const createdAt = zonedStartOfDay(`${shiftMonth(month, -2)}-01`, tz);

  const created: { id: number }[] = [];
  for (const s of students) created.push(await db.student.create({ data: { ...s, createdAt } }));

  const payments = [
    ...prevMonthPayments.map(([i, amount]) => ({ studentId: created[i].id, amount, date: `${prevMonth}-05` })),
    ...thisMonthPayments.map(([i, amount]) => ({ studentId: created[i].id, amount, date: `${month}-01` })),
  ];
  await db.payment.createMany({ data: payments });

  console.log(`Создано учеников: ${created.length}, оплат: ${payments.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
