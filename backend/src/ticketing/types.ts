export interface Matter {
  id: string;
  boardId: string;
  fields: Record<string, FieldValue>;
  cycleTime?: CycleTime;
  sla?: SLAStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FieldValue {
  fieldId: string;
  fieldName: string;
  fieldType: FieldType;
  value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null;
  displayValue?: string;
}

export interface CurrencyValue {
  amount: number;
  currency: string;
}

export interface UserValue {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface StatusValue {
  statusId: string;
  groupName: string;
}

export type FieldType = 'text' | 'number' | 'select' | 'date' | 'currency' | 'boolean' | 'status' | 'user';

export interface CycleTime {
  resolutionTimeMs: number | null;
  resolutionTimeFormatted: string;
  isInProgress: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
}

export type SLAStatus = 'In Progress' | 'Met' | 'Breached';

export interface MatterListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface MatterListResponse {
  data: Matter[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Field {
  id: string;
  accountId: number;
  name: string;
  fieldType: FieldType;
  description?: string;
  metadata?: Record<string, unknown>;
  systemField: boolean;
  options?: FieldOption[];
  statusOptions?: StatusOption[];
}

export interface FieldOption {
  id: string;
  label: string;
  sequence: number;
}

export interface StatusOption {
  id: string;
  label: string;
  groupId: string;
  groupName: string;
  sequence: number;
}

export interface StatusGroup {
  id: string;
  name: string;
  sequence: number;
}

export interface CycleTimeHistory {
  id: string;
  ticketId: string;
  statusFieldId: string;
  fromStatusId: string | null;
  toStatusId: string;
  transitionedAt: Date;
}

