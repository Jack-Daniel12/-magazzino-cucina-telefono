// app.js
// Logica della pagina "Nuovo Prodotto" — stessa identica logica che girava
// dentro Apps Script (variabile JS_PAGINA), solo spostata in un file reale.
// L'URL dell'Apps Script ora viene da config.js (URL_SCRIPT), invece di
// essere iniettato dal server con una sostituzione di stringa.
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

  var idDispositivo = ottieniIdDispositivo();

  document.getElementById('btnInvia').addEventListener('click', function () {
    var nome = document.getElementById('nome').value.trim();
    var quantita = document.getElementById('quantita').value;
    var unita = document.getElementById('unita').value.trim();
    var nota = document.getElementById('nota').value.trim();
    var esito = document.getElementById('esito');
    esito.className = 'esito';
    esito.innerHTML = '';

    if (!nome || !quantita) {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Scrivi almeno nome e quantita.';
      return;
    }

    // IMPORTANTE: Content-Type "text/plain" (non "application/json") per
    // evitare che il browser mandi una richiesta preflight OPTIONS, che
    // Apps Script gestisce male. Non cambiare, anche se sembra "più giusto"
    // usare application/json: qui la pagina e l'Apps Script vivono su
    // domini diversi (GitHub Pages vs script.google.com), quindi la
    // richiesta è davvero cross-origin.
    fetch(URL_SCRIPT + '?azione=nuovoProdotto', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ nome: nome, quantita: quantita, unitaMisura: unita, nota: nota, idDispositivo: idDispositivo })
    }).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.successo) {
        esito.className = 'esito ok';
        esito.innerHTML = ICONA_OK + 'Prodotto inviato correttamente.';
        document.getElementById('nome').value = '';
        document.getElementById('quantita').value = '';
        document.getElementById('unita').value = '';
        document.getElementById('nota').value = '';
        document.getElementById('nome').focus();
      } else {
        esito.className = 'esito errore';
        esito.innerHTML = ICONA_ERR + (d.errore || 'Errore di invio dei dati.');
      }
    }).catch(function () {
      esito.className = 'esito errore';
      esito.innerHTML = ICONA_ERR + 'Impossibile contattare il server. Controlla la connessione.';
    });
  });
})();
