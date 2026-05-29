/**
 * Run: npm run verify:razorpay
 * Confirms native UPI QR API works with current .env keys.
 */
import '../src/config/load-env.js';
import { razorpayService } from '../src/services/razorpay/razorpay.service.js';
import { getRazorpayKeyMode } from '../src/services/razorpay/razorpay.errors.js';

const keyId = process.env.RAZORPAY_KEY_ID?.trim();

if (!keyId) {
  console.error('Missing RAZORPAY_KEY_ID in backend/.env');
  process.exit(1);
}

const keyMode = getRazorpayKeyMode(keyId);
console.log('Key mode:', keyMode.toUpperCase());
console.log('Key ID:', `${keyId.slice(0, 16)}...`);

try {
  const result = await razorpayService.createWalletRechargeCheckout({
    amountRupees: 100,
    referenceId: `verify-${Date.now()}`,
    description: 'UPI QR verification',
    expiresAt: new Date(Date.now() + 20 * 60_000),
  });

  console.log('\n✓ Success: Dynamic UPI QR created');
  console.log('  QR ID:      ', result.razorpayId);
  console.log('  Image URL:  ', result.qrImageUrl);
  console.log('  Expires at: ', result.expiresAt.toISOString());
  console.log('\nUse this URL as <img src="..."> — it serves a PNG QR image.');
  console.log('Webhook events required: payment.captured, qr_code.credited, payment.failed, qr_code.closed');
} catch (err: unknown) {
  const e = err as {
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  console.error('\n✗ Failed:', e.message ?? err);
  if (e.code) console.error('  Code:', e.code);
  if (e.details) {
    console.error('  Razorpay details:', JSON.stringify(e.details, null, 2));
  }
  if (e.code === 'UPI_QR_NOT_ENABLED' || e.code === 'UPI_QR_INVALID_URL') {
    console.error(`
Enable UPI QR on Razorpay (${keyMode} mode):
  1. Dashboard → Support / Payment Methods
  2. Request "UPI QR Codes" activation
  3. Retry: npm run verify:razorpay
`);
  }
  if (e.code === 'RAZORPAY_AUTH_FAILED') {
    console.error(`
Auth failed — regenerate API keys in Razorpay Dashboard (${keyMode} mode)
and update RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in backend/.env
`);
  }
  process.exit(1);
}
