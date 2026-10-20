import { z } from 'zod';
import { isValidDate, isValidMonth } from './lib/dates.js';

const PHONE_RE = /^\+?[0-9\s()-]{7,20}$/;
const MAX_AMOUNT = 1_000_000_000;

const amount = z.number().int('Сумма должна быть целым числом').positive('Сумма должна быть больше нуля').max(MAX_AMOUNT);
const date = z.string().refine(isValidDate, 'Дата в формате YYYY-MM-DD');
export const month = z.string().refine(isValidMonth, 'Месяц в формате YYYY-MM');
const name = (what: string, max: number) => z.string().trim().min(1, `${what}: обязательное поле`).max(max);
// Пустая строка или null очищают поле
const optionalText = z.string().trim().max(100).nullable().optional();
const groupIds = z
  .array(z.number().int().positive())
  .min(1, 'Выберите хотя бы одну группу')
  .max(20)
  .describe('id групп ученика');

const hasAny = (v: object) => Object.values(v).some((x) => x !== undefined);
const nonEmptyMessage = 'Передайте хотя бы одно поле для изменения';

// ── Предметы ──────────────────────────────────────────────

export const subjectInput = z.object({ name: name('Название', 100) });
export type SubjectInput = z.infer<typeof subjectInput>;

export const subject = z.object({
  id: z.number(),
  name: z.string(),
  groupCount: z.number(),
  createdAt: z.string(),
});

// ── Группы ────────────────────────────────────────────────

export const groupInput = z.object({
  subjectId: z.number().int().positive(),
  name: name('Название', 100),
  monthlyPrice: amount,
  teacher: optionalText,
  schedule: optionalText.describe('Например «Пн/Ср/Пт 18:00»'),
});
export type GroupInput = z.infer<typeof groupInput>;

export const groupUpdate = z
  .object({
    subjectId: z.number().int().positive().optional(),
    name: name('Название', 100).optional(),
    teacher: optionalText,
    schedule: optionalText,
    monthlyPrice: amount.optional(),
    priceFrom: month.optional().describe('С какого месяца действует новая цена; по умолчанию — текущий'),
  })
  .refine(hasAny, nonEmptyMessage);
export type GroupUpdate = z.infer<typeof groupUpdate>;

export const group = z.object({
  id: z.number(),
  subjectId: z.number(),
  subjectName: z.string(),
  name: z.string(),
  teacher: z.string().nullable(),
  schedule: z.string().nullable(),
  monthlyPrice: z.number().describe('Цена текущего месяца'),
  studentCount: z.number(),
  createdAt: z.string(),
});

export const groupDetail = group.extend({
  prices: z.array(z.object({ amount: z.number(), fromMonth: z.string() })),
  students: z.array(
    z.object({ id: z.number(), code: z.string(), name: z.string(), phone: z.string(), joinedOn: z.string() }),
  ),
});

// ── Ученики ───────────────────────────────────────────────

export const studentInput = z.object({
  name: name('Имя', 100),
  phone: z.string().trim().regex(PHONE_RE, 'Телефон: 7–20 символов, цифры, пробелы, + - ( )'),
  groupIds,
  joinedOn: date.optional().describe('Дата начала занятий; по умолчанию — сегодня'),
});
export type StudentInput = z.infer<typeof studentInput>;

export const studentUpdate = z
  .object({
    name: studentInput.shape.name.optional(),
    phone: studentInput.shape.phone.optional(),
    groupIds: groupIds.optional().describe('Новый полный список групп'),
    effectiveOn: date.optional().describe('Дата перевода между группами; по умолчанию — сегодня'),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined || v.groupIds !== undefined, nonEmptyMessage);
export type StudentUpdate = z.infer<typeof studentUpdate>;

export const student = z.object({
  id: z.number(),
  code: z.string().describe('Код ученика, например ST-0001'),
  name: z.string(),
  phone: z.string(),
  monthlyFee: z.number().describe('Сумма цен текущих групп за полный месяц'),
  groups: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      subjectId: z.number(),
      subjectName: z.string(),
      monthlyPrice: z.number(),
      joinedOn: z.string(),
    }),
  ),
  createdAt: z.string(),
});

// ── Оплаты ────────────────────────────────────────────────

export const paymentInput = z.object({
  studentId: z.number().int().positive(),
  amount,
  date: date.optional().describe('Дата оплаты YYYY-MM-DD; по умолчанию — сегодня'),
});
export type PaymentInput = z.infer<typeof paymentInput>;

export const payment = z.object({
  id: z.number(),
  studentId: z.number(),
  amount: z.number(),
  date: z.string(),
  createdAt: z.string(),
});

// ── Должники ──────────────────────────────────────────────

export const debtor = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  phone: z.string(),
  due: z.number().describe('Начислено за месяц по группам'),
  paid: z.number(),
  debt: z.number(),
  deleted: z.boolean().describe('Ученик удалён позже (долг за этот месяц остаётся в истории)'),
  groups: z.array(
    z.object({
      groupId: z.number(),
      name: z.string(),
      subjectName: z.string(),
      price: z.number(),
      days: z.number().describe('Дней в группе в этом месяце'),
      charge: z.number(),
    }),
  ),
});

export const debtorsReport = z.object({
  month: z.string(),
  count: z.number(),
  totalDebt: z.number(),
  debtors: z.array(debtor),
});

// ── Аналитика ─────────────────────────────────────────────

const rate = z.number().nullable().describe('Собираемость, %; null — ничего не начислено');
const money = {
  due: z.number().describe('Начислено'),
  paid: z.number().describe('Оплачено'),
  debt: z.number().describe('Долг'),
};

export const summaryQuery = z.object({
  from: month.optional().describe('Первый месяц; по умолчанию — 5 месяцев до to'),
  to: month.optional().describe('Последний месяц; по умолчанию — текущий'),
});

export const analyticsSummary = z.object({
  from: z.string(),
  to: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      ...money,
      collected: z.number().describe('Оплачено в пределах начисленного'),
      overpaid: z.number().describe('Переплата сверх начисленного'),
      collectionRate: rate,
      activeStudents: z.number().describe('Учились хотя бы день'),
      newStudents: z.number().describe('Впервые пришли в центр'),
      leftStudents: z.number().describe('Ушли из всех групп'),
      debtors: z.number(),
    }),
  ),
  totals: z.object({
    ...money,
    collected: z.number(),
    overpaid: z.number(),
    collectionRate: rate,
    newStudents: z.number(),
    leftStudents: z.number(),
  }),
});

const breakdownRow = { students: z.number(), ...money, collectionRate: rate };

export const analyticsBreakdown = z.object({
  month: z.string(),
  totals: z.object({
    ...money,
    unallocated: z.number().describe('Переплаты и оплаты учеников без групп'),
    collectionRate: rate,
  }),
  subjects: z.array(
    z.object({
      subjectId: z.number(),
      name: z.string(),
      ...breakdownRow,
      groups: z.array(z.object({ groupId: z.number(), name: z.string(), ...breakdownRow })),
    }),
  ),
});

export const analyticsDaily = z.object({
  month: z.string(),
  total: z.number(),
  count: z.number(),
  days: z.array(z.object({ date: z.string(), amount: z.number(), count: z.number() })),
});

// ── Общее ─────────────────────────────────────────────────

export const idParams = z.object({ id: z.coerce.number().int().positive() });
export const studentRefParams = z.object({ id: z.string().describe('id или код ученика (ST-0001)') });

export const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
