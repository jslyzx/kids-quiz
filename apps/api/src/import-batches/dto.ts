export type CreateImportBatchDto = {
  title?: string;
  sourceType?: string;
  sourceName?: string;
  notes?: string;
};

export type FinishImportBatchDto = {
  status?: 'COMPLETED' | 'FAILED';
  stats?: Record<string, unknown>;
  notes?: string;
};
