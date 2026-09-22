# Pubblicare la pagina "Nuovo Prodotto"

## 1. Configura Firebase

Apri `config.js` e incolla gli stessi valori `FIREBASE_CONFIG` già usati
in `pannello-amministrazione/config.js` (console Firebase →
Impostazioni progetto → "Le tue app").

## 2. Pubblica

Come per il pannello: repository GitHub **pubblico** va benissimo
(niente in `config.js` è un segreto).

1. Crea (o riusa) un repository.
2. Carica tutti i file di questa cartella: `index.html`, `style.css`,
   `app.js`, `config.js`, `manifest.json`, `icon-192.png`,
   `icon-512.png`, e l'intera cartella `lib/`.
3. Settings → Pages → Deploy from a branch → main → / (root) → Save.

## 3. Aggiungi l'icona alla Home del telefono

Chrome su Android: menu (⋮) → **Aggiungi a schermata Home**.

## Cosa è cambiato rispetto a prima

- Il telefono ora si autentica "in anonimo" con Firebase appena apre la
  pagina (invisibile per chi la usa: nessuna schermata di login in più,
  nessuna password da inserire — resta solo il codice azienda di
  sempre).
- Se l'azienda risulta sospesa o revocata, il segnale arriva come
  "accesso negato" da Firestore invece che come un campo `bloccato` nella
  risposta: il comportamento per chi usa la pagina (banner rosso, invio
  bloccato) è identico.
- Tutto il resto — entrata/uscita, invio a gruppi, suggerimento
  prodotti in modalità uscita, schede "Oggi"/"Magazzino", aggiornamento
  ogni minuto — funziona esattamente come prima.

## Sulla cartella `lib/`

Copia dei file di `client-condiviso/` nella cartella principale del
progetto, per lo stesso motivo spiegato nel README del pannello: questa
pagina vive nel suo repository a sé. Se cambi la logica condivisa,
ricordati di copiare di nuovo i file anche qui.
