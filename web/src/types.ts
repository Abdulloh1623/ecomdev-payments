export interface Subject {
  id: number;
  name: string;
  groupCount: number;
  createdAt: string;
}

export interface Group {
  id: number;
  subjectId: number;
  subjectName: string;
  name: string;
  teacher: string | null;
  schedule: string | null;
  monthlyPrice: number;
  studentCount: number;
  createdAt: string;
}

export interface GroupInput {
  subjectId: number;
  name: string;
  monthlyPrice: number;
  teacher?: string | null;
  schedule?: string | null;
}

export interface StudentGroup {
  id: number;
  name: string;
  subjectId: number;
  subjectName: string;
  monthlyPrice: number;
  joinedOn: string;
}

export interface Student {
  id: number;
  code: string;
  name: string;
  phone: string;
  monthlyFee: number;
  groups: StudentGroup[];
  createdAt: string;
}

export interface StudentInput {
  name: string;
  phone: string;
  groupIds: number[];
}

export interface Payment {
  id: number;
  studentId: number;
  amount: number;
  date: string;
  createdAt: string;
}

export interface ChargeLine {
  groupId: number;
  name: string;
  subjectName: string;
  price: number;
  days: number;
  charge: number;
}

export interface Debtor {
  id: number;
  code: string;
  name: string;
  phone: string;
  due: number;
  paid: number;
  debt: number;
  deleted: boolean;
  groups: ChargeLine[];
}

export interface DebtorsReport {
  month: string;
  count: number;
  totalDebt: number;
  debtors: Debtor[];
}
