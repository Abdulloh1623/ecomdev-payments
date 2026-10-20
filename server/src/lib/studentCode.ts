// Код ученика выводится из id и потому всегда уникален: id 2 → ST-0002.
const CODE_RE = /^(?:ST-?)?0*(\d+)$/i;

export const studentCode = (id: number) => `ST-${String(id).padStart(4, '0')}`;

/** Принимает «ST-0002», «st2» или «2»; возвращает id или null. */
export function parseStudentRef(raw: string): number | null {
  const m = CODE_RE.exec(raw.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
