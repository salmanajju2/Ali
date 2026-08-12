import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB4D2mhXwjEhBYspkNMDLepwCSgZi4uv7I",
  authDomain: "ali-enterprises-21c89.firebaseapp.com",
  projectId: "ali-enterprises-21c89",
  storageBucket: "ali-enterprises-21c89.firebasestorage.app",
  messagingSenderId: "664470964176",
  appId: "1:664470964176:web:38d291f3c729b19ebd9bd5",
  measurementId: "G-8DMZL9MZRB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getDatabase(app);
const firestore = getFirestore(app);

export { app, analytics, auth, db, firestore };
