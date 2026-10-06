// firebase-storage.js
import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { app, db } from './firebase-data.js';
import { getCurrentUser } from './firebase-auth.js';

const storage = getStorage(app);

// ========================================
// STORAGE PATH STRUCTURE
// ========================================
// /team-photos/{folder}/{timestamp}_{filename}
// Where folder = 'league', 'green', 'blue', 'gold', etc.
//
// /profile-photos/{userId}/{timestamp}.{ext}
// Separate folder for user profile photos (not visible in pictures.html)

// ========================================
// UPLOAD FUNCTIONS
// ========================================

/**
 * Upload a photo to Firebase Storage and save metadata to Firestore
 * @param {File} file - The image/video file to upload
 * @param {string} folder - The team/league folder ('league', 'green', 'blue', 'gold')
 * @param {string} caption - Display caption for the photo
 * @param {string} teamId - Optional team ID for team-specific photos
 * @returns {Promise<Object>} Result with success status and photo data
 */
export async function uploadPhoto(file, folder, caption, teamId = null) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error('User must be authenticated to upload photos');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/mov'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Allowed: JPG, PNG, GIF, WEBP, MP4, MOV');
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new Error('File size exceeds 50MB limit');
    }

    // Create storage reference with timestamp to prevent collisions
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `team-photos/${folder}/${timestamp}_${sanitizedFileName}`;
    const storageRef = ref(storage, storagePath);

    console.log('📤 Uploading file to:', storagePath);

    // Upload file
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: user.uid,
        uploadedByName: user.displayName || user.email,
        caption: caption,
        folder: folder
      }
    });

    console.log('✅ File uploaded successfully');

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    // Determine media type
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

    // Save metadata to Firestore
    const photoData = {
      name: caption,
      folder: folder,
      type: mediaType,
      url: downloadURL,
      storagePath: storagePath,
      fileName: sanitizedFileName,
      fileSize: file.size,
      mimeType: file.type,
      uploadedBy: user.uid,
      uploadedByName: user.displayName || user.email,
      teamId: teamId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'teamPhotos'), photoData);
    console.log('✅ Photo metadata saved to Firestore:', docRef.id);

    return {
      success: true,
      photoId: docRef.id,
      url: downloadURL,
      data: photoData
    };

  } catch (error) {
    console.error('❌ Error uploading photo:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Upload multiple photos at once
 * @param {FileList} files - Array of files to upload
 * @param {string} folder - The team/league folder
 * @param {string} defaultCaption - Default caption (will be numbered if multiple)
 * @param {string} teamId - Optional team ID
 * @returns {Promise<Object>} Results with array of successes and failures
 */
export async function uploadMultiplePhotos(files, folder, defaultCaption, teamId = null) {
  const results = {
    successful: [],
    failed: []
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const caption = files.length > 1 ? `${defaultCaption} ${i + 1}` : defaultCaption;
    
    const result = await uploadPhoto(file, folder, caption, teamId);
    
    if (result.success) {
      results.successful.push({
        fileName: file.name,
        photoId: result.photoId,
        url: result.url
      });
    } else {
      results.failed.push({
        fileName: file.name,
        error: result.error
      });
    }
  }

  return results;
}
// ========================================
// PLAYER PHOTO UPLOAD FUNCTIONS
// Add these to your firebase-storage.js file
// ========================================

/**
 * Upload a player photo to Firebase Storage
 * Stored in player-photos/{userId}/{timestamp}.{extension}
 * 
 * @param {File} file - The image file to upload
 * @param {string} userId - The user's document ID (who owns this player page)
 * @param {function} onProgress - Optional progress callback
 * @returns {Promise<{downloadURL: string, storagePath: string}>}
 */
export async function uploadPlayerPhoto(file, userId, onProgress) {
  const timestamp = Date.now();
  const extension = file.name.split('.').pop();
  const filename = `${timestamp}.${extension}`;
  const storagePath = `player-photos/${userId}/${filename}`;
  const storageRef = ref(storage, storagePath);
  
  const uploadTask = uploadBytesResumable(storageRef, file);
  
  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        console.error('❌ Player photo upload error:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('✅ Player photo uploaded to:', storagePath);
          resolve({ downloadURL, storagePath });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

/**
 * Delete an old player photo from Firebase Storage
 * 
 * @param {string} storagePath - The storage path of the photo to delete
 */
export async function deleteOldPlayerPhoto(storagePath) {
  if (!storagePath) return;
  
  const storageRef = ref(storage, storagePath);
  
  try {
    await deleteObject(storageRef);
    console.log('✅ Old player photo deleted:', storagePath);
  } catch (error) {
    // Don't throw - old photo may not exist
    console.warn('⚠️ Could not delete old player photo:', error.message);
  }
}


// ========================================
// FIREBASE STORAGE RULES UPDATE
// ========================================
// You'll also need to update your Firebase Storage rules to allow
// the player-photos path. Add this to your storage.rules:
//
//   match /player-photos/{userId}/{allPaths=**} {
//     // Allow read for everyone (photos are public)
//     allow read: if true;
//     
//     // Allow write only if user is authenticated and is either:
//     // 1. The owner of this folder (their own player photo)
//     // 2. An admin (can edit any player photo)
//     allow write: if request.auth != null && 
//       (request.auth.uid == userId || 
//        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.userRole == 'admin');
//   }





// ========================================
// PROFILE PHOTO FUNCTIONS
// ========================================

/**
 * Upload profile photo to Firebase Storage
 * Stores in a separate 'profile-photos' folder that won't appear in pictures.html
 * @param {File} file - Image file
 * @param {string} userId - User's UID
 * @param {Function} progressCallback - Optional callback for upload progress (0-100)
 * @returns {Promise<{downloadURL: string, storagePath: string}>}
 */
export async function uploadProfilePhoto(file, userId, progressCallback = null) {
  console.log(`📤 Uploading profile photo for user: ${userId}`);

  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed for profile photos');
  }

  // Validate file size (5MB limit for profile photos)
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    throw new Error('Profile photo must be less than 5MB');
  }

  // Create unique filename
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop();
  const storagePath = `profile-photos/${userId}/${timestamp}.${fileExtension}`;

  // Create storage reference
  const storageRef = ref(storage, storagePath);

  // Upload file with progress tracking
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Profile photo upload progress: ${progress.toFixed(1)}%`);
        
        if (progressCallback) {
          progressCallback(progress);
        }
      },
      (error) => {
        console.error('Profile photo upload error:', error);
        reject(error);
      },
      async () => {
        try {
          // Get download URL
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          console.log(`✅ Profile photo uploaded successfully`);
          
          resolve({
            downloadURL: downloadURL,
            storagePath: storagePath
          });
        } catch (error) {
          console.error('Error getting download URL:', error);
          reject(error);
        }
      }
    );
  });
}

/**
 * Delete old profile photo when uploading a new one
 * @param {string} oldStoragePath - Storage path of the old photo
 * @returns {Promise<void>}
 */
export async function deleteOldProfilePhoto(oldStoragePath) {
  if (!oldStoragePath) {
    console.log('No old profile photo to delete');
    return;
  }

  try {
    const storageRef = ref(storage, oldStoragePath);
    await deleteObject(storageRef);
    console.log('✅ Old profile photo deleted:', oldStoragePath);
  } catch (error) {
    // Don't throw error if file doesn't exist - it might have been deleted already
    if (error.code === 'storage/object-not-found') {
      console.log('Old profile photo already deleted or not found');
    } else {
      console.error('Error deleting old profile photo:', error);
      // Don't throw - continue anyway
    }
  }
}

// ========================================
// RETRIEVAL FUNCTIONS
// ========================================

/**
 * Get all photos from Firestore
 * @returns {Promise<Array>} Array of photo objects
 */
export async function getAllPhotos() {
  try {
    const q = query(collection(db, 'teamPhotos'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const photos = [];
    querySnapshot.forEach((doc) => {
      photos.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`✅ Retrieved ${photos.length} photos`);
    return photos;
  } catch (error) {
    console.error('❌ Error retrieving photos:', error);
    return [];
  }
}

/**
 * Get photos by folder (team or league)
 * @param {string} folder - The folder name ('league', 'green', 'blue', 'gold')
 * @returns {Promise<Array>} Array of photo objects
 */
export async function getPhotosByFolder(folder) {
  try {
    const q = query(
      collection(db, 'teamPhotos'),
      where('folder', '==', folder),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    const photos = [];
    querySnapshot.forEach((doc) => {
      photos.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`✅ Retrieved ${photos.length} photos for folder: ${folder}`);
    return photos;
  } catch (error) {
    console.error('❌ Error retrieving photos by folder:', error);
    return [];
  }
}

/**
 * Get photos by team ID
 * @param {string} teamId - The team ID
 * @returns {Promise<Array>} Array of photo objects
 */
export async function getPhotosByTeam(teamId) {
  try {
    const q = query(
      collection(db, 'teamPhotos'),
      where('teamId', '==', teamId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    const photos = [];
    querySnapshot.forEach((doc) => {
      photos.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`✅ Retrieved ${photos.length} photos for team: ${teamId}`);
    return photos;
  } catch (error) {
    console.error('❌ Error retrieving photos by team:', error);
    return [];
  }
}

// ========================================
// UPDATE FUNCTIONS
// ========================================

/**
 * Update photo caption
 * @param {string} photoId - The Firestore document ID
 * @param {string} newCaption - The new caption
 * @returns {Promise<Object>} Result with success status
 */
export async function updatePhotoCaption(photoId, newCaption) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error('User must be authenticated');
    }

    await updateDoc(doc(db, 'teamPhotos', photoId), {
      name: newCaption,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Photo caption updated:', photoId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating photo caption:', error);
    return { success: false, error: error.message };
  }
}

// ========================================
// DELETE FUNCTIONS
// ========================================

/**
 * Delete a photo from both Storage and Firestore
 * @param {string} photoId - The Firestore document ID
 * @param {string} storagePath - The Storage path
 * @returns {Promise<Object>} Result with success status
 */
export async function deletePhoto(photoId, storagePath) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error('User must be authenticated to delete photos');
    }

    // Delete from Storage
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
    console.log('✅ File deleted from Storage:', storagePath);

    // Delete from Firestore
    await deleteDoc(doc(db, 'teamPhotos', photoId));
    console.log('✅ Photo metadata deleted from Firestore:', photoId);

    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting photo:', error);
    return { success: false, error: error.message };
  }
}

// ========================================
// PERMISSION CHECKS
// ========================================

/**
 * Check if user can upload photos for a specific folder/team
 * @param {Object} userProfile - User profile from Firestore
 * @param {string} folder - The folder/team identifier
 * @returns {boolean} True if user has permission
 */
export function canUploadPhotos(userProfile, folder) {
  if (!userProfile) return false;

  // Admins can upload anywhere (add admin check when implemented)
  // For now, captains can upload to their team folder
  if (userProfile.isCaptain && userProfile.linkedTeam === folder) {
    return true;
  }

  // Anyone can upload to 'league' folder (adjust as needed)
  if (folder === 'league') {
    return true;
  }

  return false;
}

/**
 * Check if user can delete a specific photo
 * @param {Object} userProfile - User profile from Firestore
 * @param {Object} photo - The photo object
 * @returns {boolean} True if user has permission
 */
export function canDeletePhoto(userProfile, photo) {
  if (!userProfile || !photo) return false;

  // User can delete their own photos
  if (photo.uploadedBy === userProfile.uid) {
    return true;
  }

  // Captains can delete photos from their team folder
  if (userProfile.isCaptain && userProfile.linkedTeam === photo.folder) {
    return true;
  }

  // Admins can delete any photo (add admin check when implemented)
  // if (userProfile.role === 'admin') {
  //   return true;
  // }

  return false;
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get available folders for upload
 * @returns {Array} - Array of folder options
 */
export function getAvailableFolders() {
  return [
    { value: 'league', label: 'League Photos' },
    { value: 'green', label: 'Aces Green' },
    { value: 'blue', label: 'Aces Blue' },
    { value: 'orange', label: 'Aces Orange' },
    { value: 'purple', label: 'Aces Purple' },
    { value: 'red', label: 'Aces Red' },
    { value: 'yellow', label: 'Aces Yellow' },
    { value: 'black', label: 'Aces Black' },
    { value: 'white', label: 'Aces White' },
    { value: 'gold', label: 'Aces Gold' }
  ];
}

// ========================================
// CHAMPION PHOTO FUNCTIONS
// ========================================

/**
 * Get champion photo for a specific season
 * Looks for photos in teamPhotos collection with champs=true and matching seasonId
 * @param {string} seasonId - The season ID (e.g., "2025-fall")
 * @returns {Promise<Object|null>} Photo object if found, null otherwise
 */
export async function getChampionPhoto(seasonId) {
  try {
    const q = query(
      collection(db, 'teamPhotos'),
      where('champs', '==', true),
      where('seasonId', '==', seasonId)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log(`📷 No champion photo found for season: ${seasonId}`);
      return null;
    }

    // Return the first matching photo
    const docSnap = querySnapshot.docs[0];
    const photo = {
      id: docSnap.id,
      ...docSnap.data()
    };

    console.log(`✅ Champion photo found for season ${seasonId}:`, photo.name || photo.url);
    return photo;
  } catch (error) {
    console.error('❌ Error retrieving champion photo:', error);
    return null;
  }
}

/**
 * Get all champion photos (for history/gallery views)
 * @returns {Promise<Array>} Array of champion photo objects
 */
export async function getAllChampionPhotos() {
  try {
    const q = query(
      collection(db, 'teamPhotos'),
      where('champs', '==', true),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    const photos = [];
    querySnapshot.forEach((doc) => {
      photos.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`✅ Retrieved ${photos.length} champion photos`);
    return photos;
  } catch (error) {
    console.error('❌ Error retrieving champion photos:', error);
    return [];
  }
}

export { storage };
