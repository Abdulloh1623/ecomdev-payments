import type { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from '../errors.js';
import { todayIn } from '../lib/dates.js';
import type { PaymentInput } from '../schemas.js';

const paymentSelect = {
  id: true,
  studentId: true,
  amount: true,
  date: true,
  createdAt: true,
} as const satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

const toDto = (p: PaymentRow) => ({ ...p, createdAt: p.createdAt.toISOString() });
export type PaymentDto = ReturnType<typeof toDto>;

export function createPaymentService(db: PrismaClient, timezone: string) {
  return {
    async create(input: PaymentInput): Promise<PaymentDto> {
      // Оплату можно внести только действующему (не удалённому) ученику
      const student = await db.student.findFirst({
        where: { id: input.studentId, deletedAt: null },
        select: { id: true },
      });
      if (!student) throw notFound('Ученик');

      const created = await db.payment.create({
        data: { studentId: input.studentId, amount: input.amount, date: input.date ?? todayIn(timezone) },
        select: paymentSelect,
      });
      return toDto(created);
    },

    /** История оплат ученика, включая удалённых: история не теряется. */
    async listByStudent(studentId: number): Promise<PaymentDto[]> {
      const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true } });
      if (!student) throw notFound('Ученик');

      const rows = await db.payment.findMany({
        where: { studentId },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        select: paymentSelect,
      });
      return rows.map(toDto);
    },
  };
}
