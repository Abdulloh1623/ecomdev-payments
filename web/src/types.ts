export interface Student {
  id: number;
  name: string;
  phone: string;
  group: string;
  monthlyFee: number;
  createdAt: string;
}

export type StudentInput = Omit<Student, 'id' | 'createdAt'>;

export interface Payment {
  id: number;
  studentId: number;
  amount: number;
  date: string;
  createdAt: string;
}

export interface Debtor {
  id: number;
  name: string;
  phone: string;
  group: string;
  monthlyFee: number;
  paid: number;
  debt: number;
  deleted: boolean;
}

export interface DebtorsReport {
  month: string;
  count: number;
  totalDebt: number;
  debtors: Debtor[];
}
