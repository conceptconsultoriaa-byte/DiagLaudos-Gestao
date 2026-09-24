/* ===========================================================
   DiagLaudos Gestão — app.js
   =========================================================== */
let ME = null;       // { id, nome, role, medico_id }
let MEDICOS = [];
let UNIDADES = [];
let VALORES = [];    // dl_valores: { medico_id, modalidade, tipo, valor_unitario }

const TIPO_LABEL = { eletivo: "Eletivo", urgencia: "Urgência", internados: "Internados" };
const MODALIDADE_LABEL = { tomografia: "Tomografia", raio_x: "Raio-X", ressonancia: "Ressonância Magnética", mamografia: "Mamografia" };

function brl(v) { return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function monthRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
function monthLabel(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${nomes[m-1]}/${y}`;
}
function waLink(telefone, texto) {
  const num = (telefone || "").replace(/\D/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
function valorDe(medicoId, modalidade, tipo) {
  const v = VALORES.find(v => v.medico_id === medicoId && v.modalidade === modalidade && v.tipo === tipo);
  return v ? Number(v.valor_unitario) : 0;
}
function gerarResumoPorCombo(laudos) {
  const combos = {};
  laudos.forEach(l => {
    const key = `${l.modalidade}|${l.tipo}`;
    if (!combos[key]) combos[key] = { modalidade: l.modalidade, tipo: l.tipo, qtd: 0, valor: 0 };
    combos[key].qtd += l.quantidade;
    combos[key].valor += Number(l.valor_total);
  });
  return Object.values(combos).sort((a,b) => a.modalidade.localeCompare(b.modalidade) || a.tipo.localeCompare(b.tipo));
}
function textoResumo(combos) {
  if (combos.length === 0) return "Nenhum laudo lançado neste período.";
  const total = combos.reduce((s,c) => s + c.valor, 0);
  let texto = combos.map(c => `${MODALIDADE_LABEL[c.modalidade]} (${TIPO_LABEL[c.tipo]}): ${c.qtd} laudo(s) — ${brl(c.valor)}`).join("\n");
  texto += `\n\n*Total do período: ${brl(total)}*`;
  return texto;
}

async function boot() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }

  let { data: profile } = await supabaseClient.from("dl_profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (!profile) {
    const { data: novo } = await supabaseClient.from("dl_profiles")
      .insert({ id: session.user.id, nome: session.user.email, role: "medico" })
      .select().single();
    profile = novo;
  }
  ME = profile;
  document.getElementById("whoName").textContent = `${ME.nome || session.user.email} (${ME.role === "admin" ? "administração" : "médico"})`;

  if (ME.role === "medico" && !ME.medico_id) {
    document.getElementById("pendingBox").classList.remove("hidden");
    return;
  }

  document.getElementById("mainArea").classList.remove("hidden");
  if (ME.role === "admin") { await bootAdmin(); } else { await bootMedico(); }
}

document.getElementById("btnLogout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

function buildTabs(tabs) {
  const bar = document.getElementById("tabsBar");
  bar.innerHTML = "";
  tabs.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "tab" + (i === 0 ? " active" : "");
    el.textContent = t.label;
    el.addEventListener("click", () => showTab(t.id, bar));
    bar.appendChild(el);
  });
  showTab(tabs[0].id, bar);
}
function showTab(id, bar) {
  document.querySelectorAll(".tabpage").forEach(p => p.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  [...bar.children].forEach(c => c.classList.toggle("active", c.textContent === bar._labels?.[id]));
}

/* ===================== ADMIN ===================== */
async function bootAdmin() {
  const tabs = [
    { id: "tab-painel", label: "Painel" },
    { id: "tab-cadastros", label: "Cadastros" },
    { id: "tab-laudos", label: "Laudos" },
    { id: "tab-recebimentos", label: "Recebimentos" },
    { id: "tab-relatorios", label: "Relatórios" },
  ];
  const bar = document.getElementById("tabsBar");
  bar._labels = Object.fromEntries(tabs.map(t => [t.id, t.label]));
  buildTabs(tabs);

  await loadMedicosEUnidades();
  await renderPainel();
  await renderCadastros();
  await renderLaudosAdmin();
  await renderRecebimentos();
  setupRelatorios();
}

async function loadMedicosEUnidades() {
  const { data: medicos } = await supabaseClient.from("dl_medicos").select("*").eq("ativo", true).order("nome");
  MEDICOS = medicos || [];
  const { data: unidades } = await supabaseClient.from("dl_unidades").select("*").eq("ativo", true).order("nome");
  UNIDADES = unidades || [];
  const { data: valores } = await supabaseClient.from("dl_valores").select("*");
  VALORES = valores || [];

  const fillSelect = (el, list, withEmpty) => {
    el.innerHTML = (withEmpty ? `<option value="">${withEmpty}</option>` : "") +
      list.map(x => `<option value="${x.id}">${x.nome}</option>`).join("");
  };
  ["laMedico", "fMedico", "relMedico", "vMedico"].forEach(id => { if (document.getElementById(id)) fillSelect(document.getElementById(id), MEDICOS, id === "fMedico" ? "Todos" : null); });
  ["laUnidade", "fUnidade", "rUnidade", "relUnidade", "lmUnidade"].forEach(id => { if (document.getElementById(id)) fillSelect(document.getElementById(id), UNIDADES, id === "fUnidade" ? "Todas" : null); });
}

async function renderPainel() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { start, end } = monthRange(monthStr);

  const { data: recs } = await supabaseClient.from("dl_recebimentos").select("valor,status").gte("competencia", start).lte("competencia", end);
  const aReceber = (recs || []).filter(r => r.status !== "recebido").reduce((s, r) => s + Number(r.valor), 0);
  const recebido = (recs || []).filter(r => r.status === "recebido").reduce((s, r) => s + Number(r.valor), 0);
  document.getElementById("kpiAReceber").textContent = brl(aReceber);
  document.getElementById("kpiRecebido").textContent = brl(recebido);

  const { data: laudosMes } = await supabaseClient.from("dl_laudos").select("valor_total").gte("data", start).lte("data", end);
  const aPagar = (laudosMes || []).reduce((s, l) => s + Number(l.valor_total), 0);
  document.getElementById("kpiAPagar").textContent = brl(aPagar);

  const { data: ultimos } = await supabaseClient.from("dl_laudos").select("*, dl_medicos(nome), dl_unidades(nome)").order("created_at", { ascending: false }).limit(10);
  const tbody = document.querySelector("#tblUltimosLaudos tbody");
  tbody.innerHTML = (ultimos || []).map(l => `<tr><td>${fmtDate(l.data)}</td><td>${l.dl_medicos?.nome || ""}</td><td>${l.dl_unidades?.nome || ""}</td><td>${MODALIDADE_LABEL[l.modalidade]||""}</td><td>${TIPO_LABEL[l.tipo]}</td><td>${l.quantidade}</td><td>${brl(l.valor_total)}</td></tr>`).join("") || `<tr><td colspan="7" class="hint">Nenhum laudo lançado ainda.</td></tr>`;
}

async function renderCadastros() {
  const { data: pendentes } = await supabaseClient.from("dl_profiles").select("*").eq("role", "medico").is("medico_id", null);
  const box = document.getElementById("pendentesVinculo");
  if (!pendentes || pendentes.length === 0) {
    box.innerHTML = `<p class="hint">Nenhuma conta pendente de vínculo.</p>`;
  } else {
    box.innerHTML = pendentes.map(p => `
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
        <span style="flex:1;">${p.nome}</span>
        <select id="vinc-${p.id}"><option value="">Vincular a...</option>${MEDICOS.map(m => `<option value="${m.id}">${m.nome}</option>`).join("")}</select>
        <button class="btn-outline btn-sm" onclick="vincularMedico('${p.id}')">Vincular</button>
      </div>`).join("");
  }

  const { data: unidades } = await supabaseClient.from("dl_unidades").select("*").order("nome");
  document.querySelector("#tblUnidades tbody").innerHTML = (unidades || []).map(u =>
    `<tr><td>${u.nome}</td><td>${u.telefone || ""}</td><td>${u.email || ""}</td></tr>`).join("");

  const { data: medicos } = await supabaseClient.from("dl_medicos").select("*").order("nome");
  document.querySelector("#tblMedicos tbody").innerHTML = (medicos || []).map(m =>
    `<tr><td>${m.nome}</td><td>${m.telefone || ""}</td></tr>`).join("");

  renderValoresPorMedico();
}

function renderValoresPorMedico() {
  const el = document.getElementById("valoresPorMedico");
  if (MEDICOS.length === 0) { el.innerHTML = "<p class='hint'>Cadastre um médico primeiro.</p>"; return; }
  el.innerHTML = MEDICOS.map(m => {
    const valoresM = VALORES.filter(v => v.medico_id === m.id);
    return `<div class="list-item" style="display:block; margin-bottom:10px;">
      <strong>${m.nome}</strong>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
        ${valoresM.map(v => `<span class="badge pago">${MODALIDADE_LABEL[v.modalidade]} · ${TIPO_LABEL[v.tipo]}: ${brl(v.valor_unitario)}</span>`).join("") || "<span class='hint'>nenhum valor cadastrado ainda</span>"}
      </div>
    </div>`;
  }).join("");
}

window.vincularMedico = async (profileId) => {
  const sel = document.getElementById(`vinc-${profileId}`);
  const medicoId = sel.value;
  if (!medicoId) return;
  await supabaseClient.from("dl_profiles").update({ medico_id: medicoId }).eq("id", profileId);
  await renderCadastros();
};

document.getElementById("formUnidade").addEventListener("submit", async (e) => {
  e.preventDefault();
  await supabaseClient.from("dl_unidades").insert({
    nome: document.getElementById("uNome").value.trim(),
    telefone: document.getElementById("uTelefone").value.trim(),
    email: document.getElementById("uEmail").value.trim(),
  });
  e.target.reset();
  await loadMedicosEUnidades();
  await renderCadastros();
});

document.getElementById("formMedico").addEventListener("submit", async (e) => {
  e.preventDefault();
  await supabaseClient.from("dl_medicos").insert({
    nome: document.getElementById("mNome").value.trim(),
    telefone: document.getElementById("mTelefone").value.trim(),
  });
  e.target.reset();
  await loadMedicosEUnidades();
  await renderCadastros();
});

document.getElementById("formValor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabaseClient.from("dl_valores").upsert({
    medico_id: document.getElementById("vMedico").value,
    modalidade: document.getElementById("vModalidade").value,
    tipo: document.getElementById("vTipo").value,
    valor_unitario: Number(document.getElementById("vValor").value),
  }, { onConflict: "medico_id,modalidade,tipo" });
  if (error) { alert("Erro ao salvar valor: " + error.message); return; }
  document.getElementById("vValor").value = "";
  await loadMedicosEUnidades();
  renderValoresPorMedico();
});

async function renderLaudosAdmin(filtro) {
  let q = supabaseClient.from("dl_laudos").select("*, dl_medicos(nome), dl_unidades(nome)").order("data", { ascending: false });
  if (filtro?.medico) q = q.eq("medico_id", filtro.medico);
  if (filtro?.unidade) q = q.eq("unidade_id", filtro.unidade);
  if (filtro?.start) q = q.gte("data", filtro.start).lte("data", filtro.end);
  const { data } = await q.limit(300);
  document.querySelector("#tblLaudos tbody").innerHTML = (data || []).map(l =>
    `<tr><td>${fmtDate(l.data)}</td><td>${l.dl_medicos?.nome || ""}</td><td>${l.dl_unidades?.nome || ""}</td><td>${MODALIDADE_LABEL[l.modalidade]||""}</td><td>${TIPO_LABEL[l.tipo]}</td><td>${l.quantidade}</td><td>${brl(l.valor_unitario)}</td><td>${brl(l.valor_total)}</td></tr>`
  ).join("") || `<tr><td colspan="8" class="hint">Nenhum laudo encontrado.</td></tr>`;
}

document.getElementById("formLaudoAdmin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msgLaudoAdmin");
  const medicoId = document.getElementById("laMedico").value;
  const modalidade = document.getElementById("laModalidade").value;
  const tipo = document.getElementById("laTipo").value;
  const qtd = Number(document.getElementById("laQtd").value);
  const valorUnit = valorDe(medicoId, modalidade, tipo);
  if (valorUnit === 0 && !confirm(`Não há valor cadastrado para ${MODALIDADE_LABEL[modalidade]} (${TIPO_LABEL[tipo]}) desse médico. Lançar mesmo assim com valor R$ 0,00?`)) return;
  const { error } = await supabaseClient.from("dl_laudos").insert({
    data: document.getElementById("laData").value,
    medico_id: medicoId,
    unidade_id: document.getElementById("laUnidade").value,
    modalidade, tipo, quantidade: qtd, valor_unitario: valorUnit, valor_total: valorUnit * qtd,
  });
  msg.textContent = error ? "Erro: " + error.message : "Laudo lançado!";
  msg.className = "msg " + (error ? "err" : "ok");
  if (!error) { e.target.reset(); await renderLaudosAdmin(); await renderPainel(); }
});

document.getElementById("formFiltroLaudos").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mes = document.getElementById("fMes").value;
  const filtro = { medico: document.getElementById("fMedico").value, unidade: document.getElementById("fUnidade").value };
  if (mes) { const { start, end } = monthRange(mes); filtro.start = start; filtro.end = end; }
  await renderLaudosAdmin(filtro);
});

async function renderRecebimentos() {
  const { data } = await supabaseClient.from("dl_recebimentos").select("*, dl_unidades(nome)").order("competencia", { ascending: false });
  document.querySelector("#tblRecebimentos tbody").innerHTML = (data || []).map(r => `
    <tr>
      <td>${r.dl_unidades?.nome || ""}</td>
      <td>${monthLabel(r.competencia.slice(0,7))}</td>
      <td>${fmtDate(r.vencimento)}</td>
      <td>${brl(r.valor)}</td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td>${r.status !== "recebido" ? `<button class="btn-outline btn-sm" onclick="marcarRecebido('${r.id}')">Marcar recebido</button>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="6" class="hint">Nenhum recebimento cadastrado.</td></tr>`;
}

window.marcarRecebido = async (id) => {
  await supabaseClient.from("dl_recebimentos").update({ status: "recebido", data_recebimento: new Date().toISOString().slice(0,10) }).eq("id", id);
  await renderRecebimentos();
  await renderPainel();
};

document.getElementById("formRecebimento").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mes = document.getElementById("rCompetencia").value;
  await supabaseClient.from("dl_recebimentos").insert({
    unidade_id: document.getElementById("rUnidade").value,
    competencia: mes + "-01",
    vencimento: document.getElementById("rVencimento").value || null,
    valor: Number(document.getElementById("rValor").value),
  });
  e.target.reset();
  await renderRecebimentos();
  await renderPainel();
});

