import * as crypto from 'crypto';
import { WebhookVerificationService } from './webhook-verification.service';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const sign = (timestamp: string, body: string, key: crypto.KeyObject = privateKey) =>
  crypto.sign('sha256', Buffer.from(`${timestamp}.${body}`), { key, dsaEncoding: 'der' }).toString('base64');

describe('WebhookVerificationService', () => {
  const service = new WebhookVerificationService();
  const now = new Date('2025-08-29T05:52:30.411Z');
  const timestamp = now.toISOString();
  const body = '{"eventId":"42ddfeb3","eventCategory":"MURAL_ACCOUNT_BALANCE_ACTIVITY","payload":{"type":"account_credited"}}';

  beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));

  it('accepts a valid signature', () => {
    expect(service.verifyMuralWebhook(body, sign(timestamp, body), timestamp, publicKeyPem, now)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = body.replace('account_credited', 'account_debited');
    expect(service.verifyMuralWebhook(tampered, sign(timestamp, body), timestamp, publicKeyPem, now)).toBe(false);
  });

  it('rejects a body re-serialized with different whitespace', () => {
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(service.verifyMuralWebhook(reserialized, sign(timestamp, body), timestamp, publicKeyPem, now)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    expect(service.verifyMuralWebhook(body, sign(timestamp, body, other), timestamp, publicKeyPem, now)).toBe(false);
  });

  it('rejects a timestamp that does not match the signed one', () => {
    const later = new Date(now.getTime() + 1000).toISOString();
    expect(service.verifyMuralWebhook(body, sign(timestamp, body), later, publicKeyPem, now)).toBe(false);
  });

  it('rejects timestamps outside the 5-minute window, in either direction', () => {
    const old = new Date(now.getTime() - 5 * 60 * 1000 - 1).toISOString();
    const future = new Date(now.getTime() + 5 * 60 * 1000 + 1).toISOString();
    expect(service.verifyMuralWebhook(body, sign(old, body), old, publicKeyPem, now)).toBe(false);
    expect(service.verifyMuralWebhook(body, sign(future, body), future, publicKeyPem, now)).toBe(false);
  });

  it('rejects an unparseable timestamp instead of throwing', () => {
    expect(() => service.verifyMuralWebhook(body, sign(timestamp, body), 'not-a-date', publicKeyPem, now)).not.toThrow();
    expect(service.verifyMuralWebhook(body, sign(timestamp, body), 'not-a-date', publicKeyPem, now)).toBe(false);
  });

  it('rejects a malformed signature', () => {
    expect(service.verifyMuralWebhook(body, 'not base64 der', timestamp, publicKeyPem, now)).toBe(false);
  });
});
