import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookVerificationService } from './webhook-verification.service';

// Request body shape for every Mural webhook event.
// See https://developers.muralpay.com/docs/mural-webhooks and /docs/event-types
export interface MuralWebhookEvent {
  eventId: string;
  deliveryId: string;
  attemptNumber: number;
  eventCategory: string;
  occurredAt: string;
  payload: { type: string; [key: string]: unknown };
}

@Controller('test')
export class WebhookController {
  private readonly muralPublicKey: string;

  // Mural retries failed deliveries, so the same eventId can arrive more than
  // once. An in-memory set is enough for a demo; use a durable store in
  // production so deduplication survives restarts and multiple instances.
  private readonly processedEventIds = new Set<string>();

  constructor(private readonly verificationService: WebhookVerificationService) {
    const key = process.env.WEBHOOK_SECRET;
    if (!key) {
      throw new Error('WEBHOOK_SECRET is not set. Paste the webhook public key into .env (see README).');
    }
    this.muralPublicKey = key.replace(/\\n/g, '\n');
  }

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-mural-webhook-signature') signature: string,
    @Headers('x-mural-webhook-timestamp') timestamp: string,
  ) {
    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing required webhook headers');
    }

    // The signature covers the exact bytes Mural sent. Re-serializing the
    // parsed body (JSON.stringify) can change them, so never fall back to it.
    if (!req.rawBody) {
      throw new InternalServerErrorException('Raw body unavailable; enable rawBody in NestFactory.create');
    }
    const rawBody = req.rawBody.toString('utf8');

    const isValid = this.verificationService.verifyMuralWebhook(
      rawBody,
      signature,
      timestamp,
      this.muralPublicKey,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Only trust and log the body after the signature checks out.
    let event: MuralWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Body is not valid JSON');
    }

    if (this.processedEventIds.has(event.eventId)) {
      console.log(`Duplicate delivery of event ${event.eventId} (attempt ${event.attemptNumber}), skipping`);
      return { message: 'Duplicate event ignored' };
    }
    this.processedEventIds.add(event.eventId);

    console.log(`Verified ${event.eventCategory} / ${event.payload?.type} event ${event.eventId}:`, event);
    return { message: 'Webhook received and verified successfully' };
  }
}
