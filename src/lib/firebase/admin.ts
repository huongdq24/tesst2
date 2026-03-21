import admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors
if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
        projectId: process.env.FIREBASE_PROJECT_ID || 'studio-5835932949-38ba9',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'studio-5835932949-38ba9.firebasestorage.app',
      });
    } else {
      // Fallback: initializeApp() will use GOOGLE_APPLICATION_CREDENTIALS environment variable
      // or the default service account in a GCP environment like Cloud Run / App Hosting.
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'studio-5835932949-38ba9',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'studio-5835932949-38ba9.firebasestorage.app',
      });
    }
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
export const adminStorage = admin.storage();

export default admin;
