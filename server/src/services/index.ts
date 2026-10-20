import type { PrismaClient } from '@prisma/client';
import { createDebtorService } from './debtors.js';
import { createPaymentService } from './payments.js';
import { createStudentService } from './students.js';

export function createServices(db: PrismaClient, timezone: string) {
  return {
    students: createStudentService(db),
    payments: createPaymentService(db, timezone),
    debtors: createDebtorService(db, timezone),
  };
}

export type Services = ReturnType<typeof createServices>;
