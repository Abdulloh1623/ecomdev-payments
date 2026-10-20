import type { PrismaClient } from '@prisma/client';
import { createAnalyticsService } from './analytics.js';
import { createDebtorService } from './debtors.js';
import { createGroupService } from './groups.js';
import { createLedgerLoader } from './ledger.js';
import { createPaymentService } from './payments.js';
import { createStudentService } from './students.js';
import { createSubjectService } from './subjects.js';

export function createServices(db: PrismaClient, timezone: string) {
  const ledger = createLedgerLoader(db);
  return {
    subjects: createSubjectService(db),
    groups: createGroupService(db, timezone),
    students: createStudentService(db, timezone),
    payments: createPaymentService(db, timezone),
    debtors: createDebtorService(db, ledger),
    analytics: createAnalyticsService(db, ledger),
  };
}

export type Services = ReturnType<typeof createServices>;
