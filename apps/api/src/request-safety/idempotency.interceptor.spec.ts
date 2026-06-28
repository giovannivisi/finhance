import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from '@/request-safety/idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  it('does not persist an idempotency record for self-deletion', async () => {
    const executeJson = jest.fn();
    const handle = jest.fn(() => of(undefined));
    const next = { handle } as CallHandler;
    const request = {
      method: 'DELETE',
      headers: {},
      baseUrl: '/users/me',
      route: { path: '' },
    };
    const response = {
      statusCode: 204,
      status: jest.fn(),
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const interceptor = new IdempotencyInterceptor({
      executeJson,
    } as never);

    await lastValueFrom(interceptor.intercept(context, next));

    expect(handle).toHaveBeenCalledTimes(1);
    expect(executeJson).not.toHaveBeenCalled();
  });
});
