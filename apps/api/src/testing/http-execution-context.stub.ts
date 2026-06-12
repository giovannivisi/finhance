import type { ExecutionContext } from '@nestjs/common';

export function createHttpExecutionContext<TRequest extends object>(
  request: TRequest,
  handler: () => unknown = () => undefined,
): ExecutionContext {
  const classRef = class TestController {};
  const args = [request, undefined, undefined];

  return {
    getClass: () => classRef,
    getHandler: () => handler,
    getArgs: () => args,
    getArgByIndex: (index: number) => args[index],
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    switchToRpc: () => ({
      getData: () => undefined,
      getContext: () => undefined,
    }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}