function setupRelatorios() {
  document.getElementById("formRelUnidade").addEventListener("submit", async (e) => {
    e.preventDefault();
    const unidadeId = document.getElementById("relUnidade").value;
    const mes = document.getElementById("relUnidadeMes").value;
    const unidade = UNIDADES.find(u => u.id === unidadeId);
    const { start, end } = monthRange(mes);
    const { data } = await supabaseClient.from("dl_laudos").select("*").eq("unidade_id", unidadeId).gte("data", start).lte("data", end);
    const combos = gerarResumoPorCombo(data || []);
    const texto = `*DiagLaudos — Relatório de Laudos*\n${unidade.nome} — ${monthLabel(mes)}\n\n${textoResumo(combos)}`;
    document.getElementById("boxRelUnidade").innerHTML = `<div class="report-box">${texto}</div>` +
      (unidade.telefone ? `<a class="btn-primary btn-sm" style="display:inline-block; margin-top:10px; text-decoration:none;" target="_blank" href="${waLink(unidade.telefone, texto)}">Enviar no WhatsApp</a>` : `<p class="hint">Cadastre o WhatsApp da unidade para enviar direto.</p>`);
  });

  document.getElementById("formRelMedico").addEventListener("submit", async (e) => {
    e.preventDefault();
    const medicoId = document.getElementById("relMedico").value;
    const mes = document.getElementById("relMedicoMes").value;
    const medico = MEDICOS.find(m => m.id === medicoId);
    const { start, end } = monthRange(mes);
    const { data } = await supabaseClient.from("dl_laudos").select("*").eq("medico_id", medicoId).gte("data", start).lte("data", end);
    const combos = gerarResumoPorCombo(data || []);
    const texto = `*DiagLaudos — Relatório de Produção*\n${medico.nome} — ${monthLabel(mes)}\n\n${textoResumo(combos)}`;
    document.getElementById("boxRelMedico").innerHTML = `<div class="report-box">${texto}</div>` +
      (medico.telefone ? `<a class="btn-primary btn-sm" style="display:inline-block; margin-top:10px; text-decoration:none;" target="_blank" href="${waLink(medico.telefone, texto)}">Enviar no WhatsApp</a>` : `<p class="hint">Cadastre o WhatsApp do médico para enviar direto.</p>`);
  });
}

