import type { Response } from 'express';

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({ data });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ data });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function paginated<T>(res: Response, data: T[], pagination: Pagination): Response {
  return res.status(200).json({ data, pagination });
}

export function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
