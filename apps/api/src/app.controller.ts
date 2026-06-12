import { Controller, Get } from '@nestjs/common';
import { AppService } from '@/app.service';
import { PublicRoute } from '@/security/public-route';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @PublicRoute()
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
