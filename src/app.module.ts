import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookVerificationService } from './webhook-verification.service';

@Module({
  controllers: [WebhookController],
  providers: [WebhookVerificationService],
})
export class AppModule {}