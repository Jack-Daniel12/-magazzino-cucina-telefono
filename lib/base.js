// base.js
// Inizializzazione condivisa (app Firebase, Firestore, Auth) e le tre
// modalità di accesso usate in questo progetto. Ogni programma (PC,
// telefono, pannello) chiama initMagazzino(config) una volta all'avvio.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

export function initFirebase(firebaseConfig) {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { app, db: getFirestore(app), auth: getAuth(app) };
}

// Usata da PC e telefono: ogni dispositivo ottiene un identificativo
// stabile (auth.currentUser.uid), che Firebase ricorda da solo tra un
// riavvio e l'altro (persistenza locale), esattamente come oggi il PC
// ricorda il proprio idDispositivo in licenza.json.
export async function accediAnonimo(auth) {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// Da chiamare all'avvio, PRIMA di leggere auth.currentUser: Firebase
// ripristina la sessione salvata in modo asincrono, quindi subito dopo
// initFirebase() currentUser potrebbe ancora essere null anche se il
// dispositivo aveva già effettuato l'accesso anonimo in passato.
export function attendiSessioneRipristinata(auth) {
  return new Promise((resolve) => {
    const smetti = onAuthStateChanged(auth, (utente) => {
      smetti();
      resolve(utente); // può essere null: vuol dire "nessuna sessione precedente"
    });
  });
}

// Usata solo dal pannello di amministrazione (vedi
// strumenti/imposta-admin.js per come si crea l'account la prima volta).
export async function adminLogin(auth, email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export function adminLogout(auth) {
  return signOut(auth);
}
