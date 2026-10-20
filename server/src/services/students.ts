import type { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from '../errors.js';
import type { StudentInput, StudentUpdate } from '../schemas.js';

export const studentSelect = {
  id: true,
  name: true,
  phone: true,
  group: true,
  monthlyFee: true,
  createdAt: true,
} as const satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const toDto = (s: StudentRow) => ({ ...s, createdAt: s.createdAt.toISOString() });
export type StudentDto = ReturnType<typeof toDto>;

export function createStudentService(db: PrismaClient) {
  async function getActive(id: number) {
    const student = await db.student.findFirst({ where: { id, deletedAt: null }, select: studentSelect });
    if (!student) throw notFound('Ученик');
    return student;
  }

  return {
    async list(filter: { group?: string } = {}): Promise<StudentDto[]> {
      const rows = await db.student.findMany({
        where: { deletedAt: null, group: filter.group },
        orderBy: { id: 'asc' },
        select: studentSelect,
      });
      return rows.map(toDto);
    },

    async get(id: number): Promise<StudentDto> {
      return toDto(await getActive(id));
    },

    async create(input: StudentInput): Promise<StudentDto> {
      return toDto(await db.student.create({ data: input, select: studentSelect }));
    },

    async update(id: number, input: StudentUpdate): Promise<StudentDto> {
      // updateMany позволяет атомарно учесть условие deletedAt = null
      const { count } = await db.student.updateMany({ where: { id, deletedAt: null }, data: input });
      if (count === 0) throw notFound('Ученик');
      return toDto(await getActive(id));
    },

    async remove(id: number): Promise<void> {
      const { count } = await db.student.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw notFound('Ученик');
    },
  };
}
