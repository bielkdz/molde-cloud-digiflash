import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2PFuASnonx1ogQ9h0putv1LI2RNUjBJc",
  authDomain: "moldes-cloud-digiflash.firebaseapp.com",
  projectId: "moldes-cloud-digiflash",
  storageBucket: "moldes-cloud-digiflash.firebasestorage.app",
  messagingSenderId: "598592000237",
  appId: "1:598592000237:web:aa37bc5432a3bd07aabce4"
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = initializeAuth(firebaseApp, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });