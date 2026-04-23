/* Esticatroca Print — admin UI */
(function () {
  'use strict';

  var $ = function (sel) {
    return document.querySelector(sel);
  };

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'className') node.className = props[k];
        else if (k === 'textContent') node.textContent = props[k];
        else if (k === 'attrs') {
          for (var a in props.attrs) node.setAttribute(a, props.attrs[a]);
        } else node[k] = props[k];
      }
    }
    var list = [].concat(children == null ? [] : children);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  /* ------------------------------------------------------------------ */
  /* Toasts (feedback, Nielsen #1)                                       */
  /* ------------------------------------------------------------------ */
  function toast(message, kind, title) {
    var host = $('#toasts');
    if (!host) return;
    var t = el('div', { className: 'toast ' + (kind || '') }, [
      title ? el('div', { className: 'toast-title' }, title) : null,
      el('div', {}, message),
    ]);
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity 200ms ease';
      t.style.opacity = '0';
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 220);
    }, kind === 'err' ? 5200 : 3200);
  }

  /* ------------------------------------------------------------------ */
  /* API helper                                                          */
  /* ------------------------------------------------------------------ */
  async function api(method, path, body) {
    var res = await fetch(path, {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Health                                                              */
  /* ------------------------------------------------------------------ */
  async function refreshHealth() {
    var chip = $('#health-chip');
    try {
      var data = await api('GET', '/api/health');
      chip.className = 'chip chip-ok';
      chip.innerHTML = '<span class="dot"></span><span>ativo</span>';
      $('#version').textContent = 'v' + data.version;
    } catch (err) {
      chip.className = 'chip chip-err';
      chip.innerHTML = '<span class="dot"></span><span>offline</span>';
      $('#version').textContent = err.message;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Discovery                                                           */
  /* ------------------------------------------------------------------ */
  async function refreshDiscovery() {
    var container = $('#discovery');
    container.innerHTML = '';
    container.appendChild(el('div', { className: 'loading' }, 'Buscando impressoras\u2026'));
    try {
      var data = await api('GET', '/api/printers/discover');
      container.innerHTML = '';
      if (!data.printers.length) {
        container.appendChild(
          el('div', { className: 'empty' }, [
            el('strong', {}, 'Nenhuma impressora encontrada.'),
            el(
              'div',
              {},
              'Verifique se ela est\u00e1 instalada em Configura\u00e7\u00f5es \u2192 Impressoras do Windows.',
            ),
          ]),
        );
        return;
      }
      data.printers.forEach(function (p) {
        container.appendChild(renderDiscovered(p));
      });
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(el('div', { className: 'error' }, 'Erro: ' + err.message));
    }
  }

  function renderDiscovered(p) {
    var main = el('div', { className: 'discovered-main' }, [
      el('div', { className: 'discovered-title' }, p.name),
      el(
        'div',
        { className: 'discovered-meta' },
        [p.driverName, p.portName, p.status].filter(Boolean).join(' \u00b7 '),
      ),
    ]);
    var addBtn = el('button', { className: 'btn btn-primary', type: 'button' }, 'Adicionar');
    addBtn.addEventListener('click', async function () {
      addBtn.disabled = true;
      try {
        await api('POST', '/api/printers', {
          title: p.name,
          type: 'windows',
          path: p.name,
          char_per_line: 42,
          driver: 'epson',
          profile: 'default',
        });
        toast(p.name + ' adicionada.', 'ok');
        refreshPrinters();
      } catch (err) {
        toast(err.message, 'err', 'Erro ao adicionar');
      } finally {
        addBtn.disabled = false;
      }
    });
    return el('div', { className: 'discovered' }, [main, addBtn]);
  }

  /* ------------------------------------------------------------------ */
  /* Printers                                                            */
  /* ------------------------------------------------------------------ */
  async function refreshPrinters() {
    var container = $('#printers');
    container.innerHTML = '';
    container.appendChild(el('div', { className: 'loading' }, 'Carregando\u2026'));
    try {
      var db = await api('GET', '/api/printers');
      container.innerHTML = '';
      if (!db.printers.length) {
        container.appendChild(
          el('div', { className: 'empty' }, [
            el('strong', {}, 'Nenhuma impressora cadastrada.'),
            el(
              'div',
              {},
              'Adicione uma da lista do Windows acima ou cadastre manualmente por TCP/IP.',
            ),
          ]),
        );
        return;
      }
      db.printers.forEach(function (p) {
        container.appendChild(renderPrinter(p, db));
      });
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(el('div', { className: 'error' }, 'Erro: ' + err.message));
    }
  }

  function renderPrinter(p, db) {
    var isReceipt = db.receipt_printer === p.id;
    var isOrder = db.order_printers.indexOf(p.id) !== -1;

    var chips = el('div', { className: 'row' }, [
      isReceipt ? el('span', { className: 'chip chip-ok' }, 'Recibos') : null,
      isOrder ? el('span', { className: 'chip chip-ok' }, 'Volumes/Pedidos') : null,
    ]);

    var head = el('div', { className: 'printer-head' }, [
      el('div', {}, [
        el('div', { className: 'printer-title' }, p.title),
        el(
          'div',
          { className: 'printer-meta' },
          p.type.toUpperCase() +
            ' \u00b7 ' +
            (p.type === 'network'
              ? p.ip_address + ':' + (p.port != null ? p.port : 9100)
              : p.path || ''),
        ),
      ]),
      chips,
    ]);

    var btnTest = el('button', { className: 'btn btn-secondary', type: 'button' }, 'Testar impress\u00e3o');
    var btnDrawer = el('button', { className: 'btn btn-secondary', type: 'button' }, 'Abrir gaveta');
    var btnStatus = el('button', { className: 'btn btn-secondary', type: 'button' }, 'Checar conex\u00e3o');
    var btnReceipt = el(
      'button',
      { className: isReceipt ? 'btn btn-secondary' : 'btn btn-primary', type: 'button' },
      isReceipt ? 'Padr\u00e3o de recibos' : 'Tornar padr\u00e3o de recibos',
    );
    if (isReceipt) btnReceipt.disabled = true;
    var btnOrder = el(
      'button',
      { className: 'btn btn-secondary', type: 'button' },
      isOrder ? 'Remover de volumes' : 'Usar para volumes',
    );
    var btnDelete = el('button', { className: 'btn btn-danger', type: 'button' }, 'Excluir');

    btnTest.addEventListener('click', function () {
      wrap(btnTest, function () {
        return api('POST', '/api/printers/' + p.id + '/test');
      }, 'Teste enviado.');
    });
    btnDrawer.addEventListener('click', function () {
      wrap(btnDrawer, function () {
        return api('POST', '/api/printers/' + p.id + '/drawer');
      }, 'Comando enviado.');
    });
    btnStatus.addEventListener('click', async function () {
      btnStatus.disabled = true;
      try {
        var res = await api('GET', '/api/printers/' + p.id + '/status');
        if (res.ok) toast('Impressora online.', 'ok', p.title);
        else toast(res.detail || 'Offline', 'err', p.title);
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        btnStatus.disabled = false;
      }
    });
    btnReceipt.addEventListener('click', async function () {
      try {
        await api('PUT', '/api/assignments', { receipt_printer: p.id });
        toast(p.title + ' definida como padr\u00e3o de recibos.', 'ok');
        refreshPrinters();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
    btnOrder.addEventListener('click', async function () {
      var next = isOrder
        ? db.order_printers.filter(function (x) {
            return x !== p.id;
          })
        : db.order_printers.concat([p.id]);
      try {
        await api('PUT', '/api/assignments', { order_printers: next });
        refreshPrinters();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
    btnDelete.addEventListener('click', async function () {
      if (!confirm('Excluir "' + p.title + '"? Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.'))
        return;
      try {
        await api('DELETE', '/api/printers/' + p.id);
        toast('Impressora removida.', 'ok');
        refreshPrinters();
      } catch (err) {
        toast(err.message, 'err');
      }
    });

    var actions = el('div', { className: 'printer-actions' }, [
      btnTest,
      btnDrawer,
      btnStatus,
      btnReceipt,
      btnOrder,
      btnDelete,
    ]);

    return el(
      'div',
      { className: 'printer-card' + (isReceipt ? ' is-primary' : '') },
      [head, actions],
    );
  }

  async function wrap(btn, fn, okMessage) {
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Aguarde\u2026';
    try {
      await fn();
      btn.textContent = 'OK';
      if (okMessage) toast(okMessage, 'ok');
      setTimeout(function () {
        btn.textContent = label;
      }, 1500);
    } catch (err) {
      toast(err.message, 'err');
      btn.textContent = label;
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */
  $('#btn-discover').addEventListener('click', refreshDiscovery);

  $('#btn-restart-spooler').addEventListener('click', async function () {
    if (!confirm('Reiniciar o Print Spooler do Windows? (requer privil\u00e9gios de admin)'))
      return;
    try {
      var res = await api('POST', '/api/system/restart-spooler');
      if (res.ok) toast('Spooler reiniciado com sucesso.', 'ok');
      else toast(res.output || 'Falha ao reiniciar.', 'err');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('#form-network').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var form = new FormData(ev.target);
    var payload = {
      title: form.get('title'),
      type: 'network',
      ip_address: form.get('ip_address'),
      port: Number(form.get('port')) || 9100,
      char_per_line: Number(form.get('char_per_line')) || 42,
      driver: 'epson',
      profile: 'default',
    };
    try {
      await api('POST', '/api/printers', payload);
      ev.target.reset();
      toast('Impressora adicionada.', 'ok');
      refreshPrinters();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  refreshHealth();
  refreshDiscovery();
  refreshPrinters();
  setInterval(refreshHealth, 5000);
})();
