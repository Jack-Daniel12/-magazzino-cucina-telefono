// licenze.js
// Equivalente della vecchia functions/src/licenze.js, ma eseguito dentro
// al programma PC stesso: qui NON c'è più un server fidato che decide,
// quindi il controllo vero avviene nelle regole di sicurezza
// (firestore.rules) — questo codice prova a fare l'operazione e traduce
// un eventuale rifiuto in un messaggio comprensibile, oltre a fare i
// controlli che si possono già fare leggendo solamente il documento
// (scadenza, stato) per dare un messaggio preciso senza dover aspettare
// il rifiuto della scrittura.

import { doc, getDoc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { normalizzaCodice } from './utils.js';

function aziendaAttivaESincronizzabile(azienda) {
  return !!azienda && azienda.stato === 'attivo' && azienda.sincronizzazioneAbilitata !== false;
}

export function aziendaRef(db, codice) {
  return doc(db, 'aziende', normalizzaCodice(codice));
}

// Usata dal programma PC ad ogni avvio e ad ogni sincronizzazione
// (stesso ruolo di verificaLicenza in Apps Script / nella versione a
// Cloud Functions). idDispositivo è l'id generato la prima volta da
// lib/licenza.js lato PC — NON l'uid Firebase: per la registrazione qui
// sotto va usato invece l'uid dell'accesso anonimo (vedi Passo 6, dove
// questo si collega al resto del programma).
export async function verificaLicenza(db, codice, idDispositivo) {
  if (!codice) return { valido: false, motivo: 'Codice mancante.' };

  const ref = aziendaRef(db, codice);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { valido: false, motivo: 'Codice non riconosciuto.' };

  const azienda = snap.data();
  if (!aziendaAttivaESincronizzabile(azienda)) {
    return { valido: false, motivo: azienda.motivo || 'Accesso non autorizzato per questo codice.', bloccato: true };
  }
  if (azienda.scadenza) {
    const scad = new Date(azienda.scadenza);
    if (!isNaN(scad.getTime()) && scad.getTime() < Date.now()) {
      return { valido: false, motivo: 'Licenza scaduta.', bloccato: true };
    }
  }

  if (idDispositivo) {
    const dispositivoRef = doc(db, 'aziende', normalizzaCodice(codice), 'dispositivi', idDispositivo);
    try {
      await runTransaction(db, async (tx) => {
        const dispSnap = await tx.get(dispositivoRef);
        if (dispSnap.exists()) {
          tx.update(dispositivoRef, { ultimoUtilizzo: serverTimestamp() });
          return;
        }
        tx.set(dispositivoRef, {
          idDispositivo,
          tipo: 'pc',
          primoUtilizzo: serverTimestamp(),
          ultimoUtilizzo: serverTimestamp()
        });
        tx.update(ref, { numeroDispositivi: increment(1), modificatoIl: serverTimestamp() });
      });
    } catch (err) {
      if (err.code === 'permission-denied') {
        return {
          valido: false,
          motivo:
            'Limite di dispositivi raggiunto per questo codice' +
            (azienda.limiteDispositivi ? ' (' + azienda.limiteDispositivi + ')' : '') +
            '. Contatta il fornitore.',
          bloccato: true
        };
      }
      throw err;
    }
  }

  return { valido: true, cliente: azienda.cliente || '', scadenza: azienda.scadenza || null };
}

// Usata dalla pagina mobile quando l'utente inserisce/cambia il codice.
export async function verificaCodiceTelefono(db, codice) {
  if (!codice) return { successo: false, errore: 'Codice mancante.' };

  const snap = await getDoc(aziendaRef(db, codice));
  if (!snap.exists()) {
    return { successo: false, errore: 'Codice non riconosciuto. Controlla di averlo scritto giusto.' };
  }
  const azienda = snap.data();
  if (!aziendaAttivaESincronizzabile(azienda)) {
    return {
      successo: false,
      errore: azienda.motivo ? 'Azienda sospesa: ' + azienda.motivo : 'Questa azienda risulta sospesa o revocata. Contatta il fornitore.',
      bloccato: true
    };
  }
  return { successo: true, cliente: azienda.cliente || '' };
}

export async function codiceValidoEAttivo(db, codice) {
  if (!codice) return false;
  const snap = await getDoc(aziendaRef(db, codice));
  return snap.exists() && aziendaAttivaESincronizzabile(snap.data());
}
