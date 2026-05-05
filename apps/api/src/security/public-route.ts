import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC_ROUTE_KEY = 'finhance:isPublicRoute';

export const PublicRoute = () => SetMetadata(IS_PUBLIC_ROUTE_KEY, true);

export function isPublicRoute(
  context: ExecutionContext,
  reflector: Reflector,
): boolean {
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}
