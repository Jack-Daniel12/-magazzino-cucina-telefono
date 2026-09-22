// app.js — logica della pagina "Nuovo Prodotto"
import { initFirebase, accediAnonimo } from './lib/base.js';
import { verificaCodiceTelefono } from './lib/licenze.js';
import { registraDispositivoTelefono, nuoviProdottiMultipli, elencoProdottiOggi, elencoGiacenzeAzienda } from './lib/prodottiTelefono.js';

(function () {
  var firebase = initFirebase(FIREBASE_CONFIG);
  var db = firebase.db;
  var auth = firebase.auth;

  var ICONA_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICONA_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/></svg>';

  var INTERVALLO_AGGIORNAMENTO_MS = 60 * 1000; // ogni minuto, come richiesto

  // Prima di poter leggere o scrivere qualunque cosa su Firestore, il
  // telefono deve avere un accesso (anche anonimo): lo facciamo una
  // volta sola all'avvio, e ogni funzione che parla col database
  // aspetta questa stessa promessa prima di procedere — così non importa
  // se l'utente tocca "Conferma" prima che l'accesso sia finito di
  // configurarsi, non si perde nessuna interazione.
  var prontoAutenticazione = (async function () {
    await accediAnonimo(auth);
    // Registra questo telefono nel registro anti-abuso (vedi
    // prodottiTelefono.js): se fallisce non blocchiamo l'avvio della
    // pagina, verrà ritentato implicitamente al primo invio.
    try { await registraDispositivoTelefono(db, auth.currentUser.uid); } catch (e) {}
  })();

  // ---------------- CHIAMATE, CON RIPROVA AUTOMATICO ----------------
  // Stesso principio di prima (fino a 4 tentativi, pausa crescente), ma
  // ora avvolge le funzioni che parlano con Firestore invece di un
  // fetch verso Apps Script.
  var TENTATIVI_MASSIMI = 4;

  function attesa(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function conRiprova(funzione) {
    await prontoAutenticazione;
    var ultimoErrore;
    for (var tentativo = 1; tentativo <= TENTATIVI_MASSIMI; tentativo++) {
      try {
        return await funzione();
      } catch (err) {
        // Un rifiuto per permessi (azienda sospesa/revocata) non si
        // risolve riprovando: usciamo subito, il chiamante lo gestisce.
        if (err && err.code === 'permission-denied') throw err;
        ultimoErrore = err;
        if (tentativo < TENTATIVI_MASSIMI) await attesa(700 * tentativo);
      }
    }
    throw ultimoErrore;
  }

  // ---------------- FEEDBACK VISIVO "IN CORSO" ----------------
  function impostaCaricamento(bottone, testoInCorso) {
    if (!bottone.dataset.testoOriginale) bottone.dataset.testoOriginale = bottone.innerHTML;
    bottone.innerHTML = testoInCorso;
    bottone.disabled = true;
    bottone.classList.add('in-corso');
  }
  function rimuoviCaricamento(bottone) {
    if (bottone.dataset.testoOriginale) bottone.innerHTML = bottone.dataset.testoOriginale;
    bottone.disabled = false;
    bottone.classList.remove('in-corso');
  }

  function mostraOverlayCaricamento(testo) {
    document.getElementById('overlayCaricamentoTesto').textContent = testo || 'Attendere...';
    document.getElementById('overlayCaricamento').classList.remove('hidden');
  }
  function nascondiOverlayCaricamento() {
    document.getElementById('overlayCaricamento').classList.add('hidden');
  }

  var codiceAzienda = localStorage.getItem('codiceAzienda') || '';
  var bloccoAzienda = false;
  var batch = [];
  var modoCorrente = 'entrata';
  var prodottiMagazzinoConosciuti = []; // nomi, per il suggerimento e il controllo leggero sulle uscite
  var schedaCorrente = 'oggi';
  var intervalloAggiornamento = null;

  // ---------------- SELETTORE ENTRATA / USCITA ----------------

  function impostaModo(modo) {
    modoCorrente = modo;
    var eUscita = modo === 'uscita';

    document.getElementById('btnModoEntrata').classList.toggle('selezionata', !eUscita);
    document.getElementById('btnModoUscita').classList.toggle('selezionata', eUscita);

    document.getElementById('labelNome').textContent = eUscita ? 'Prodotto già in magazzino' : 'Nome prodotto';
    document.getElementById('nome').placeholder = eUscita ? 'Scrivi il nome esatto...' : 'es. Farina 00 kg 25';
    document.getElementById('spiegaNomeUscita').style.display = eUscita ? 'block' : 'none';
    document.getElementById('campoUnita').style.display = eUscita ? 'none' : '';
    if (!eUscita) nascondiAutocomplete();
    document.getElementById('campoPrezzo').style.display = eUscita ? 'none' : '';
    document.getElementById('testoBtnAggiungi').textContent = eUscita ? 'Segnala uscita' : 'Aggiungi alla lista';
  }

  document.getElementById('btnModoEntrata').addEventListener('click', function () { impostaModo('entrata'); });
  document.getElementById('btnModoUscita').addEventListener('click', function () { impostaModo('uscita'); });

  function escapeHtml(testo) {
    var div = document.createElement('div');
    div.textContent = String(testo == null ? '' : testo);
    return div.innerHTML;
  }

  function formattaOra(timestamp) {
    try {
      var d = new Date(timestamp);
      return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // Mostrato quando l'azienda risulta sospesa/revocata (Firestore
  // rifiuta con permission-denied) — distinto da un problema di rete,
  // che invece si risolve da solo riprovando più tardi. Non cancelliamo
  // il codice salvato: se l'azienda viene riattivata, basta ricaricare
  // la pagina, senza dover reinserire il codice da capo.
  function mostraBloccoAzienda(motivo) {
    bloccoAzienda = true;
    if (intervalloAggiornamento) { clearInterval(intervalloAggiornamento); intervalloAggiornamento = null; }
    var banner = document.getElementById('bannerBloccoAzienda');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'bannerBloccoAzienda';
      banner.className = 'banner-blocco';
      document.querySelector('.contenuto').prepend(banner);
    }
    banner.innerHTML = ICONA_ERR + (motivo || 'Questa azienda risulta sospesa. Contatta il fornitore.');
    document.getElementById('btnInviaTutti').disabled = true;
    document.getElementById('btnAggiungi').disabled = true;
    document.getElementById('btnRicarica').disabled = true;
  }

  // Annulla un blocco precedente (o non fa nulla se non eravamo bloccati:
  // è sicuro chiamarla sempre) — richiamata su ogni verifica del codice
  // riuscita, così un blocco non resta mai "per sempre" (bug corretto
  // nella versione precedente, vedi guida).
  function sbloccaAzienda() {
    bloccoAzienda = false;
    var banner = document.getElementById('bannerBloccoAzienda');
    if (banner) banner.remove();
    document.getElementById('btnAggiungi').disabled = false;
    document.getElementById('btnRicarica').disabled = false;
  }

  // ---------------- SCHERMATA CODICE AZIENDA ----------------

  function mostraOverlayCodice(mostra) {
    var overlay = document.getElementById('overlayCodice');
    if (mostra) overlay.classList.remove('nascosto');
    else overlay.classList.add('nascosto');
  }

  async function confermaCodice() {
    var valore = document.getElementById('inputCodice').value.trim();
    var esito = document.getElementById('esitoCodice');
    esito.className = 'esito';
    esito.innerHTML = '';

    if (!valore) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Scrivi il codice della tua azienda.';
      return;
    }

    var btn = document.getElementById('btnConfermaCodice');
    impostaCaricamento(btn, 'Verifica...');

    try {
      var d = await conRiprova(function () { return verificaCodiceTelefono(db, valore); });
      if (!d.successo) {
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + (d.errore || 'Codice non valido.');
        return;
      }

      sbloccaAzienda();

      if (codiceAzienda && codiceAzienda !== valore) {
        batch = [];
        renderBatch();
      }

      codiceAzienda = valore;
      localStorage.setItem('codiceAzienda', valore);
      document.getElementById('sottotitoloAzienda').textContent = d.cliente || 'Magazzino Cucina';
      document.getElementById('inputCodice').value = '';
      mostraOverlayCodice(false);
      avviaAggiornamentoPeriodico();
    } catch (e) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Impossibile contattare il server. Controlla la connessione e riprova.';
    } finally {
      rimuoviCaricamento(btn);
    }
  }

  document.getElementById('btnCambiaAzienda').addEventListener('click', function () {
    if (batch.length > 0) {
      var conferma = window.confirm(
        'Hai ' + batch.length + (batch.length === 1 ? ' prodotto' : ' prodotti') +
        ' non ancora inviato. Cambiando azienda andrà perso. Continuare?'
      );
      if (!conferma) return;
    }
    document.getElementById('inputCodice').value = '';
    document.getElementById('esitoCodice').className = 'esito';
    document.getElementById('esitoCodice').innerHTML = '';
    document.getElementById('btnAnnullaCodice').style.display = '';
    mostraOverlayCodice(true);
    document.getElementById('inputCodice').focus();
  });

  document.getElementById('btnAnnullaCodice').addEventListener('click', function () {
    mostraOverlayCodice(false);
  });

  document.getElementById('btnConfermaCodice').addEventListener('click', confermaCodice);
  document.getElementById('inputCodice').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confermaCodice();
  });

  // ---------------- AGGIUNTA ALLA LISTA "DA INVIARE" ----------------

  function renderBatch() {
    var el = document.getElementById('listaBatch');
    var titolo = document.getElementById('titoloBatch');
    var btnInvia = document.getElementById('btnInviaTutti');
    var testoBtn = document.getElementById('testoBtnInvia');

    titolo.textContent = 'Da inviare' + (batch.length ? ' (' + batch.length + ')' : '');
    if (!btnInvia.classList.contains('in-corso')) {
      testoBtn.textContent = 'Invia tutti' + (batch.length ? ' (' + batch.length + ')' : '');
      btnInvia.disabled = batch.length === 0 || bloccoAzienda;
    }

    if (batch.length === 0) {
      el.innerHTML = '<div class="batch-vuoto">Ancora nessun prodotto aggiunto.</div>';
      return;
    }
    el.innerHTML = batch.map(function (p, i) {
      var eUscita = p.tipo === 'uscita';
      var dettagli = escapeHtml(p.quantita) + ' ' + escapeHtml(p.unitaMisura || '') + (p.prezzoUnitario ? ' · € ' + escapeHtml(p.prezzoUnitario) : '');
      return '<div class="riga-batch">' +
        '<span class="tag-mini ' + (eUscita ? 'out' : 'in') + '">' + (eUscita ? '↑' : '↓') + '</span>' +
        '<div class="info"><div class="nome">' + escapeHtml(p.nome) + '</div><div class="dettaglio">' + dettagli + '</div></div>' +
        '<button class="rimuovi" data-rimuovi="' + i + '" ' + (bloccoAzienda ? 'disabled' : '') + '>✕</button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-rimuovi]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        batch.splice(Number(btn.dataset.rimuovi), 1);
        renderBatch();
      });
    });
  }

  document.getElementById('btnAggiungi').addEventListener('click', function () {
    var nome = document.getElementById('nome').value.trim();
    var quantita = document.getElementById('quantita').value;
    var esito = document.getElementById('esitoAggiungi');
    esito.className = 'esito';
    esito.innerHTML = '';

    if (!nome || !quantita) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Scrivi almeno nome e quantità.';
      return;
    }

    var eUscita = modoCorrente === 'uscita';

    if (eUscita && prodottiMagazzinoConosciuti.length > 0) {
      var trovato = prodottiMagazzinoConosciuti.some(function (n) { return n.toLowerCase() === nome.toLowerCase(); });
      if (!trovato) {
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + 'Non trovo un prodotto con questo nome esatto in magazzino. Controlla la scheda "Magazzino" qui sotto, o aggiungilo comunque se sei sicuro.';
      }
    }

    batch.push({
      nome: nome,
      tipo: eUscita ? 'uscita' : 'entrata',
      quantita: quantita,
      unitaMisura: eUscita ? '' : document.getElementById('unita').value.trim(),
      prezzoUnitario: eUscita ? '' : document.getElementById('prezzo').value,
      nota: document.getElementById('nota').value.trim()
    });

    ['nome', 'quantita', 'unita', 'prezzo', 'nota'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('nome').focus();
    renderBatch();
  });

  // ---------------- INVIO DI TUTTO IL GRUPPO ----------------

  document.getElementById('btnInviaTutti').addEventListener('click', async function () {
    if (batch.length === 0 || bloccoAzienda) return;

    var btn = document.getElementById('btnInviaTutti');
    var testoBtn = document.getElementById('testoBtnInvia');
    var esito = document.getElementById('esitoInvio');
    esito.className = 'esito';
    esito.innerHTML = '';

    testoBtn.textContent = 'Invio in corso...';
    btn.disabled = true;
    btn.classList.add('in-corso');
    mostraOverlayCaricamento('Invio in corso...');

    try {
      var d = await conRiprova(function () {
        return nuoviProdottiMultipli(db, codiceAzienda, batch.map(function (p) {
          return {
            nome: p.nome, quantita: p.quantita, unitaMisura: p.unitaMisura,
            prezzoUnitario: p.prezzoUnitario || '', nota: p.nota,
            tipo: p.tipo === 'uscita' ? 'scarico' : 'carico'
          };
        }));
      });

      if (d.successo) {
        var n = batch.length;
        batch = [];
        esito.className = 'esito ok';
        esito.innerHTML = ICONA_OK + n + (n === 1 ? ' prodotto inviato.' : ' prodotti inviati insieme.');
        caricaProdottiOggi();
      } else {
        if (d.bloccato) { mostraBloccoAzienda(d.errore); return; }
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + (d.errore || 'Errore di invio dei dati.');
      }
    } catch (e) {
      if (e && e.code === 'permission-denied') {
        mostraBloccoAzienda('Questa azienda risulta sospesa o revocata. Contatta il fornitore.');
      } else {
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + 'Impossibile contattare il server dopo vari tentativi. Controlla la connessione e riprova.';
      }
    } finally {
      btn.classList.remove('in-corso');
      nascondiOverlayCaricamento();
      renderBatch();
    }
  });

  // ---------------- SCHEDE "OGGI" / "MAGAZZINO" ----------------

  document.querySelectorAll('.scheda-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.scheda-btn').forEach(function (b) { b.classList.remove('selezionata'); });
      btn.classList.add('selezionata');
      schedaCorrente = btn.dataset.scheda;
      document.getElementById('listaOggi').style.display = schedaCorrente === 'oggi' ? 'block' : 'none';
      document.getElementById('listaGiacenze').style.display = schedaCorrente === 'magazzino' ? 'block' : 'none';
    });
  });

  function caricaProdottiOggi() {
    if (!codiceAzienda || bloccoAzienda) return;
    var contenitore = document.getElementById('listaOggi');
    conRiprova(function () { return elencoProdottiOggi(db, codiceAzienda); }).then(function (prodotti) {
      if (!prodotti || prodotti.length === 0) {
        contenitore.innerHTML = '<div class="lista-vuota">Ancora nessun prodotto inserito oggi.</div>';
        return;
      }
      contenitore.innerHTML = prodotti.map(function (p) {
        var etichettaStato = p.stato === 'rifiutato' ? ' (scartato)' : (p.stato === 'importato' ? ' ✓' : '');
        var eUscita = p.tipo === 'scarico';
        return '<div class="riga-elenco stato-' + escapeHtml(p.stato) + '">' +
          '<span class="tag-mini ' + (eUscita ? 'out' : 'in') + '">' + (eUscita ? '↑' : '↓') + '</span>' +
          '<span class="nome-prodotto">' + escapeHtml(p.nome) + '</span>' +
          '<span class="dettaglio-prodotto">' + escapeHtml(p.quantita) + ' ' + escapeHtml(p.unitaMisura || '') + ' · ' + formattaOra(p.timestamp) + etichettaStato + '</span>' +
          '</div>';
      }).join('');
    }).catch(function (e) {
      if (e && e.code === 'permission-denied') { mostraBloccoAzienda('Questa azienda risulta sospesa o revocata. Contatta il fornitore.'); return; }
      contenitore.innerHTML = '<div class="lista-vuota">Impossibile caricare l\'elenco dopo vari tentativi (controlla la connessione).</div>';
    });
  }

  function mostraAutocomplete(testoRicerca) {
    var lista = document.getElementById('autocompleteLista');
    var testo = (testoRicerca || '').trim().toLowerCase();
    var risultati = prodottiMagazzinoConosciuti.filter(function (nome) {
      return !testo || nome.toLowerCase().indexOf(testo) !== -1;
    }).slice(0, 12);

    if (risultati.length === 0) {
      lista.innerHTML = '<div class="autocomplete-vuoto">' +
        (prodottiMagazzinoConosciuti.length === 0
          ? 'Elenco magazzino non ancora disponibile, un momento...'
          : 'Nessun prodotto trovato con questo nome.') +
        '</div>';
    } else {
      lista.innerHTML = risultati.map(function (nome) {
        return '<div class="autocomplete-voce" data-nome="' + escapeHtml(nome) + '">' + evidenziaTesto(nome, testo) + '</div>';
      }).join('');
    }
    lista.classList.add('visibile');
  }

  function nascondiAutocomplete() {
    document.getElementById('autocompleteLista').classList.remove('visibile');
  }

  function evidenziaTesto(nome, testo) {
    if (!testo) return escapeHtml(nome);
    var indice = nome.toLowerCase().indexOf(testo);
    if (indice === -1) return escapeHtml(nome);
    return escapeHtml(nome.slice(0, indice)) +
      '<mark>' + escapeHtml(nome.slice(indice, indice + testo.length)) + '</mark>' +
      escapeHtml(nome.slice(indice + testo.length));
  }

  function aggiornaSuggerimentiProdotti() {
    var lista = document.getElementById('autocompleteLista');
    if (modoCorrente === 'uscita' && lista.classList.contains('visibile')) {
      mostraAutocomplete(document.getElementById('nome').value);
    }
  }

  var campoNome = document.getElementById('nome');

  campoNome.addEventListener('input', function () {
    if (modoCorrente !== 'uscita') return;
    mostraAutocomplete(campoNome.value);
  });

  campoNome.addEventListener('focus', function () {
    if (modoCorrente !== 'uscita') return;
    mostraAutocomplete(campoNome.value);
  });

  campoNome.addEventListener('blur', function () {
    setTimeout(function () {
      if (document.activeElement !== campoNome) nascondiAutocomplete();
    }, 200);
  });

  document.getElementById('autocompleteLista').addEventListener('click', function (e) {
    var voce = e.target.closest('.autocomplete-voce');
    if (!voce || !voce.dataset.nome) return;
    campoNome.value = voce.dataset.nome;
    nascondiAutocomplete();
    document.getElementById('quantita').focus();
  });

  function caricaGiacenzeAzienda() {
    if (!codiceAzienda || bloccoAzienda) return;
    var contenitore = document.getElementById('listaGiacenze');
    conRiprova(function () { return elencoGiacenzeAzienda(db, codiceAzienda); }).then(function (prodotti) {
      if (!prodotti || prodotti.length === 0) {
        contenitore.innerHTML = '<div class="lista-vuota">Nessun dato disponibile ancora.</div>';
        prodottiMagazzinoConosciuti = [];
        aggiornaSuggerimentiProdotti();
        return;
      }
      prodottiMagazzinoConosciuti = prodotti.map(function (p) { return p.nome; });
      aggiornaSuggerimentiProdotti();
      contenitore.innerHTML = prodotti.map(function (p) {
        return '<div class="riga-elenco">' +
          '<span class="nome-prodotto">' + escapeHtml(p.nome) + '</span>' +
          '<span class="dettaglio-prodotto">' + escapeHtml(p.giacenza) + ' ' + escapeHtml(p.unitaMisura || '') + '</span>' +
          '</div>';
      }).join('');
    }).catch(function (e) {
      if (e && e.code === 'permission-denied') { mostraBloccoAzienda('Questa azienda risulta sospesa o revocata. Contatta il fornitore.'); return; }
      contenitore.innerHTML = '<div class="lista-vuota">Impossibile caricare l\'elenco dopo vari tentativi (controlla la connessione).</div>';
    });
  }

  function aggiornaListe() {
    if (bloccoAzienda) return;
    caricaProdottiOggi();
    caricaGiacenzeAzienda();
    document.getElementById('testoAggiornato').textContent =
      'Aggiornato alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  document.getElementById('btnRicarica').addEventListener('click', aggiornaListe);

  function avviaAggiornamentoPeriodico() {
    aggiornaListe();
    if (intervalloAggiornamento) clearInterval(intervalloAggiornamento);
    intervalloAggiornamento = setInterval(aggiornaListe, INTERVALLO_AGGIORNAMENTO_MS);
  }

  // ---------------- AVVIO ----------------

  if (codiceAzienda) {
    mostraOverlayCodice(false);
    avviaAggiornamentoPeriodico();
  } else {
    mostraOverlayCodice(true);
  }

  renderBatch();
})();
