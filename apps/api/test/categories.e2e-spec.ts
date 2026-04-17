import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CategoriesController } from '@transactions/categories.controller';
import { CategoriesService } from '@transactions/categories.service';
import type { CategoryResponse } from '@finhance/shared';
import { Category, CategoryType } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];
type CategoryUpdateCall = {
  where: { id: string };
  data: {
    archivedAt?: Date;
    order?: number;
  };
};

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[index]?.[0] as T;
}

function createCategory(overrides: Partial<Category> = {}): Category {
  const now = new Date('2026-04-17T10:00:00.000Z');

  return {
    id: 'category-1',
    userId: OWNER_ID,
    name: 'Groceries',
    type: CategoryType.EXPENSE,
    order: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function expectCategoryResponseDto(
  body: Record<string, unknown>,
  category: Category,
) {
  expect(body).toEqual({
    id: category.id,
    name: category.name,
    type: category.type,
    order: category.order,
    archivedAt: category.archivedAt?.toISOString() ?? null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  });
  expect(body).not.toHaveProperty('userId');
}

describe('Category routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    category: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          category: typeof prisma.category;
        }) => Promise<unknown>,
      ) =>
        callback({
          category: prisma.category,
        }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RequestOwnerResolver,
          useValue: {
            resolveOwnerId: () => OWNER_ID,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates categories through POST /categories', async () => {
    const created = createCategory();
    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.category.create.mockResolvedValue(created);
    prisma.category.findFirst.mockResolvedValueOnce(created);

    await request(httpServer())
      .post('/categories')
      .send({
        name: 'Groceries',
        type: 'EXPENSE',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        expectCategoryResponseDto(
          bodyAs<Record<string, unknown>>(response),
          created,
        );
      });
  });

  it('returns DTO responses from GET /categories', async () => {
    const category = createCategory();
    prisma.category.findMany.mockResolvedValue([category]);

    await request(httpServer())
      .get('/categories')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<CategoryResponse[]>(response);
        expect(body).toHaveLength(1);
        expectCategoryResponseDto(
          body[0] as unknown as Record<string, unknown>,
          category,
        );
      });
  });

  it('archives categories through DELETE /categories/:id', async () => {
    const first = createCategory({ id: 'category-1', order: 0 });
    const second = createCategory({ id: 'category-2', order: 1 });
    prisma.category.findFirst.mockResolvedValue(first);
    prisma.category.findMany.mockResolvedValue([first, second]);
    prisma.category.update.mockResolvedValue(second);

    await request(httpServer()).delete('/categories/category-1').expect(204);

    const updateCall = nthCallArg<CategoryUpdateCall>(
      prisma.category.update,
      0,
    );

    expect(updateCall).toMatchObject({
      where: { id: 'category-1' },
      data: {
        archivedAt: expect.any(Date) as Date,
      },
    });
  });

  it('rejects client-controlled archivedAt on PUT /categories/:id', async () => {
    await request(httpServer())
      .put('/categories/category-1')
      .send({
        name: 'Groceries',
        type: 'EXPENSE',
        archivedAt: '2026-04-17T10:00:00.000Z',
      })
      .expect(400);
  });
});
