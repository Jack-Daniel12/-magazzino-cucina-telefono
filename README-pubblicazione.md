# Pubblicare questa pagina su GitHub Pages

Questa cartella contiene tutta la pagina "Nuovo Prodotto" come file veri e
separati (`index.html`, `style.css`, `app.js`, `config.js`, `manifest.json`,
`icon-192.png`, `icon-512.png`). Non serve più Google Apps Script per
generare l'HTML: qui è tutto statico.

## 1. Se non hai ancora un account GitHub

1. Vai su https://github.com/signup
2. Scegli un nome utente, email e password (è gratuito).
3. Conferma l'email che ti arriva.

## 2. Crea il repository

1. Una volta loggato, clicca il "+" in alto a destra → **New repository**.
2. Nome repository: quello che vuoi, ad es. `magazzino-cucina-telefono`.
3. Visibilità: **Public** va benissimo — questa cartella non contiene nessun
   dato sensibile (niente licenze, niente dati clienti: solo interfaccia).
4. Non aggiungere README/licenza automatici (non servono, li avremo già).
5. Clicca **Create repository**.

## 3. Carica questi file nel repository

Il modo più semplice se non hai mai usato Git da riga di comando:

1. Nella pagina del repository appena creato, clicca **uploading an existing
   file** (o **Add file → Upload files**).
2. Trascina dentro tutti i file di questa cartella (`index.html`, `style.css`,
   `app.js`, `config.js`, `manifest.json`, `icon-192.png`, `icon-512.png`).
3. Scrivi un messaggio di commit qualsiasi (es. "Prima versione pagina
   mobile") e clicca **Commit changes**.

## 4. Modifica config.js con l'indirizzo del tuo Apps Script

Prima o dopo il caricamento, apri `config.js` (anche direttamente su GitHub,
con la matita per modificare) e sostituisci il segnaposto con l'indirizzo
vero del tuo Apps Script (quello che finisce in `/exec`, lo stesso già
usato dal programma sul PC):

```js
var URL_SCRIPT = "https://script.google.com/macros/s/IL_TUO_ID/exec";
```

Salva il file (commit).

## 5. Attiva GitHub Pages

1. Nel repository, vai su **Settings** (in alto) → **Pages** (nel menu a
   sinistra).
2. Sotto "Build and deployment" → **Source**: scegli **Deploy from a
   branch**.
3. **Branch**: scegli `main`, cartella `/ (root)`. Clicca **Save**.
4. Aspetta un minuto: in cima alla stessa pagina apparirà l'indirizzo
   pubblico, del tipo:

   ```
   https://TUONOMEUTENTE.github.io/magazzino-cucina-telefono/
   ```

Quell'indirizzo è quello da usare come `urlPaginaTelefono` nel file
`licenza-config.json` del programma PC (vedi le note nella cartella
`app-desktop`), così il pulsante "Mostra QR code per il telefono"
punterà qui.

## 6. Come provare che funzioni

- Apri quell'indirizzo dal telefono (o dal computer): dovresti vedere la
  stessa identica pagina di oggi.
- Prova a inviare un prodotto di prova: se il telefono è già autorizzato
  (o se è la prima volta e viene autorizzato automaticamente), dovresti
  vedere "Prodotto inviato correttamente."
- Se vedi un errore di connessione, controlla di aver incollato
  correttamente l'URL in `config.js` (deve finire in `/exec`, senza spazi).

## Nota su come aggiornare la pagina in futuro

Ogni volta che vuoi modificare qualcosa (ad es. le dimensioni dei campi),
basta modificare i file direttamente su GitHub (o caricarne di nuovi con lo
stesso nome) — GitHub Pages si aggiorna da solo in 1-2 minuti, senza dover
toccare l'Apps Script.

## Sulle dimensioni/aspetto attuali

Questa prima versione riproduce **esattamente** l'interfaccia di oggi,
CSS incluso: non è stata cambiata nessuna dimensione. Le modifiche di
impaginazione (campi troppo piccoli/grandi, spaziature, ecc.) arriveranno
in un passaggio successivo, una volta chiarito insieme cosa esattamente
non ti convince — vedi il messaggio principale della consegna.
