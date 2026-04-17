import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import helmet from 'helmet';
import {
  createCorsOptions,
  resolveBootstrapRuntimeConfig,
} from '@/config/bootstrap.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = resolveBootstrapRuntimeConfig();

  app.use(helmet());
  app.enableCors(createCorsOptions(config.allowedOrigins));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, config.host);
}
bootstrap();
