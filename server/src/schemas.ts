import { z } from 'zod';
import { isValidDate, isValidMonth } from './lib/dates.js';

const PHONE_RE = /^\+?[0-9\s()-]{7,20}$/;
const MAX_AMOUNT = 1_000_000_000;

const amount = z.number().int('Сумма должна быть целым числом').positive('Сумма должна быть больше нуля').max(MAX_AMOUNT);

export const studentInput = z.object({
  name: z.string().trim().min(1, 'Имя обязательно').max(100),
  phone: z.string().trim().regex(PHONE_RE, 'Телефон: 7–20 символов, цифры, пробелы, + - ( )'),
  group: z.string().trim().min(1, 'Группа обязательна').max(50),
  monthlyFee: amount,
});
export type StudentInput = z.infer<typeof studentInput>;

export const studentUpdate = studentInput
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Передайте хотя бы одно поле для изменения');
export type StudentUpdate = z.infer<typeof studentUpdate>;

export const student = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  group: z.string(),
  monthlyFee: z.number(),
  createdAt: z.string(),
});

export const paymentInput = z.object({
  studentId: z.number().int().positive(),
  amount,
  date: z
    .string()
    .refine(isValidDate, 'Дата в формате YYYY-MM-DD')
    .optional()
    .describe('Дата оплаты YYYY-MM-DD; по умолчанию — сегодня'),
});
export type PaymentInput = z.infer<typeof paymentInput>;

export const payment = z.object({
  id: z.number(),
  studentId: z.number(),
  amount: z.number(),
  date: z.string(),
  createdAt: z.string(),
});

export const month = z.string().refine(isValidMonth, 'Месяц в формате YYYY-MM');

export const debtor = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  group: z.string(),
  monthlyFee: z.number(),
  paid: z.number(),
  debt: z.number(),
});

export const debtorsReport = z.object({
  month: z.string(),
  count: z.number(),
  totalDebt: z.number(),
  debtors: z.array(debtor),
});

export const idParams = z.object({ id: z.coerce.number().int().positive() });

export const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
