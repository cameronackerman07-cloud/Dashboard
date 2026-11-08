// Prints a new VAPID key pair for push notifications. Run: npm run vapid
// Paste them into Vercel as VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. Never commit them.
import webpush from "web-push";
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
