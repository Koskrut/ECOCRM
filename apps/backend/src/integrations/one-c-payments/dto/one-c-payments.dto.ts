export type CommitOneCPaymentsDto = {
  /** Optional per-row order overrides keyed by importKey (merged with staged overrides). */
  overrides?: Record<string, string>;
};

export type SetOneCOverridesDto = {
  overrides: Record<string, string>;
};

export type CreateOneCContactDto = {
  enterpriseCode: string;
  enterpriseName: string;
};
