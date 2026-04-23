import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { BadRequestException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import type { ValidationError } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import {
  createCorsOptions,
  resolveBootstrapRuntimeConfig,
} from '@/config/bootstrap.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = resolveBootstrapRuntimeConfig();
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.enableCors(createCorsOptions(config.allowedOrigins));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: isProduction
        ? () => new BadRequestException('Validation failed.')
        : (errors: ValidationError[]) => new BadRequestException(errors),
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, config.host);
}
void bootstrap();
