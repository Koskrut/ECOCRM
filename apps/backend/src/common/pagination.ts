export type PaginationParams = {
  page?: unknown;
  pageSize?: unknown;
};

export type Pagination = {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
};

export const normalizePagination = (
  params: PaginationParams,
  defaults: { page: number; pageSize: number } = { page: 1, pageSize: 20 },
): Pagination => {
  const parsedPage = Number(params.page);
  const parsedPageSize = Number(params.pageSize);

  const page =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : defaults.page;
  const pageSize =
    Number.isFinite(parsedPageSize) && parsedPageSize > 0
      ? parsedPageSize
      : defaults.pageSize;

  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
};
