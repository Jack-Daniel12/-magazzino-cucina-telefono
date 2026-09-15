// app.js — logica della pagina "Nuovo Prodotto"
(function () {
  var ICONA_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICONA_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/></svg>';

  function ottieniIdDispositivo() {
    var id = localStorage.getItem('idDispositivo');
    if (id) return id;
    id = '';
    for (var i = 0; i < 20; i++) id += Math.floor(Math.random() * 10);
    localStorage.setItem('idDispositivo', id);
    return id;
  }

  // ---------------- CHIAMATA AL SERVER, CON RIPROVA AUTOMATICO ----------------
  // Stessa logica già usata nel programma PC e nel pannello di
  // amministrazione: fino a 4 tentativi in background, con una pausa
  // crescente, prima di arrendersi — Apps Script può metterci qualche
  // secondo a "svegliarsi" se non viene chiamato da un po'.
  var TENTATIVI_MASSIMI = 4;
  var TIMEOUT_MS = 15000;

  function attesa(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function chiamaServerUnaVolta(azione, corpo) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(URL_SCRIPT + '?azione=' + encodeURIComponent(azione), {
      method: 'POST',
      signal: controller.signal,
      // Content-Type "text/plain" (non "application/json") per evitare la
      // richiesta preflight OPTIONS, che Apps Script gestisce male: pagina
      // e Apps Script vivono su domini diversi, quindi è una richiesta
      // davvero cross-origin. Non cambiare, anche se sembra "più corretto"
      // usare application/json.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('Il server ha risposto con errore HTTP ' + r.status);
      return r.json();
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  async function chiamaServer(azione, corpo) {
    var ultimoErrore;
    for (var tentativo = 1; tentativo <= TENTATIVI_MASSIMI; tentativo++) {
      try {
        return await chiamaServerUnaVolta(azione, corpo);
      } catch (err) {
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

  var idDispositivo = ottieniIdDispositivo();
  var codiceAzienda = localStorage.getItem('codiceAzienda') || '';
  var bloccoAzienda = false;

  function escapeHtml(testo) {
    var div = document.createElement('div');
    div.textContent = String(testo == null ? '' : testo);
    return div.innerHTML;
  }

  // Mostrato quando il server risponde con bloccato:true (azienda
  // sospesa/revocata dal fornitore) — distinto da un problema di rete,
  // che invece si risolve da solo riprovando più tardi. Non cancelliamo
  // il codice salvato: se l'azienda viene riattivata, basta ricaricare la
  // pagina, senza dover reinserire il codice da capo.
  function mostraBloccoAzienda(motivo) {
    bloccoAzienda = true;
    var banner = document.getElementById('bannerBloccoAzienda');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'bannerBloccoAzienda';
      banner.className = 'banner-blocco';
      document.querySelector('.contenuto').prepend(banner);
    }
    banner.innerHTML = ICONA_ERR + (motivo || 'Questa azienda risulta sospesa. Contatta il fornitore.');
    document.getElementById('btnInvia').disabled = true;
  }

  function formattaOra(timestamp) {
    try {
      var d = new Date(timestamp);
      return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // ---------------- SCHERMATA CODICE AZIENDA (una tantum) ----------------

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
      var d = await chiamaServer('verificaCodiceTelefono', { codice: valore });
      if (!d.successo) {
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + (d.errore || 'Codice non valido.');
        return;
      }
      codiceAzienda = valore;
      localStorage.setItem('codiceAzienda', valore);
      document.getElementById('sottotitoloAzienda').textContent = d.cliente || 'Magazzino Cucina';
      mostraOverlayCodice(false);
      caricaProdottiOggi();
      caricaGiacenzeAzienda();
    } catch (e) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Impossibile contattare il server. Controlla la connessione e riprova.';
    } finally {
      rimuoviCaricamento(btn);
    }
  }

  document.getElementById('btnConfermaCodice').addEventListener('click', confermaCodice);
  document.getElementById('inputCodice').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confermaCodice();
  });

  // ---------------- INVIO NUOVO PRODOTTO ----------------

  document.getElementById('btnInvia').addEventListener('click', async function () {
    var nome = document.getElementById('nome').value.trim();
    var quantita = document.getElementById('quantita').value;
    var unita = document.getElementById('unita').value.trim();
    var prezzo = document.getElementById('prezzo').value;
    var nota = document.getElementById('nota').value.trim();
    var esito = document.getElementById('esito');
    esito.className = 'esito';
    esito.innerHTML = '';

    if (!nome || !quantita) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Scrivi almeno nome e quantita.';
      return;
    }

    var btn = document.getElementById('btnInvia');
    impostaCaricamento(btn, 'Invio in corso...');

    try {
      var d = await chiamaServer('nuovoProdotto', {
        nome: nome, quantita: quantita, unitaMisura: unita, prezzoUnitario: prezzo || '',
        nota: nota, idDispositivo: idDispositivo, codice: codiceAzienda
      });
      if (d.successo) {
        esito.className = 'esito ok';
        esito.innerHTML = ICONA_OK + 'Prodotto inviato correttamente.';
        document.getElementById('nome').value = '';
        document.getElementById('quantita').value = '';
        document.getElementById('unita').value = '';
        document.getElementById('prezzo').value = '';
        document.getElementById('nota').value = '';
        document.getElementById('nome').focus();
        caricaProdottiOggi();
      } else {
        if (d.bloccato) { mostraBloccoAzienda(d.errore); return; }
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + (d.errore || 'Errore di invio dei dati.');
      }
    } catch (e) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Impossibile contattare il server dopo vari tentativi. Controlla la connessione e riprova.';
    } finally {
      rimuoviCaricamento(btn);
    }
  });

  // ---------------- LISTA "INSERITI OGGI" ----------------

  function caricaProdottiOggi() {
    if (!codiceAzienda || bloccoAzienda) return;
    var contenitore = document.getElementById('listaOggi');
    contenitore.innerHTML = '<div class="lista-vuota">Caricamento...</div>';
    chiamaServer('elencoProdottiOggi', { codice: codiceAzienda }).then(function (d) {
      if (d.bloccato) { mostraBloccoAzienda(d.errore); return; }
      if (!d.successo || !d.prodotti || d.prodotti.length === 0) {
        contenitore.innerHTML = '<div class="lista-vuota">Ancora nessun prodotto inserito oggi.</div>';
        return;
      }
      contenitore.innerHTML = d.prodotti.map(function (p) {
        var etichettaStato = p.stato === 'rifiutato' ? ' (scartato)' : (p.stato === 'importato' ? ' ✓' : '');
        return '<div class="riga-elenco stato-' + escapeHtml(p.stato) + '">' +
          '<span class="nome-prodotto">' + escapeHtml(p.nome) + '</span>' +
          '<span class="dettaglio-prodotto">' + escapeHtml(p.quantita) + ' ' + escapeHtml(p.unitaMisura || '') + ' · ' + formattaOra(p.timestamp) + etichettaStato + '</span>' +
          '</div>';
      }).join('');
    }).catch(function () {
      contenitore.innerHTML = '<div class="lista-vuota">Impossibile caricare l\'elenco dopo vari tentativi (controlla la connessione).</div>';
    });
  }

  // ---------------- LISTA "GIÀ IN MAGAZZINO" ----------------

  function caricaGiacenzeAzienda() {
    if (!codiceAzienda || bloccoAzienda) return;
    var contenitore = document.getElementById('listaGiacenze');
    contenitore.innerHTML = '<div class="lista-vuota">Caricamento...</div>';
    chiamaServer('elencoGiacenzeAzienda', { codice: codiceAzienda }).then(function (d) {
      if (d.bloccato) { mostraBloccoAzienda(d.errore); return; }
      if (!d.successo || !d.prodotti || d.prodotti.length === 0) {
        contenitore.innerHTML = '<div class="lista-vuota">Nessun dato disponibile ancora.</div>';
        return;
      }
      contenitore.innerHTML = d.prodotti.map(function (p) {
        return '<div class="riga-elenco">' +
          '<span class="nome-prodotto">' + escapeHtml(p.nome) + '</span>' +
          '<span class="dettaglio-prodotto">' + escapeHtml(p.giacenza) + ' ' + escapeHtml(p.unitaMisura || '') + '</span>' +
          '</div>';
      }).join('');
    }).catch(function () {
      contenitore.innerHTML = '<div class="lista-vuota">Impossibile caricare l\'elenco dopo vari tentativi (controlla la connessione).</div>';
    });
  }

  document.getElementById('btnRicaricaOggi').addEventListener('click', caricaProdottiOggi);
  document.getElementById('btnRicaricaGiacenze').addEventListener('click', caricaGiacenzeAzienda);

  // ---------------- AVVIO ----------------

  if (codiceAzienda) {
    mostraOverlayCodice(false);
    caricaProdottiOggi();
    caricaGiacenzeAzienda();
  } else {
    mostraOverlayCodice(true);
  }
})();
