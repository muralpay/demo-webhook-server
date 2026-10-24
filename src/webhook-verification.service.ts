import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

@Injectable()
export class WebhookVerificationService {
  verifyMuralWebhook(
    requestBody: string,
    signature: string,
    timestamp: string,
    publicKey: string,
    now: Date = new Date(),
  ): boolean {
    const webhookTimestamp = new Date(timestamp);

    // An unparseable timestamp gives NaN, and NaN > tolerance is false, so
    // without this check a garbage timestamp would skip the replay window.
    if (Number.isNaN(webhookTimestamp.getTime())) {
      console.error('Webhook timestamp is not a valid ISO 8601 date');
      return false;
    }

    const timeDiff = Math.abs(now.getTime() - webhookTimestamp.getTime());
    if (timeDiff > TIMESTAMP_TOLERANCE_MS) {
      console.error('Webhook timestamp is outside the 5-minute window');
      return false;
    }

    const messageToSign = `${webhookTimestamp.toISOString()}.${requestBody}`;

    const signatureBuffer = Buffer.from(signature, 'base64');

    try {
      const isValid = crypto.verify(
        'sha256',
        Buffer.from(messageToSign),
        {
          key: publicKey,
          dsaEncoding: 'der',
        },
        signatureBuffer,
      );
      return isValid;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }
}