/* ===================== MEDICO ===================== */
async function bootMedico() {
  const tabs = [
    { id: "tab-lancar", label: "Lançar Laudo" },
    { id: "tab-meuslaudos", label: "Meus Laudos" },
    { id: "tab-meurelatorio", label: "Meu Relatório" },
  ];
  const bar = document.getElementById("tabsBar");
  bar._labels = Object.fromEntries(tabs.map(t => [t.id, t.label]));
  buildTabs(tabs);

  const { data: unidades } = await supabaseClient.from("dl_unidades").select("*").eq("ativo", true).order("nome");
  UNIDADES = unidades || [];
  document.getElementById("lmUnidade").innerHTML = UNIDADES.map(u => `<option value="${u.id}">${u.nome}</option>`).join("");
  document.getElementById("lmData").value = new Date().toISOString().slice(0, 10);

  const { data: valores } = await supabaseClient.from("dl_valores").select("*").eq("medico_id", ME.medico_id);
  VALORES = valores || [];

  await renderMeusLaudos();

  document.getElementById("formLaudoMedico").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("msgLaudoMedico");
    const modalidade = document.getElementById("lmModalidade").value;
    const tipo = document.getElementById("lmTipo").value;
    const qtd = Number(document.getElementById("lmQtd").value);
    const valorUnit = valorDe(ME.medico_id, modalidade, tipo);
    const { error } = await supabaseClient.from("dl_laudos").insert({
      data: document.getElementById("lmData").value,
      medico_id: ME.medico_id,
      unidade_id: document.getElementById("lmUnidade").value,
      modalidade, tipo, quantidade: qtd, valor_unitario: valorUnit, valor_total: valorUnit * qtd,
      criado_por: (await supabaseClient.auth.getSession()).data.session.user.id,
    });
    msg.textContent = error ? "Erro: " + error.message : "Laudo lançado com sucesso!";
    msg.className = "msg " + (error ? "err" : "ok");
    if (!error) { document.getElementById("lmQtd").value = ""; await renderMeusLaudos(); }
  });

  document.getElementById("formMeuRelatorio").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mes = document.getElementById("meuRelMes").value;
    const { start, end } = monthRange(mes);
    const { data } = await supabaseClient.from("dl_laudos").select("*").eq("medico_id", ME.medico_id).gte("data", start).lte("data", end);
    const combos = gerarResumoPorCombo(data || []);
    const { data: pagStatus } = await supabaseClient.from("dl_pagamentos_status").select("*").eq("medico_id", ME.medico_id).eq("competencia", start).maybeSingle();
    document.getElementById("boxMeuRelatorio").innerHTML = `
      <div class="report-box">*Relatório de Produção — ${monthLabel(mes)}*\n\n${textoResumo(combos)}\n\n` +
      `Status: <span class="badge ${pagStatus?.status || 'pendente'}">${pagStatus?.status || 'pendente'}</span></div>`;
  });
}

async function renderMeusLaudos() {
  const { data } = await supabaseClient.from("dl_laudos").select("*, dl_unidades(nome)").eq("medico_id", ME.medico_id).order("data", { ascending: false }).limit(100);
  document.querySelector("#tblMeusLaudos tbody").innerHTML = (data || []).map(l =>
    `<tr><td>${fmtDate(l.data)}</td><td>${l.dl_unidades?.nome || ""}</td><td>${MODALIDADE_LABEL[l.modalidade]||""}</td><td>${TIPO_LABEL[l.tipo]}</td><td>${l.quantidade}</td><td>${brl(l.valor_total)}</td></tr>`
  ).join("") || `<tr><td colspan="6" class="hint">Nenhum laudo lançado ainda.</td></tr>`;
}

boot();
