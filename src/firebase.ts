import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2PFuASnonx1ogQ9h0putv1LI2RNUjBJc",
  authDomain: "moldes-cloud-digiflash.web.app",
  projectId: "moldes-cloud-digiflash",
  storageBucket: "moldes-cloud-digiflash.firebasestorage.app",
  messagingSenderId: "598592000237",
  appId: "1:598592000237:web:aa37bc5432a3bd07aabce4"
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
void setPersistence(auth, browserLocalPersistence);
