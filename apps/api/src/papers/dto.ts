export type CreatePaperDto = {
  title: string;
  description?: string;
};

export type UpdatePaperDto = Partial<CreatePaperDto>;

export type AddPaperQuestionGroupDto = {
  groupId: string | number;
};

export type ReorderPaperItemsDto = {
  itemIds: Array<string | number>;
};

export type SmartGeneratePaperDto = {
  title: string;
  description?: string;
  count?: number;
  keyword?: string;
  gradeLevel?: string;
  tag?: string;
  maxDifficulty?: number;
};
