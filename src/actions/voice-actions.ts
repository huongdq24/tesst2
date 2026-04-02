'use server';

import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';

export type VoiceRecord = {
  id: string;
  userId: string;
  text: string;
  voiceName: string;
  modelName: string;
  storageUrl: string;
  storagePath: string;
  createdAt: number;
};

/**
 * Parses a data URI (e.g., 'data:audio/wav;base64,UklGR...') into a Buffer.
 */
function parseDataUri(dataUri: string): { buffer: Buffer; mimeType: string } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

/**
 * Saves a generated voice (Data URI) to Firebase Storage and records it in Firestore.
 */
export async function saveGeneratedVoice(
  userId: string,
  dataUri: string,
  metadata: { text: string; voiceName: string; modelName: string }
): Promise<VoiceRecord> {
  if (!userId) throw new Error('User ID is required');

  const parsed = parseDataUri(dataUri);
  if (!parsed) throw new Error('Invalid Data URI format');

  const { buffer, mimeType } = parsed;
  const fileId = uuidv4();
  const extension = mimeType.split('/')[1] || 'wav';
  const storagePath = `users/${userId}/voices/${fileId}.${extension}`;

  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);

  // Upload the file buffer
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: {
        userId,
        voiceName: metadata.voiceName,
      },
    },
  });

  // Make the file publicly accessible (optional, but easier for the audio player)
  // Ensure Firebase Rules allow this or we use getSignedUrl.
  // Using makePublic ensures it can be played directly on the web app.
  await file.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  const recordId = uuidv4();
  const record: VoiceRecord = {
    id: recordId,
    userId,
    text: metadata.text,
    voiceName: metadata.voiceName,
    modelName: metadata.modelName,
    storageUrl: publicUrl,
    storagePath: storagePath,
    createdAt: Date.now(),
  };

  await adminDb
    .collection('users')
    .doc(userId)
    .collection('generatedVoices')
    .doc(recordId)
    .set(record);

  return record;
}

/**
 * Retrieves the history of generated voices for a user.
 */
export async function getVoiceHistory(userId: string, limitCount: number = 20): Promise<VoiceRecord[]> {
  if (!userId) return [];

  try {
    const snapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('generatedVoices')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => doc.data() as VoiceRecord);
  } catch (error) {
    console.error('Error fetching voice history:', error);
    return [];
  }
}

/**
 * Deletes a Voice record and its associated Storage file.
 */
export async function deleteVoiceRecord(userId: string, recordId: string, storagePath: string): Promise<void> {
  if (!userId || !recordId || !storagePath) throw new Error('Missing required fields for deletion');

  try {
    // Delete from Storage
    const bucket = adminStorage.bucket();
    await bucket.file(storagePath).delete().catch(err => {
      // Ignore Object Not Found if it's already deleted
      if (err.code !== 404) throw err;
    });

    // Delete from Firestore
    await adminDb
      .collection('users')
      .doc(userId)
      .collection('generatedVoices')
      .doc(recordId)
      .delete();
      
  } catch (error) {
    console.error('Error deleting voice record:', error);
    throw new Error('Could not delete the voice record');
  }
}
