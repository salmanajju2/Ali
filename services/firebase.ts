import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyB4D2mhXwjEhBYspkNMDLepwCSgZi4uv7I',
  authDomain: 'ali-enterprises-21c89.firebaseapp.com',
  databaseURL: 'https://ali-enterprises-21c89-default-rtdb.firebaseio.com',
  projectId: 'ali-enterprises-21c89',
  storageBucket: 'ali-enterprises-21c89.firebasestorage.app',
  messagingSenderId: '664470964176',
  appId: '1:664470964176:web:38d291f3c729b19ebd9bd5',
  measurementId: 'G-8DMZL9MZRB',
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Authentication only: all transaction records continue to use Aiven PostgreSQL
// through the Render API. Firebase Realtime Database and Storage are not used.
export const firebaseAuth = getAuth(firebaseApp);
