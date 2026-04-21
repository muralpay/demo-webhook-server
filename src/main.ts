import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import * as util from 'util';
import { AppModule } from './app.module';

util.inspect.defaultOptions.depth = null;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const port = Number(process.env.PORT) || 8081;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();