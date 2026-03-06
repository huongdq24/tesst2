'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBhEmODPzTASWIw5nP68AWaKAueiP8g-9c",
  authDomain: "studio-5835932949-38ba9.firebaseapp.com",
  projectId: "studio-5835932949-38ba9",
  storageBucket: "studio-5835932949-38ba9.appspot.com",
  messagingSenderId: "732004220860",
  appId: "1:732004220860:web:5dee1a1aeed6714184f5b9",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

export { app, auth, firestore, storage };
