// utils.js
// Stesse utilità della versione a Cloud Functions (vedi ../functions/src/utils.js
// per i commenti estesi, non ripetuti qui): normalizzazione codice/nome,
// arrotondamenti, conversioni di data. Qui usano l'SDK web di Firestore
// invece di quello Admin, ma le funzioni si comportano allo stesso modo.

import { Timestamp } from 'firebase/firestore';

export function normalizzaCodice(codice) {
  return String(codice || '').trim().toUpperCase();
}

export function normalizzaNome(nome) {
  return String(nome || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function timestampAIso(valore) {
  if (!valore) return null;
  if (typeof valore.toDate === 'function') return valore.toDate().toISOString();
  if (valore instanceof Date) return valore.toISOString();
  return String(valore);
}

export function isoATimestamp(valoreIso) {
  if (!valoreIso) return null;
  const d = new Date(valoreIso);
  if (isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

export function nuovoId() {
  return crypto.randomUUID(); // disponibile nativamente in browser ed Electron
}

const FUSO_ORARIO = 'Europe/Rome';

export function dataOdierna(fusoOrario) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoOrario || FUSO_ORARIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function dataInFuso(valoreTimestamp, fusoOrario) {
  const d = valoreTimestamp && typeof valoreTimestamp.toDate === 'function' ? valoreTimestamp.toDate() : new Date(valoreTimestamp);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoOrario || FUSO_ORARIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}
