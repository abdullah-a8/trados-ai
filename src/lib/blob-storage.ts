import { put, list, del } from '@vercel/blob';

/**
 * Upload file to Vercel Blob
 */
export async function uploadFile(
  file: File,
  options?: {
    addRandomSuffix?: boolean;
    cacheControlMaxAge?: number;
  }
) {
  try {
    const blob = await put(file.name, file, {
      access: 'public',
      addRandomSuffix: options?.addRandomSuffix ?? true,
      cacheControlMaxAge: options?.cacheControlMaxAge ?? 3600, // 1 hour
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Delete file from Vercel Blob
 */
export async function deleteFile(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

/**
 * List files (for admin or cleanup)
 */
export async function listFiles(limit?: number) {
  try {
    const { blobs } = await list({ limit });
    return blobs;
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

/**
 * Validate file type and size
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 5MB limit' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not supported. Allowed: JPEG, PNG, WebP, PDF' };
  }

  return { valid: true };
}
