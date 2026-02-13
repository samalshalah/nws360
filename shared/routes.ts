import { z } from 'zod';
import { insertUserSchema, insertSourceSchema, insertKeywordSchema, users, sources, articles, keywords } from './schema';

export type LoginRequest = { username: string; password: string };
export type RegisterRequest = z.infer<typeof insertUserSchema>;

// Shared Error Schemas
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  sources: {
    list: {
      method: 'GET' as const,
      path: '/api/sources' as const,
      responses: {
        200: z.array(z.custom<typeof sources.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/sources' as const,
      input: insertSourceSchema,
      responses: {
        201: z.custom<typeof sources.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/sources/:id' as const,
      input: insertSourceSchema.partial(),
      responses: {
        200: z.custom<typeof sources.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/sources/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  articles: {
    list: {
      method: 'GET' as const,
      path: '/api/articles' as const,
      input: z.object({
        search: z.string().optional(),
        sourceId: z.coerce.number().optional(),
        sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.object({
          items: z.array(z.custom<typeof articles.$inferSelect & { source: typeof sources.$inferSelect | null }>()),
          total: z.number(),
          page: z.number(),
          limit: z.number(),
        }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/articles/:id' as const,
      responses: {
        200: z.custom<typeof articles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  keywords: {
    list: {
      method: 'GET' as const,
      path: '/api/keywords' as const,
      responses: {
        200: z.array(z.custom<typeof keywords.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/keywords' as const,
      input: insertKeywordSchema,
      responses: {
        201: z.custom<typeof keywords.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/keywords/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  analytics: {
    stats: {
      method: 'GET' as const,
      path: '/api/analytics/stats' as const,
      responses: {
        200: z.object({
          totalArticles: z.number(),
          sourcesCount: z.number(),
          sentimentDistribution: z.array(z.object({
            name: z.string(),
            value: z.number(),
          })),
          trendingKeywords: z.array(z.object({
            text: z.string(),
            value: z.number(),
          })),
          topSources: z.array(z.object({
            name: z.string(),
            count: z.number(),
          })).optional(),
        }),
      },
    },
    sentimentTrend: {
      method: 'GET' as const,
      path: '/api/analytics/sentiment-trend' as const,
      responses: {
        200: z.array(z.object({
          date: z.string(),
          positive: z.number(),
          negative: z.number(),
          neutral: z.number(),
        })),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
