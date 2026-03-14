import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App;

if (!getApps().length) {
  // Trên Firebase App Hosting, service account được inject tự động.
  // Trên local dev, cần set GOOGLE_APPLICATION_CREDENTIALS env variable.
  adminApp = initializeApp({
    storageBucket: 'studio-5835932949-38ba9.firebasestorage.app',
  });
} else {
  adminApp = getApps()[0];
}

export const adminStorage = getStorage(adminApp);
export const adminFirestore = getFirestore(adminApp);
