import type {
  AnalyticsBreakdown,
  AnalyticsDaily,
  AnalyticsSummary,
  DebtorsReport,
  Group,
  GroupInput,
  Payment,
  Student,
  StudentInput,
  Subject,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

interface ErrorBody {
  error?: { message?: string; details?: { message: string }[] };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ErrorBody | null)?.error;
    const message = err?.details?.map((d) => d.message).join('; ') || err?.message || `Ошибка сервера (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  debtors: (month: string) => request<DebtorsReport>(`/debtors?month=${encodeURIComponent(month)}`),
  summary: (from: string, to: string) => request<AnalyticsSummary>(`/analytics/summary?from=${from}&to=${to}`),
  breakdown: (month: string) => request<AnalyticsBreakdown>(`/analytics/breakdown?month=${month}`),
  daily: (month: string) => request<AnalyticsDaily>(`/analytics/daily?month=${month}`),
  subjects: () => request<Subject[]>('/subjects'),
  createSubject: (name: string) => request<Subject>('/subjects', { method: 'POST', body: json({ name }) }),
  deleteSubject: (id: number) => request<void>(`/subjects/${id}`, { method: 'DELETE' }),
  groups: () => request<Group[]>('/groups'),
  createGroup: (input: GroupInput) => request<Group>('/groups', { method: 'POST', body: json(input) }),
  updateGroup: (id: number, input: Partial<Omit<GroupInput, 'subjectId'>>) =>
    request<Group>(`/groups/${id}`, { method: 'PATCH', body: json(input) }),
  deleteGroup: (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),
  students: () => request<Student[]>('/students'),
  createStudent: (input: StudentInput) => request<Student>('/students', { method: 'POST', body: json(input) }),
  updateStudent: (id: number, input: StudentInput) =>
    request<Student>(`/students/${id}`, { method: 'PATCH', body: json(input) }),
  deleteStudent: (id: number) => request<void>(`/students/${id}`, { method: 'DELETE' }),
  payments: (studentId: number) => request<Payment[]>(`/students/${studentId}/payments`),
  createPayment: (input: { studentId: number; amount: number; date: string }) =>
    request<Payment>('/payments', { method: 'POST', body: json(input) }),
};
