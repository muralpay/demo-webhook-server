import { Controller, Post, Body, Headers, UnauthorizedException, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhookVerificationService } from './webhook-verification.service';

@Controller('test')
export class WebhookController {
  constructor(private readonly verificationService: WebhookVerificationService) {}

  @Post('webhook')
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('x-mural-webhook-signature') signature: string,
    @Headers('x-mural-webhook-timestamp') timestamp: string,
  ) {
    console.log('Webhook received (local):', body);
    console.log('Signature:', signature);
    console.log('Timestamp:', timestamp);

    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing required webhook headers');
    }

    // local
    const muralPublicKey = (process.env.WEBHOOK_SECRET ?? '').replace(/\\n/g, '\n');

    console.log('Mural public key (local):', muralPublicKey);
    const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(body);

    const isValid = this.verificationService.verifyMuralWebhook(
      rawBody,
      signature,
      timestamp,
      muralPublicKey,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    console.log('Webhook signature verified successfully (local)');
    return { message: 'Webhook received and verified successfully (local)', data: body };
  }
}