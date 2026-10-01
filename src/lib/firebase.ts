import { initializeApp } from 'firebase/app';
import { getDatabase, ref } from 'firebase/database';
import { initializeFirestore, collection, setLogLevel } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

setLogLevel('silent');
import { getStorage } from 'firebase/storage';
import config from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || config.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || config.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || config.appId,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://sachin-electronics-default-rtdb.asia-southeast1.firebasedatabase.app",
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, import.meta.env.VITE_FIREBASE_DATABASE_ID || config.firestoreDatabaseId);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

export const productsCollection = collection(db, 'products');
export const complaintsCollection = collection(db, 'complaints');
export const settingsCollection = collection(db, 'settings');
export const inventoryCollection = collection(db, 'inventory');
export const techniciansCollection = collection(db, 'technicians');
export const promotionsCollection = collection(db, 'promotions');


export const technicianApplicationsCollection = collection(db, 'technicianApplications');

export const areaAdminsCollection = collection(db, 'areaAdmins');
export const loyaltyCollection = collection(db, 'loyalty');
export const ordersCollection = collection(db, 'orders');
export const leavesCollection = collection(db, 'leaves');
export const attendanceCollection = collection(db, 'attendance');