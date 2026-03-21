'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';

// This is a simplified delete. A real-world app would also delete user-generated content
// from Storage, and potentially other collections in Firestore.
export async function deleteUser(uid: string): Promise<{ success: boolean; message?: string }> {
  try {
    // 1. Delete user from Firebase Authentication
    await adminAuth.deleteUser(uid);

    // 2. Delete the user's document from the 'users' collection in Firestore
    await adminDb.collection('users').doc(uid).delete();
    
    // Note: This does not delete associated content like images or videos.
    // A more robust solution would use a Cloud Function triggered on user deletion.

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    // Provide a more specific error message if available
    let message = 'An unknown error occurred.';
    if (error.code === 'auth/user-not-found') {
        message = 'User not found. They may have already been deleted.';
    } else if (error.message) {
        message = error.message;
    }
    return { success: false, message: message };
  }
}
