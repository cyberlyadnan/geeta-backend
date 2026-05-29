/**
 * Run: npm run verify:razorpay
 * Confirms native UPI QR API works (not payment-link web URLs).
 */
import '../src/config/load-env.js';
import { razorpayService } from '../src/services/razorpay/razorpay.service.js';

const keyId = process.env.RAZORPAY_KEY_ID?.trim();

if (!keyId) {
  console.error('Missing RAZORPAY_KEY_ID in backend/.env');
  process.exit(1);
}

console.log('Key ID:', `${keyId.slice(0, 12)}...`);

try {
  const result = await razorpayService.createWalletRechargeCheckout({
    amountRupees: 100,
    referenceId: 'verify-script',
    description: 'UPI QR check',
    expiresAt: new Date(Date.now() + 20 * 60_000),
  });
  console.log('\nSuccess: native UPI QR');
  console.log('QR image URL:', result.qrImageUrl);
  if (/rzp\.io\/rzp\//i.test(result.qrImageUrl)) {
    console.error('\nWARNING: URL looks like a website link, not UPI QR image.');
    process.exit(1);
  }
} catch (err: unknown) {
  const e = err as { message?: string; code?: string };
  console.error('\nFailed:', e.message ?? err);
  if (e.code === 'UPI_QR_NOT_ENABLED') {
    console.error(`
Enable UPI QR on Razorpay:
  1. Dashboard → Support / Account & Settings
  2. Request "UPI QR Codes" activation (Test + Live)
  3. Retry: npm run verify:razorpay
`);
  }
  process.exit(1);
}
