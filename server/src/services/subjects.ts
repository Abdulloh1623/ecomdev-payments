import type { PrismaClient } from '@prisma/client';
import { conflict, notFound } from '../errors.js';
import type { SubjectInput } from '../schemas.js';

const activeGroups = { where: { deletedAt: null } } as const;

export function createSubjectService(db: PrismaClient) {
  async function assertUniqueName(name: string, exceptId?: number) {
    const all = await db.subject.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    if (all.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase())) {
      throw conflict(`Предмет «${name}» уже есть`);
    }
  }

  async function get(id: number) {
    const s = await db.subject.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { groups: activeGroups } } },
    });
    if (!s) throw notFound('Предмет');
    return { id: s.id, name: s.name, groupCount: s._count.groups, createdAt: s.createdAt.toISOString() };
  }

  return {
    get,

    async list() {
      const rows = await db.subject.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        include: { _count: { select: { groups: activeGroups } } },
      });
      return rows.map((s) => ({ id: s.id, name: s.name, groupCount: s._count.groups, createdAt: s.createdAt.toISOString() }));
    },

    async create(input: SubjectInput) {
      await assertUniqueName(input.name);
      const s = await db.subject.create({ data: { name: input.name } });
      return get(s.id);
    },

    async update(id: number, input: SubjectInput) {
      await get(id);
      await assertUniqueName(input.name, id);
      await db.subject.update({ where: { id }, data: { name: input.name } });
      return get(id);
    },

    /** Удалить можно только предмет без действующих групп. */
    async remove(id: number) {
      const s = await get(id);
      if (s.groupCount > 0) throw conflict(`У предмета есть группы (${s.groupCount}) — сначала удалите их`);
      await db.subject.update({ where: { id }, data: { deletedAt: new Date() } });
    },
  };
}
