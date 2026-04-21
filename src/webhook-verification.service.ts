import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebhookVerificationService {
  verifyMuralWebhook(
    requestBody: string,
    signature: string,
    timestamp: string,
    publicKey: string,
  ): boolean {
    const currentTime = new Date();
    const webhookTimestamp = new Date(timestamp);
    const timeDiff = Math.abs(currentTime.getTime() - webhookTimestamp.getTime());
    
    if (timeDiff > 5 * 60 * 1000) {
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