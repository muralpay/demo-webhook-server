import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from './app.module';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
// Stored in .env with escaped newlines, as the README instructs.
const publicKeyEnv = publicKey.export({ type: 'spki', format: 'pem' }).toString().replace(/\n/g, '\\n');

const sign = (timestamp: string, body: string) =>
  crypto.sign('sha256', Buffer.from(`${timestamp}.${body}`), { key: privateKey, dsaEncoding: 'der' }).toString('base64');

const event = (eventId: string, attemptNumber = 0) => ({
  eventId,
  deliveryId: crypto.randomUUID(),
  attemptNumber,
  eventCategory: 'MURAL_ACCOUNT_BALANCE_ACTIVITY',
  occurredAt: new Date().toISOString(),
  payload: { type: 'account_credited', accountId: 'acc-1' },
});

describe('POST /test/webhook', () => {
  let app: INestApplication;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = publicKeyEnv;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  const post = (body: string, headers: Record<string, string>) =>
    request(app.getHttpServer()).post('/test/webhook').set('content-type', 'application/json').set(headers).send(body);

  const signedHeaders = (body: string, timestamp = new Date().toISOString()) => ({
    'x-mural-webhook-signature': sign(timestamp, body),
    'x-mural-webhook-timestamp': timestamp,
    'x-mural-webhook-signature-version': 'v0',
  });

  it('verifies against the raw bytes, not a re-serialized body', async () => {
    // Extra whitespace: JSON.stringify(req.body) would not reproduce these bytes.
    const body = JSON.stringify(event(crypto.randomUUID()), null, 2);
    await post(body, signedHeaders(body)).expect(200);
  });

  it('returns 401 for a bad signature and does not log the body', async () => {
    const body = JSON.stringify(event(crypto.randomUUID()));
    const headers = signedHeaders(body);
    await post(body.replace('acc-1', 'acc-2'), headers).expect(401);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('returns 401, not 500, for an unparseable timestamp', async () => {
    const body = JSON.stringify(event(crypto.randomUUID()));
    await post(body, { ...signedHeaders(body), 'x-mural-webhook-timestamp': 'garbage' }).expect(401);
  });

  it('returns 401 when signature headers are missing', async () => {
    await post(JSON.stringify(event(crypto.randomUUID())), {}).expect(401);
  });

  it('acknowledges a retried delivery of the same event without reprocessing it', async () => {
    const id = crypto.randomUUID();
    const first = JSON.stringify(event(id, 0));
    const retry = JSON.stringify(event(id, 1));
    await post(first, signedHeaders(first)).expect(200, { message: 'Webhook received and verified successfully' });
    await post(retry, signedHeaders(retry)).expect(200, { message: 'Duplicate event ignored' });
  });

  it('never logs the public key', async () => {
    const body = JSON.stringify(event(crypto.randomUUID()));
    await post(body, signedHeaders(body)).expect(200);
    const logged = logSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('BEGIN PUBLIC KEY');
  });
});
