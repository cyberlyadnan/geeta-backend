import '../src/config/load-env.js';
import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID!.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET!.trim();
const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

const qrId = process.argv[2];
if (!qrId) {
  console.error('Usage: tsx scripts/fetch-qr-details.ts <qr_id>');
  process.exit(1);
}

try {
  const qr = await rzp.qrCode.fetch(qrId);
  console.log(JSON.stringify(qr, null, 2));
} catch (err) {
  console.error(JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
}
