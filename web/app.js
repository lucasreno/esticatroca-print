const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
};

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function refreshHealth() {
  const chip = $('#health-chip');
  try {
    const data = await api('GET', '/api/health');
    chip.textContent = 'ativo';
    chip.className = 'chip chip-ok';
    $('#version').textContent = `v${data.version}`;
  } catch (err) {
    chip.textContent = 'offline';
    chip.className = 'chip chip-err';
    $('#version').textContent = err.message;
  }
}

async function refreshDiscovery() {
  const container = $('#discovery');
  container.innerHTML = '<div class="text-sm text-slate-500">Buscando...</div>';
  try {
    const data = await api('GET', '/api/printers/discover');
    if (!data.printers.length) {
      container.innerHTML =
        '<div class="text-sm text-slate-500">Nenhuma impressora encontrada. Verifique se a impressora esta instalada em Configuracoes &rarr; Impressoras.</div>';
      return;
    }
    container.innerHTML = '';
    data.printers.forEach((p) => container.appendChild(renderDiscovered(p)));
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-rose-600">Erro: ${err.message}</div>`;
  }
}

function renderDiscovered(p) {
  const title = el('div', { className: 'font-medium' }, p.name);
  const meta = el(
    'div',
    { className: 'text-xs text-slate-500' },
    [p.driverName, p.portName, p.status].filter(Boolean).join(' - '),
  );
  const addBtn = el('button', { className: 'btn btn-primary' }, 'Adicionar');
  addBtn.addEventListener('click', async () => {
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
      await refreshPrinters();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      addBtn.disabled = false;
    }
  });
  return el(
    'div',
    { className: 'flex items-center justify-between rounded-md border border-slate-200 p-3' },
    [el('div', {}, [title, meta]), addBtn],
  );
}

async function refreshPrinters() {
  const container = $('#printers');
  container.innerHTML = '<div class="text-sm text-slate-500">Carregando...</div>';
  try {
    const db = await api('GET', '/api/printers');
    if (!db.printers.length) {
      container.innerHTML =
        '<div class="text-sm text-slate-500">Nenhuma impressora cadastrada.</div>';
      return;
    }
    container.innerHTML = '';
    db.printers.forEach((p) => container.appendChild(renderPrinter(p, db)));
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-rose-600">Erro: ${err.message}</div>`;
  }
}

function renderPrinter(p, db) {
  const header = el('div', { className: 'flex flex-wrap items-center justify-between gap-3' }, [
    el('div', {}, [
      el('div', { className: 'font-semibold' }, p.title),
      el(
        'div',
        { className: 'text-xs text-slate-500' },
        `${p.type.toUpperCase()} - ${p.type === 'network' ? `${p.ip_address}:${p.port ?? 9100}` : p.path ?? ''}`,
      ),
    ]),
    el('div', { className: 'flex flex-wrap items-center gap-2' }, [
      db.receipt_printer === p.id
        ? el('span', { className: 'chip chip-ok' }, 'Recibos')
        : null,
      db.order_printers.includes(p.id)
        ? el('span', { className: 'chip chip-ok' }, 'Volumes/Pedidos')
        : null,
    ]),
  ]);

  const btnTest = el('button', { className: 'btn btn-secondary' }, 'Testar impressao');
  const btnDrawer = el('button', { className: 'btn btn-secondary' }, 'Abrir gaveta');
  const btnStatus = el('button', { className: 'btn btn-secondary' }, 'Checar conexao');
  const btnReceipt = el(
    'button',
    { className: 'btn btn-primary' },
    db.receipt_printer === p.id ? 'Padrao de recibos (atual)' : 'Tornar padrao de recibos',
  );
  const btnOrder = el(
    'button',
    { className: 'btn btn-secondary' },
    db.order_printers.includes(p.id) ? 'Remover de volumes' : 'Usar para volumes',
  );
  const btnDelete = el('button', { className: 'btn btn-danger' }, 'Excluir');

  btnTest.addEventListener('click', () => wrap(btnTest, () => api('POST', `/api/printers/${p.id}/test`)));
  btnDrawer.addEventListener('click', () =>
    wrap(btnDrawer, () => api('POST', `/api/printers/${p.id}/drawer`)),
  );
  btnStatus.addEventListener('click', async () => {
    btnStatus.disabled = true;
    try {
      const res = await api('GET', `/api/printers/${p.id}/status`);
      alert(res.ok ? 'Impressora online.' : `Offline: ${res.detail || 'sem detalhe'}`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      btnStatus.disabled = false;
    }
  });
  btnReceipt.addEventListener('click', async () => {
    await api('PUT', '/api/assignments', { receipt_printer: p.id });
    refreshPrinters();
  });
  btnOrder.addEventListener('click', async () => {
    const next = db.order_printers.includes(p.id)
      ? db.order_printers.filter((x) => x !== p.id)
      : [...db.order_printers, p.id];
    await api('PUT', '/api/assignments', { order_printers: next });
    refreshPrinters();
  });
  btnDelete.addEventListener('click', async () => {
    if (!confirm(`Excluir ${p.title}?`)) return;
    await api('DELETE', `/api/printers/${p.id}`);
    refreshPrinters();
  });

  const actions = el('div', { className: 'flex flex-wrap gap-2 pt-3' }, [
    btnTest,
    btnDrawer,
    btnStatus,
    btnReceipt,
    btnOrder,
    btnDelete,
  ]);

  return el('div', { className: 'rounded-md border border-slate-200 p-4' }, [header, actions]);
}

async function wrap(btn, fn) {
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Aguarde...';
  try {
    await fn();
    btn.textContent = 'OK';
    setTimeout(() => (btn.textContent = label), 1500);
  } catch (err) {
    alert(`Erro: ${err.message}`);
    btn.textContent = label;
  } finally {
    btn.disabled = false;
  }
}

$('#btn-discover').addEventListener('click', refreshDiscovery);
$('#btn-restart-spooler').addEventListener('click', async () => {
  if (!confirm('Reiniciar o Print Spooler do Windows? (requer privilegios de admin)')) return;
  try {
    const res = await api('POST', '/api/system/restart-spooler');
    alert(res.ok ? 'Spooler reiniciado com sucesso.' : `Falhou: ${res.output}`);
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
});

$('#form-network').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const payload = {
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
    refreshPrinters();
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
});

refreshHealth();
refreshDiscovery();
refreshPrinters();
setInterval(refreshHealth, 5000);
