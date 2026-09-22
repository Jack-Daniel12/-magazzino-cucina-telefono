// prodottiTelefono.js
// Equivalente di functions/src/prodottiTelefono.js, eseguito qui dentro
// alla pagina mobile (per l'invio) e dentro al programma PC (per la
// gestione della coda in attesa). Le regole di sicurezza controllano i
// permessi reali; questo file si occupa solo di "cosa scrivere/leggere".

import {
  collection,
  doc,
  setDoc,
  addDoc,
  writeBatch,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { codiceValidoEAttivo } from './licenze.js';
import { normalizzaCodice, timestampAIso, dataOdierna, dataInFuso } from './utils.js';

// Da chiamare una volta, dopo l'accesso anonimo del telefono, prima di
// inviare qualunque prodotto: registra (o aggiorna) il dispositivo nel
// registro anti-abuso globale. Se il dispositivo risulta sospeso lì,
// le regole rifiuteranno comunque la scrittura successiva — qui non
// serve controllarlo esplicitamente.
export async function registraDispositivoTelefono(db, uid) {
  await setDoc(
    doc(db, 'dispositiviTelefono', uid),
    { primoUtilizzo: serverTimestamp(), ultimoUtilizzo: serverTimestamp(), stato: 'attivo' },
    { merge: true }
  );
}

function erroreCodiceNonValido() {
  return { successo: false, errore: 'Codice azienda non valido. Reinserisci il codice nella pagina.', bloccato: true };
}

// ---------------- INVIO (pagina mobile) ----------------

export async function nuovoProdotto(db, codice, prodotto) {
  if (!(await codiceValidoEAttivo(db, codice))) return erroreCodiceNonValido();
  if (!prodotto.nome || !prodotto.quantita) return { successo: false, errore: 'Nome e quantità sono obbligatori.' };

  const ref = await addDoc(collection(db, 'aziende', normalizzaCodice(codice), 'codaTelefono'), {
    nome: prodotto.nome,
    quantita: Number(prodotto.quantita),
    unitaMisura: prodotto.unitaMisura || '',
    prezzoUnitario: prodotto.prezzoUnitario || '',
    nota: prodotto.nota || '',
    stato: 'in_attesa',
    tipo: prodotto.tipo === 'scarico' ? 'scarico' : 'carico',
    timestamp: serverTimestamp()
  });
  return { successo: true, id: ref.id };
}

// Invio a gruppi: una scrittura in blocco (batch) invece di tante
// singole — stesso vantaggio di velocità della versione precedente.
export async function nuoviProdottiMultipli(db, codice, prodotti) {
  if (!(await codiceValidoEAttivo(db, codice))) return erroreCodiceNonValido();

  const validi = (prodotti || []).filter((p) => p && p.nome && p.quantita);
  if (validi.length === 0) return { successo: false, errore: 'Nessun prodotto valido da inviare (nome e quantità sono obbligatori).' };

  const collezione = collection(db, 'aziende', normalizzaCodice(codice), 'codaTelefono');
  const batch = writeBatch(db);
  validi.forEach((p) => {
    batch.set(doc(collezione), {
      nome: p.nome,
      quantita: Number(p.quantita),
      unitaMisura: p.unitaMisura || '',
      prezzoUnitario: p.prezzoUnitario || '',
      nota: p.nota || '',
      stato: 'in_attesa',
      tipo: p.tipo === 'scarico' ? 'scarico' : 'carico',
      timestamp: serverTimestamp()
    });
  });
  await batch.commit();
  return { successo: true, numeroInviati: validi.length };
}

// ---------------- LETTURA/GESTIONE (programma PC) ----------------

export async function elencoProdottiInAttesa(db, codice) {
  const snap = await getDocs(query(collection(db, 'aziende', normalizzaCodice(codice), 'codaTelefono'), where('stato', '==', 'in_attesa')));
  return snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      timestamp: timestampAIso(v.timestamp),
      nome: v.nome,
      quantita: v.quantita,
      unitaMisura: v.unitaMisura,
      prezzoUnitario: v.prezzoUnitario,
      nota: v.nota,
      tipo: v.tipo === 'scarico' ? 'scarico' : 'carico'
    };
  });
}

async function segnaProdotti(db, codice, ids, nuovoStato) {
  const collezione = collection(db, 'aziende', normalizzaCodice(codice), 'codaTelefono');
  const batch = writeBatch(db);
  (ids || []).forEach((id) => batch.update(doc(collezione, id), { stato: nuovoStato }));
  await batch.commit();
}

export function confermaProdotti(db, codice, ids) {
  return segnaProdotti(db, codice, ids, 'importato');
}

export function rifiutaProdotti(db, codice, ids) {
  return segnaProdotti(db, codice, ids, 'rifiutato');
}

// Scheda "Oggi": ultime 500 righe, filtrate in memoria sul giorno
// corrente in fuso orario italiano — stessa scelta della versione a
// Cloud Functions (vedi il commento lì per il perché).
export async function elencoProdottiOggi(db, codice) {
  const snap = await getDocs(
    query(collection(db, 'aziende', normalizzaCodice(codice), 'codaTelefono'), orderBy('timestamp', 'desc'), limit(500))
  );
  const oggi = dataOdierna();
  return snap.docs
    .map((d) => d.data())
    .filter((v) => dataInFuso(v.timestamp) === oggi)
    .map((v) => ({
      nome: v.nome,
      quantita: v.quantita,
      unitaMisura: v.unitaMisura,
      prezzoUnitario: v.prezzoUnitario,
      nota: v.nota,
      stato: v.stato,
      timestamp: timestampAIso(v.timestamp),
      tipo: v.tipo === 'scarico' ? 'scarico' : 'carico'
    }));
}

// Scheda "Magazzino": legge solo prodotti (giacenza già "pronta" nei
// totali aggregati, vedi archivioCondiviso.js e docs/01-schema-dati-firestore.md).
export async function elencoGiacenzeAzienda(db, codice) {
  const snap = await getDocs(collection(db, 'aziende', normalizzaCodice(codice), 'prodotti'));
  return snap.docs
    .map((d) => {
      const v = d.data();
      const caricato = Number(v.totaleCaricato) || 0;
      const scaricato = Number(v.totaleScaricato) || 0;
      return { nome: v.nome, unitaMisura: v.unitaMisura, giacenza: Math.round((caricato - scaricato) * 100) / 100 };
    })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
}
