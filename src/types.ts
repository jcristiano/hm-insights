export interface Category {
  key: number;
  name: string;
  parent?: number;
  flags?: number;
}

export interface Account {
  key: number;
  name: string;
  bankname?: string;
  initial: number;
}

export interface Payee {
  key: number;
  name: string;
}

export interface Operation {
  date: Date;
  amount: number;
  accountKey: number;
  categoryKey?: number;
  payeeKey?: number;
  wording?: string;
  flags?: number;
  kxfer?: number;
  isTransfer?: boolean;
}

export interface DetailedOperation {
  date: Date;
  amount: number;
  rawAmount?: number;
  accountName?: string;
  categoryName: string;
  subcategoryName?: string;
  payeeName?: string;
  wording?: string;
  categoryKey?: number;
  subcategoryKey?: number;
}

export interface SubcategorySummary {
  key: number;
  name: string;
  total: number;
  operationsCount: number;
  percentage: number;
}

export interface CategorySummary {
  key: number;
  name: string;
  total: number;
  subcategories: SubcategorySummary[];
  percentage: number;
  operations: DetailedOperation[];
  isIncome?: boolean;
}

export type PresetPeriod =
  | 'all'
  | 'current_month'
  | 'previous_month'
  | 'current_bimonth'
  | 'current_quarter'
  | 'current_semester'
  | 'current_year'
  | 'custom';

