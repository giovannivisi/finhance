import { Injectable } from '@nestjs/common';
import { resolveAuthMode, type AuthMode } from '@/config/auth-mode';

export interface HealthStatusResponse {
  status: 'ok';
  service: 'api';
  authMode: AuthMode;
  timestamp: string;
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getHealth(): HealthStatusResponse {
    return {
      status: 'ok',
      service: 'api',
      authMode: resolveAuthMode(),
      timestamp: new Date().toISOString(),
    };
  }
}
