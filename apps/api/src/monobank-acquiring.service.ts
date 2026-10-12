import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadBackendRuntimeEnv } from '@booking/config';
import { z } from 'zod';

const invoiceResponseSchema = z.object({ invoiceId: z.string().min(1), pageUrl: z.string().url() });
const publicKeyResponseSchema = z.object({ key: z.string().min(1) });

@Injectable()
export class MonobankAcquiringService {
  private publicKey?: KeyObject;

  private environment() {
    const environment = loadBackendRuntimeEnv(process.env);
    if (!environment.MONOBANK_ACQUIRING_TOKEN) throw new ServiceUnavailableException('Monobank acquiring is not configured');
    return { token: environment.MONOBANK_ACQUIRING_TOKEN, siteUrl: environment.PUBLIC_SITE_URL };
  }

  async createInvoice(input: { reservationId: string; returnUrl: string }): Promise<{ invoiceId: string; paymentUrl: string }> {
    const { token, siteUrl } = this.environment();
    const response = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': token },
      body: JSON.stringify({
        amount: 50_000,
        ccy: 980,
        merchantPaymInfo: { reference: input.reservationId, destination: 'Передоплата за запис на масаж', comment: 'Передоплата 500 грн' },
        redirectUrl: input.returnUrl,
        webHookUrl: `${siteUrl}/api/public/booking/monobank-webhook`,
        validity: 900,
        paymentType: 'debit',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new ServiceUnavailableException('Monobank invoice creation failed');
    const invoice = invoiceResponseSchema.parse(await response.json());
    if (!invoice.pageUrl.startsWith('https://')) throw new ServiceUnavailableException('Monobank returned an invalid payment URL');
    return { invoiceId: invoice.invoiceId, paymentUrl: invoice.pageUrl };
  }

  async verifyWebhook(rawBody: Buffer, signature: string | undefined): Promise<boolean> {
    if (!signature || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
    const signatureBytes = Buffer.from(signature, 'base64');
    if (!signatureBytes.length) return false;
    try {
      let key = await this.getWebhookKey();
      if (verify('sha256', rawBody, key, signatureBytes)) return true;
      this.publicKey = undefined;
      key = await this.getWebhookKey();
      return verify('sha256', rawBody, key, signatureBytes);
    } catch {
      return false;
    }
  }

  private async getWebhookKey(): Promise<KeyObject> {
    if (this.publicKey) return this.publicKey;
    const { token } = this.environment();
    const response = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
      headers: { 'X-Token': token },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Monobank public key is unavailable');
    const { key } = publicKeyResponseSchema.parse(await response.json());
    this.publicKey = createPublicKey(Buffer.from(key, 'base64'));
    return this.publicKey;
  }
}
