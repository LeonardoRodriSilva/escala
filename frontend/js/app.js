// API Base URL — usa o próprio host (funciona em localhost e em produção/Vercel, onde /api roda como serverless function)
const API_URL = `${window.location.origin}/api`;

// Estado da aplicação
const app = {
    integrantes: [],
    comodos: [],
    infracoes: [],
    motivacoes: [],
    motivacaoDestaque: null,
    config: {},
    imagemComodoAtual: null,
    escalaAtual: [],
    editandoIntegranteId: null,
    editandoComodoId: null
};

const LOGO_PADRAO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="95" fill="%23FFD700" stroke="%23000" stroke-width="4"/><rect x="40" y="50" width="120" height="100" fill="%23DC0000"/><text x="100" y="130" font-size="80" font-weight="bold" text-anchor="middle" font-family="Arial" fill="%23FFD700">B</text><circle cx="75" cy="75" r="15" fill="%23FFF"/><circle cx="125" cy="75" r="15" fill="%23FFF"/><circle cx="75" cy="80" r="8" fill="%23000"/><circle cx="125" cy="80" r="8" fill="%23000"/></svg>';

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    carregarConfig();
    carregarVersao();
    carregarDados();
    setupEventListeners();
    setupTabs();
    setupAccordions();
});

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            mudarAba(tabName);
        });
    });
}

function mudarAba(tabName) {
    // Remover active de todos os tabs e conteúdo
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Adicionar active ao tab selecionado
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');

    // Carregar dados específicos de cada aba
    if (tabName === 'escala') {
        carregarEscalaAtual();
    } else if (tabName === 'historico') {
        carregarHistorico();
    } else if (tabName === 'infracoes') {
        carregarInfracoes();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== ACCORDION (CONFIGURAÇÕES) =====
function setupAccordions() {
    document.querySelectorAll('.acc-header').forEach(header => {
        header.addEventListener('click', () => {
            const acc = header.closest('.acc');
            definirAccordionAberto(acc, !acc.classList.contains('open'));
        });
    });
}

function definirAccordionAberto(acc, aberto) {
    acc.classList.toggle('open', aberto);
    acc.querySelector('.acc-header').setAttribute('aria-expanded', String(aberto));
}

function abrirAccordion(id) {
    definirAccordionAberto(document.getElementById(id), true);
}

// Iniciais para o avatar (ex.: "Terezinha" -> "TE", "João Pedro" -> "JP")
function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Escapa texto vindo do banco (nomes, descrições) antes de colocá-lo em innerHTML
function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

// Valida tamanho/tipo de imagem no cliente antes de enviar (espelha os limites do multer no backend)
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const EXTENSOES_IMAGEM_PERMITIDAS = /\.(png|jpe?g|webp|gif)$/i;

function validarArquivoImagem(file) {
    if (!EXTENSOES_IMAGEM_PERMITIDAS.test(file.name)) {
        return 'Tipo de arquivo não permitido. Envie png, jpg, jpeg, webp ou gif.';
    }
    if (file.size > TAMANHO_MAXIMO_IMAGEM) {
        return `Arquivo muito grande (${(file.size / (1024 * 1024)).toFixed(1)}MB). O limite é 5MB.`;
    }
    return null;
}

// Desabilita um botão e mostra texto de carregamento durante requisições (evita cliques duplicados)
function definirCarregando(botao, carregando, textoCarregando = '⏳ Enviando...') {
    if (!botao) return;
    if (carregando) {
        botao.dataset.htmlOriginal = botao.dataset.htmlOriginal || botao.innerHTML;
        botao.disabled = true;
        botao.textContent = textoCarregando;
    } else {
        botao.disabled = false;
        if (botao.dataset.htmlOriginal) botao.innerHTML = botao.dataset.htmlOriginal;
        delete botao.dataset.htmlOriginal;
    }
}

// ===== CARREGAMENTO DE DADOS =====
async function carregarDados() {
    try {
        const [integrantes, comodos] = await Promise.all([
            fetch(`${API_URL}/integrantes`).then(r => r.json()),
            fetch(`${API_URL}/comodos`).then(r => r.json())
        ]);

        app.integrantes = integrantes;
        app.comodos = comodos;

        renderizarIntegrantes();
        renderizarComodos();
        await carregarInfracoes();
        carregarEscalaAtual();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarNotificacao('Erro ao carregar dados', 'error');
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Formulários de configuração
    document.getElementById('form-integrante').addEventListener('submit', adicionarOuEditarIntegrante);
    document.getElementById('form-comodo').addEventListener('submit', adicionarOuEditarComodo);
    document.getElementById('form-infracao').addEventListener('submit', registrarInfracao);
    document.getElementById('form-motivacao').addEventListener('submit', uploadMotivacao);
    document.getElementById('form-logo').addEventListener('submit', uploadLogo);
    document.getElementById('form-background').addEventListener('submit', uploadBackground);
    document.getElementById('form-cores').addEventListener('submit', salvarCores);

    // Botões cancelar edição
    document.getElementById('btn-integrante-cancel').addEventListener('click', cancelarEdicaoIntegrante);
    document.getElementById('btn-comodo-cancel').addEventListener('click', cancelarEdicaoComodo);

    // Upload de imagem para cômodo
    document.getElementById('comodo-imagem').addEventListener('change', uploadImagemComodo);
    document.getElementById('btn-comodo-imagem-remover').addEventListener('click', removerImagemComodo);

    // Seletores de cor (para atualizar display de hex)
    document.getElementById('cor-primaria').addEventListener('change', (e) => {
        document.getElementById('cor-primaria-hex').value = e.target.value;
    });
    document.getElementById('cor-secundaria').addEventListener('change', (e) => {
        document.getElementById('cor-secundaria-hex').value = e.target.value;
    });
    document.getElementById('cor-branca').addEventListener('change', (e) => {
        document.getElementById('cor-branca-hex').value = e.target.value;
    });
    document.getElementById('cor-preta').addEventListener('change', (e) => {
        document.getElementById('cor-preta-hex').value = e.target.value;
    });

    // Mostra o nome do arquivo escolhido na área de upload da galeria
    document.getElementById('motivacao-imagem').addEventListener('change', (e) => {
        const file = e.target.files[0];
        document.getElementById('motivacao-imagem-nome').textContent = file ? file.name : 'Toque para selecionar uma imagem';
        e.target.previousElementSibling.classList.toggle('has-file', Boolean(file));
    });

    // Botão gerar escala
    document.getElementById('btn-gerar-escala').addEventListener('click', gerarNovaEscala);
}

// ===== INTEGRANTES =====
async function adicionarOuEditarIntegrante(e) {
    e.preventDefault();

    const integranteId = document.getElementById('integrante-id').value;
    const nome = document.getElementById('integrante-nome').value.trim();
    const isSuite = document.getElementById('integrante-suite').checked;
    const ativo = document.getElementById('integrante-ativo').checked;

    if (!nome) {
        mostrarNotificacao('Digite um nome', 'warning');
        return;
    }

    try {
        if (integranteId) {
            // Edição
            const response = await fetch(`${API_URL}/integrantes/${integranteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, isSuite, ativo })
            });

            if (response.ok) {
                const integranteAtualizado = await response.json();
                const idx = app.integrantes.findIndex(i => i.id == integranteId);
                if (idx !== -1) app.integrantes[idx] = integranteAtualizado;
                cancelarEdicaoIntegrante();
                renderizarIntegrantes();
                mostrarNotificacao(`${nome} atualizado!`, 'success');
            } else {
                const erro = await response.json().catch(() => ({}));
                throw new Error(erro.error || 'Erro ao atualizar integrante');
            }
        } else {
            // Novo
            const response = await fetch(`${API_URL}/integrantes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, isSuite })
            });

            if (response.ok) {
                const novoIntegrante = await response.json();
                app.integrantes.push(novoIntegrante);
                renderizarIntegrantes();
                document.getElementById('form-integrante').reset();
                mostrarNotificacao(`${nome} adicionado!`, 'success');
            } else {
                const erro = await response.json().catch(() => ({}));
                throw new Error(erro.error || 'Erro ao adicionar integrante');
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao salvar integrante', 'error');
    }
}

function editarIntegrante(id) {
    const integrante = app.integrantes.find(i => i.id == id);
    if (!integrante) {
        console.error('Integrante não encontrado:', id);
        return;
    }

    document.getElementById('integrante-id').value = id;
    document.getElementById('integrante-nome').value = integrante.nome;
    document.getElementById('integrante-suite').checked = integrante.isSuite;
    document.getElementById('integrante-ativo').checked = integrante.ativo !== false;
    document.getElementById('integrante-form-titulo').textContent = `Editando: ${integrante.nome}`;
    document.getElementById('btn-integrante-submit').textContent = 'Salvar Alterações';
    document.getElementById('btn-integrante-cancel').style.display = '';
    document.getElementById('form-integrante').classList.add('form-editando');
    app.editandoIntegranteId = String(id);
    renderizarIntegrantes();
    abrirAccordion('acc-integrantes');

    // Scroll para o formulário
    setTimeout(() => {
        document.getElementById('form-integrante').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function cancelarEdicaoIntegrante() {
    document.getElementById('integrante-id').value = '';
    document.getElementById('form-integrante').reset();
    document.getElementById('integrante-form-titulo').textContent = 'Novo integrante';
    document.getElementById('btn-integrante-submit').textContent = 'Adicionar Integrante';
    document.getElementById('btn-integrante-cancel').style.display = 'none';
    document.getElementById('integrante-ativo').checked = true;
    document.getElementById('form-integrante').classList.remove('form-editando');
    app.editandoIntegranteId = null;
    renderizarIntegrantes();
}

async function deletarIntegrante(id) {
    if (!(await mostrarConfirmacao('Tem certeza que deseja remover este integrante?'))) return;

    try {
        const response = await fetch(`${API_URL}/integrantes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            app.integrantes = app.integrantes.filter(i => i.id !== id);
            if (app.editandoIntegranteId === String(id)) cancelarEdicaoIntegrante();
            renderizarIntegrantes();
            mostrarNotificacao('Integrante removido', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Erro ao remover');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao remover', 'error');
    }
}

function renderizarIntegrantes() {
    const container = document.getElementById('integrantes-list');
    container.innerHTML = '';

    if (app.integrantes.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum integrante cadastrado.</p>';
    }

    app.integrantes.forEach(integrante => {
        const inativo = integrante.ativo === false;
        const editando = app.editandoIntegranteId === String(integrante.id);
        const item = document.createElement('div');
        item.className = `list-item ${inativo ? 'inativo' : ''} ${editando ? 'editando' : ''}`;
        item.innerHTML = `
            <div class="list-item-info">
                <span class="list-item-name">${escaparHtml(integrante.nome)}</span>
                <div class="list-item-meta">
                    ${editando ? '<span class="list-item-badge badge-editando"><i class="fa-solid fa-pen"></i> Editando</span>' : ''}
                    ${integrante.isSuite ? '<span class="list-item-badge">Suíte</span>' : ''}
                    <span class="list-item-badge list-item-badge-muted">${inativo ? 'Inativo' : 'Ativo'}</span>
                </div>
            </div>
            <div class="list-item-actions">
                <button class="icon-btn" title="Editar" aria-label="Editar" onclick="editarIntegrante('${integrante.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn danger" title="Remover" aria-label="Remover" onclick="deletarIntegrante('${integrante.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(item);
    });

    // Atualizar select de infrações
    const select = document.getElementById('infracao-integrante');
    select.innerHTML = '<option value="">Selecione o integrante...</option>';
    app.integrantes.forEach(integrante => {
        const option = document.createElement('option');
        option.value = integrante.id;
        option.textContent = integrante.nome;
        select.appendChild(option);
    });
}

// ===== CÔMODOS =====
async function adicionarOuEditarComodo(e) {
    e.preventDefault();

    const comodoId = document.getElementById('comodo-id').value;
    const nome = document.getElementById('comodo-nome').value.trim();
    const apenassuiteMembers = document.getElementById('comodo-suite').checked;
    const obrigatorio = document.getElementById('comodo-obrigatorio').checked;
    const pessoasNecessarias = parseInt(document.getElementById('comodo-pessoas').value) || 1;
    const ordem = parseInt(document.getElementById('comodo-ordem').value) || 0;
    const imagem = app.imagemComodoAtual ?? null;

    if (!nome) {
        mostrarNotificacao('Digite um nome', 'warning');
        return;
    }

    try {
        if (comodoId) {
            // Edição
            const response = await fetch(`${API_URL}/comodos/${comodoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome,
                    imagem,
                    apenassuiteMembers,
                    pessoasNecessarias,
                    obrigatorio,
                    ordem
                })
            });

            if (response.ok) {
                const comodoAtualizado = await response.json();
                const idx = app.comodos.findIndex(c => c.id == comodoId);
                if (idx !== -1) app.comodos[idx] = comodoAtualizado;
                cancelarEdicaoComodo();
                renderizarComodos();
                mostrarNotificacao(`${nome} atualizado!`, 'success');
            } else {
                const erro = await response.json().catch(() => ({}));
                throw new Error(erro.error || 'Erro ao salvar cômodo');
            }
        } else {
            // Novo
            const response = await fetch(`${API_URL}/comodos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, imagem, apenassuiteMembers, pessoasNecessarias, obrigatorio, ordem })
            });

            if (response.ok) {
                const novoComodo = await response.json();
                app.comodos.push(novoComodo);
                renderizarComodos();
                document.getElementById('form-comodo').reset();
                document.getElementById('comodo-pessoas').value = '1';
                document.getElementById('comodo-ordem').value = '0';
                document.getElementById('comodo-obrigatorio').checked = true;
                app.imagemComodoAtual = null;
                document.getElementById('upload-status').textContent = '';
                atualizarPreviewImagemComodo(null);
                mostrarNotificacao(`${nome} adicionado!`, 'success');
            } else {
                const erro = await response.json().catch(() => ({}));
                throw new Error(erro.error || 'Erro ao salvar cômodo');
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao salvar cômodo', 'error');
    }
}

function editarComodo(id) {
    const comodo = app.comodos.find(c => c.id == id);
    if (!comodo) {
        console.error('Comodo não encontrado:', id);
        return;
    }

    document.getElementById('comodo-id').value = id;
    document.getElementById('comodo-nome').value = comodo.nome;
    document.getElementById('comodo-suite').checked = comodo.apenassuiteMembers;
    document.getElementById('comodo-obrigatorio').checked = comodo.obrigatorio !== false;
    document.getElementById('comodo-pessoas').value = comodo.pessoasNecessarias || 1;
    document.getElementById('comodo-ordem').value = comodo.ordem || 0;
    document.getElementById('comodo-form-titulo').textContent = `Editando: ${comodo.nome}`;
    document.getElementById('btn-comodo-submit').textContent = 'Salvar Alterações';
    document.getElementById('btn-comodo-cancel').style.display = '';
    document.getElementById('form-comodo').classList.add('form-editando');
    app.editandoComodoId = String(id);
    renderizarComodos();
    abrirAccordion('acc-comodos');

    app.imagemComodoAtual = comodo.imagem || null;
    atualizarPreviewImagemComodo(app.imagemComodoAtual);
    document.getElementById('upload-status').textContent = '';

    // Scroll para o formulário
    setTimeout(() => {
        document.getElementById('form-comodo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function cancelarEdicaoComodo() {
    document.getElementById('comodo-id').value = '';
    document.getElementById('form-comodo').reset();
    document.getElementById('comodo-form-titulo').textContent = 'Novo cômodo/tarefa';
    document.getElementById('btn-comodo-submit').textContent = 'Adicionar Cômodo';
    document.getElementById('btn-comodo-cancel').style.display = 'none';
    document.getElementById('upload-status').textContent = '';
    document.getElementById('comodo-pessoas').value = '1';
    document.getElementById('comodo-ordem').value = '0';
    document.getElementById('comodo-obrigatorio').checked = true;
    app.imagemComodoAtual = null;
    atualizarPreviewImagemComodo(null);
    document.getElementById('form-comodo').classList.remove('form-editando');
    app.editandoComodoId = null;
    renderizarComodos();
}

function atualizarPreviewImagemComodo(imagemPath) {
    const preview = document.getElementById('comodo-imagem-preview');
    const btnRemover = document.getElementById('btn-comodo-imagem-remover');
    if (!preview || !btnRemover) return;

    if (imagemPath) {
        preview.innerHTML = `<img src="${imagemPath}" alt="Imagem do cômodo">`;
        btnRemover.style.display = '';
    } else {
        preview.innerHTML = '';
        btnRemover.style.display = 'none';
    }
}

function removerImagemComodo() {
    app.imagemComodoAtual = null;
    document.getElementById('comodo-imagem').value = '';
    document.getElementById('upload-status').textContent = '';
    atualizarPreviewImagemComodo(null);
}

async function uploadImagemComodo(e) {
    const file = e.target.files[0];
    if (!file) return;

    const erroValidacao = validarArquivoImagem(file);
    if (erroValidacao) {
        mostrarNotificacao(erroValidacao, 'error');
        e.target.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    document.getElementById('upload-status').textContent = '⏳ Enviando...';

    try {
        const response = await fetch(`${API_URL}/upload-comodo-image`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            app.imagemComodoAtual = data.path;
            atualizarPreviewImagemComodo(data.path);
            document.getElementById('upload-status').textContent = '✅ Imagem selecionada';
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Falha no upload');
        }
    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('upload-status').textContent = '';
        mostrarNotificacao(error.message || 'Erro ao fazer upload', 'error');
    }
}

async function deletarComodo(id) {
    if (!(await mostrarConfirmacao('Tem certeza que deseja remover este cômodo?'))) return;

    try {
        const response = await fetch(`${API_URL}/comodos/${id}`, { method: 'DELETE' });
        if (response.ok) {
            app.comodos = app.comodos.filter(c => c.id !== id);
            if (app.editandoComodoId === String(id)) cancelarEdicaoComodo();
            renderizarComodos();
            mostrarNotificacao('Cômodo removido', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Erro ao remover');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao remover', 'error');
    }
}

function renderizarComodos() {
    const container = document.getElementById('comodos-list');
    container.innerHTML = '';

    if (app.comodos.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum cômodo cadastrado.</p>';
    }

    app.comodos.forEach(comodo => {
        const pessoas = comodo.pessoasNecessarias || 1;
        const editando = app.editandoComodoId === String(comodo.id);
        const item = document.createElement('div');
        item.className = `list-item ${editando ? 'editando' : ''}`;
        item.innerHTML = `
            ${comodo.imagem ? `<img class="list-item-thumb" src="${escaparHtml(comodo.imagem)}" alt="">` : ''}
            <div class="list-item-info">
                <span class="list-item-name">${escaparHtml(comodo.nome)}</span>
                <div class="list-item-meta">
                    ${editando ? '<span class="list-item-badge badge-editando"><i class="fa-solid fa-pen"></i> Editando</span>' : ''}
                    ${comodo.apenassuiteMembers ? '<span class="list-item-badge">Suíte</span>' : ''}
                    <span class="list-item-badge list-item-badge-muted">${comodo.obrigatorio === false ? 'Opcional' : 'Obrigatório'}</span>
                    <span class="list-item-badge list-item-badge-muted">${pessoas} pessoa${pessoas > 1 ? 's' : ''}</span>
                    <span class="list-item-badge list-item-badge-muted">Ordem ${comodo.ordem ?? 0}</span>
                </div>
            </div>
            <div class="list-item-actions">
                <button class="icon-btn" title="Editar" aria-label="Editar" onclick="editarComodo('${comodo.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn danger" title="Remover" aria-label="Remover" onclick="deletarComodo('${comodo.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(item);
    });
}

// ===== ESCALA =====
async function carregarEscalaAtual() {
    try {
        const response = await fetch(`${API_URL}/escala/atual`);
        const escalas = await response.json();

        if (escalas.length === 0) {
            app.escalaAtual = [];
            document.getElementById('escala-container').innerHTML =
                '<div class="card"><p class="empty-state">Nenhuma escala gerada. Toque em "Gerar Nova Escala" para começar!</p></div>';
            atualizarInfoSemana(null);
            renderizarCriticasEscala([]);
            return;
        }

        renderizarEscalaTabela(escalas);
        renderizarCriticasEscala([]);
    } catch (error) {
        console.error('Erro:', error);
    }
}

function atualizarInfoSemana(primeira) {
    const titulo = document.getElementById('semana-titulo');
    const datas = document.getElementById('semana-datas');

    if (!primeira) {
        titulo.textContent = 'Nenhuma escala gerada ainda';
        datas.textContent = '';
        return;
    }

    const dataInicio = new Date(primeira.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dataFim = new Date(primeira.dataFim).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    titulo.textContent = `Semana ${primeira.semana} de ${primeira.ano}`;
    datas.textContent = `${dataInicio} a ${dataFim}`;
}

// `anterior` (opcional): escala de antes de gerar, para destacar quem mudou de tarefa
function renderizarEscalaTabela(escalas, anterior = null) {
    app.escalaAtual = escalas;
    const tarefaAnterior = new Map((anterior || []).map(e => [String(e.integranteId), (e.comodos || []).join('|')]));
    const container = document.getElementById('escala-container');
    container.innerHTML = '';
    const resumoInfracoes = app.infracoes || {};
    const totalFolgas = escalas.filter(escala => Array.isArray(escala.comodos) && escala.comodos.includes('FOLGA')).length;
    const totalXs = Object.values(resumoInfracoes).reduce((sum, dados) => sum + (dados?.total || 0), 0);
    const destaqueMotivacao = app.motivacaoDestaque || app.motivacoes[0]?.path || null;

    atualizarInfoSemana(escalas[0]);

    // Guardado no estado para que renderizarMotivacaoDestaque() redesenhe os chips sobre a imagem
    app.statsEscala = `
        <span class="stat-chip highlight"><i class="fa-solid fa-users"></i> ${escalas.length} pessoas</span>
        <span class="stat-chip"><i class="fa-solid fa-mug-hot"></i> ${totalFolgas} folga${totalFolgas === 1 ? '' : 's'}</span>
        <span class="stat-chip" title="Total acumulado no histórico, não apenas desta semana"><i class="fa-solid fa-xmark"></i> ${totalXs} acumulado${totalXs === 1 ? '' : 's'}</span>
    `;

    const cards = escalas.map(escala => {
        const isFolga = Array.isArray(escala.comodos) && escala.comodos.includes('FOLGA');
        const totalInfracoes = resumoInfracoes[escala.integranteId]?.total || 0;
        const tarefas = Array.isArray(escala.comodos) ? escala.comodos.filter(item => item !== 'FOLGA') : [];

        const mudou = anterior !== null && tarefaAnterior.get(String(escala.integranteId)) !== (escala.comodos || []).join('|');

        const rotulo = isFolga
            ? '<i class="fa-solid fa-mug-hot"></i> Folga'
            : escaparHtml(tarefas.length > 0 ? tarefas.join(' + ') : 'Nenhum cômodo');

        return `
            <article class="escala-card ${isFolga ? 'folga' : ''} ${!isFolga && totalInfracoes > 0 ? 'com-x' : ''} ${anterior !== null ? 'recem-gerado' : ''} ${mudou ? 'mudou' : ''}">
                <div class="escala-card-info">
                    <span class="escala-card-name">
                        ${escaparHtml(escala.integranteNome)}
                        ${totalInfracoes > 0 ? `<span class="escala-card-badge" title="${totalInfracoes} infração(ões) acumulada(s)">${totalInfracoes}X</span>` : ''}
                        ${mudou ? '<span class="escala-card-novo">novo</span>' : ''}
                    </span>
                    <span class="escala-card-comodo ${isFolga ? 'is-folga' : ''}">${rotulo}</span>
                </div>
                ${!isFolga ? `<button class="escala-card-x-btn" title="Marcar X" aria-label="Marcar infração para ${escaparHtml(escala.integranteNome)}" onclick="marcarInfracaoRapido('${escala.integranteId}')"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </article>
        `;
    }).join('');

    container.innerHTML = `
        <div class="escala-dashboard">
            <div id="motivacao-destaque-container" class="motivacao-destaque-container"></div>
            <div class="escala-cards-grid">
                ${cards}
            </div>
        </div>
    `;

    renderizarMotivacaoDestaque(destaqueMotivacao);
    carregarMotivacoes();
}

function renderizarCriticasEscala(criticas, tipo = 'warning') {
    const container = document.getElementById('criticas-escala-container');
    if (!container) return;

    if (!criticas || criticas.length === 0) {
        container.innerHTML = '';
        return;
    }

    const itens = criticas.map(critica => `<li>${escaparHtml(critica)}</li>`).join('');
    container.innerHTML = `
        <div class="criticas-box ${tipo}">
            <h3>⚠️ Críticas da geração</h3>
            <ul>${itens}</ul>
        </div>
    `;
}

async function gerarNovaEscala() {
    if (app.integrantes.length === 0 || app.comodos.length === 0) {
        mostrarNotificacao('Configure integrantes e cômodos primeiro!', 'warning');
        return;
    }

    const confirmar = await mostrarConfirmacao(
        'O rodízio é calculado pelo histórico das semanas anteriores (não é sorteio). Se integrantes e cômodos não mudaram, o resultado desta semana será o mesmo.',
        { titulo: 'Gerar escala desta semana?', confirmarTexto: 'Gerar' }
    );
    if (!confirmar) return;

    const botao = document.getElementById('btn-gerar-escala');
    definirCarregando(botao, true, '⏳ Gerando...');

    try {
        const response = await fetch(`${API_URL}/escala/gerar`, { method: 'POST' });
        if (!response.ok) {
            const erro = await response.json().catch(() => ({}));
            const criticas = Array.isArray(erro.criticas) ? erro.criticas : (erro.error ? [erro.error] : ['Erro ao gerar escala']);
            renderizarCriticasEscala(criticas, 'error');
            throw new Error(erro.error || 'Erro ao gerar escala');
        }
        const resultado = await response.json();

        const { escala: novaEscala, alerta } = resultado;
        const anterior = app.escalaAtual;

        if (resultado.motivacaoDestaque !== undefined) {
            app.motivacaoDestaque = resultado.motivacaoDestaque;
        }
        renderizarEscalaTabela(novaEscala, anterior);
        const criticas = Array.isArray(resultado.criticas) ? resultado.criticas : [];
        renderizarCriticasEscala(criticas, 'warning');

        const mudancas = document.querySelectorAll('#escala-container .escala-card.mudou').length;
        // `alerta` é informativo (quantas folgas e por quê); vai junto da mensagem principal
        const detalhe = alerta ? ` ${alerta}` : '';

        if (criticas.length > 0) {
            mostrarNotificacao('Escala gerada com críticas de configuração', 'warning');
        } else if (anterior.length > 0 && mudancas === 0) {
            mostrarNotificacao(`Escala refeita: a distribuição continua a mesma, pois nada mudou no histórico, integrantes ou cômodos.${detalhe}`, 'info', 6000);
        } else if (anterior.length > 0) {
            mostrarNotificacao(`Escala gerada! ${mudancas === 1 ? '1 pessoa mudou' : `${mudancas} pessoas mudaram`} de tarefa (marcadas como "novo").${detalhe}`, 'success', 6000);
        } else {
            mostrarNotificacao(`Escala gerada com sucesso!${detalhe}`, 'success', 6000);
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao gerar escala', 'error');
    } finally {
        definirCarregando(botao, false);
    }
}

// ===== HISTÓRICO =====
async function carregarHistorico() {
    try {
        const response = await fetch(`${API_URL}/escala/historico`);
        const escalaPorSemana = await response.json();

        const container = document.getElementById('historico-container');
        container.innerHTML = '';

        if (Object.keys(escalaPorSemana).length === 0) {
            container.innerHTML = '<div class="card"><p class="empty-state">Nenhum histórico disponível</p></div>';
            return;
        }

        // Ordenar semanas (mais recentes primeiro)
        const semanas = Object.keys(escalaPorSemana).sort().reverse();

        semanas.forEach(semana => {
            const escalas = escalaPorSemana[semana];
            const primeira = escalas[0];

            const formatarData = (data) => new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
            const periodo = primeira.dataFim
                ? `${formatarData(primeira.dataInicio)} a ${formatarData(primeira.dataFim)}`
                : formatarData(primeira.dataInicio);

            const div = document.createElement('div');
            div.className = 'historico-semana';
            div.innerHTML = `
                <div class="historico-semana-header">
                    <div>
                        <span class="historico-semana-titulo">Semana ${primeira.semana}/${primeira.ano}</span>
                        <span class="historico-semana-datas">${periodo}</span>
                    </div>
                    <button class="icon-btn danger" title="Excluir semana" aria-label="Excluir semana ${primeira.semana}/${primeira.ano}" onclick="deletarHistoricoSemana(${primeira.ano}, ${primeira.semana})"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;

            const itensDiv = document.createElement('div');
            itensDiv.className = 'historico-semana-itens';

            escalas.forEach(escala => {
                const comodos = Array.isArray(escala.comodos) ? escala.comodos : [];
                const isFolga = comodos.includes('FOLGA');
                const item = document.createElement('div');
                item.className = `historico-item ${isFolga ? 'folga' : ''}`;
                item.innerHTML = `
                    <div class="historico-item-comodo">${isFolga ? 'Folga' : (comodos.length > 0 ? escaparHtml(comodos.join(' + ')) : 'Sem cômodos')}</div>
                    <div class="historico-item-integrante">${escaparHtml(escala.integranteNome)}</div>
                `;
                itensDiv.appendChild(item);
            });

            div.appendChild(itensDiv);
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function deletarHistoricoSemana(ano, semana) {
    if (!(await mostrarConfirmacao(`Excluir toda a semana ${semana}/${ano} do histórico?`))) return;

    try {
        const response = await fetch(`${API_URL}/escala/historico/${ano}/${semana}`, { method: 'DELETE' });
        if (response.ok) {
            carregarHistorico();
            carregarEscalaAtual();
            mostrarNotificacao('Histórico excluído', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Não foi possível excluir o histórico');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao excluir histórico', 'error');
    }
}

// ===== INFRAÇÕES =====
async function registrarInfracao(e) {
    e.preventDefault();

    const integranteId = document.getElementById('infracao-integrante').value;
    const descricao = document.getElementById('infracao-descricao').value.trim();
    const integrante = app.integrantes.find(i => i.id == integranteId);

    if (!integranteId || !descricao) {
        mostrarNotificacao('Preencha todos os campos', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/infracoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                integranteId,
                integranteNome: integrante.nome,
                descricao,
                dataSemana: new Date().toISOString()
            })
        });

        if (response.ok) {
            document.getElementById('form-infracao').reset();
            carregarInfracoes();
            mostrarNotificacao('Infração registrada! ❌', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Erro ao registrar');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao registrar', 'error');
    }
}

async function marcarInfracaoRapido(integranteId) {
    const integranteNome = app.integrantes.find(i => String(i.id) === String(integranteId))?.nome || '';
    const descricao = await mostrarPrompt(`Infração de ${integranteNome}:`, '', { titulo: 'Registrar infração', placeholder: 'Descreva brevemente...' });
    if (descricao === null) return;

    if (!descricao.trim()) {
        mostrarNotificacao('Digite uma descrição', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/infracoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                integranteId,
                integranteNome,
                descricao: descricao.trim(),
                dataSemana: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Erro ao registrar');
        }

        mostrarNotificacao('Infração registrada! ❌', 'success');
        // Recarrega a escala também, para o contador de X do card atualizar na hora
        await carregarInfracoes();
        carregarEscalaAtual();
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao registrar', 'error');
    }
}

async function carregarInfracoes() {
    try {
        const response = await fetch(`${API_URL}/infracoes-resumo/todas`);
        const resumo = await response.json();
        app.infracoes = resumo;

        const container = document.getElementById('infracoes-resumo-container');

        if (Object.keys(resumo).length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum integrante ativo</p>';
            return;
        }

        // Ordenar por total de infrações (maior primeiro), depois por nome
        const ids = Object.keys(resumo).sort((a, b) => {
            const diff = resumo[b].total - resumo[a].total;
            if (diff !== 0) return diff;
            return (resumo[a].integranteNome || '').localeCompare(resumo[b].integranteNome || '', 'pt-BR');
        });

        // Mantém abertos os itens que o usuário tinha expandido antes de recarregar
        const abertos = new Set([...container.querySelectorAll('.resumo-item[open]')].map(el => el.dataset.id));
        container.innerHTML = '';

        ids.forEach(id => {
            const dados = resumo[id];
            const div = document.createElement('details');
            div.className = 'resumo-item';
            div.dataset.id = id;
            div.open = abertos.has(id);

            const itens = dados.infracoes.map(inf => `
                <div class="infracao-item">
                    <div>
                        <div class="infracao-descricao">${escaparHtml(inf.descricao)}</div>
                        <div class="infracao-data">${new Date(inf.dataRegistro).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <button class="icon-btn danger" title="Remover infração" aria-label="Remover infração" onclick="deletarInfracao('${inf.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            `).join('');

            div.innerHTML = `
                <summary>
                    <span class="avatar">${escaparHtml(iniciais(dados.integranteNome))}</span>
                    <span class="resumo-nome">${escaparHtml(dados.integranteNome)}</span>
                    <span class="resumo-contador ${dados.total > 0 ? 'tem-infracao' : ''}">${dados.total} ${dados.total === 1 ? 'infração' : 'infrações'}</span>
                    <i class="fa-solid fa-chevron-down resumo-chevron"></i>
                </summary>
                <div class="infracao-lista">
                    ${itens || '<p class="infracao-vazia">Nenhuma infração registrada. 🎉</p>'}
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function deletarInfracao(id) {
    if (!(await mostrarConfirmacao('Remover esta infração?'))) return;

    try {
        const response = await fetch(`${API_URL}/infracoes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            carregarInfracoes();
            mostrarNotificacao('Infração removida', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            mostrarNotificacao(erro.error || 'Erro ao remover infração', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao remover', 'error');
    }
}

// ===== UPLOAD MOTIVACIONAL =====
async function uploadMotivacao(e) {
    e.preventDefault();

    const fileInput = document.getElementById('motivacao-imagem');
    const file = fileInput.files[0];

    if (!file) {
        mostrarNotificacao('Selecione uma imagem', 'warning');
        return;
    }

    const erroValidacao = validarArquivoImagem(file);
    if (erroValidacao) {
        mostrarNotificacao(erroValidacao, 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    const botao = e.target.querySelector('button[type="submit"]');
    definirCarregando(botao, true);

    try {
        const response = await fetch(`${API_URL}/upload-motivacao-image`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            const usarComoDestaque = document.getElementById('motivacao-definir-destaque')?.checked || !app.motivacaoDestaque;
            if (usarComoDestaque) {
                await definirMotivacaoDestaque(data.path, false);
            }
            await carregarMotivacoes();
            document.getElementById('form-motivacao').reset();
            document.getElementById('motivacao-imagem').dispatchEvent(new Event('change'));
            const checkboxDestaque = document.getElementById('motivacao-definir-destaque');
            if (checkboxDestaque) checkboxDestaque.checked = true;
            mostrarNotificacao('Imagem adicionada à galeria! 🎉', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Falha no upload de motivação');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao fazer upload', 'error');
    } finally {
        definirCarregando(botao, false);
    }
}

async function carregarMotivacoes() {
    try {
        const response = await fetch(`${API_URL}/uploads/motivacao`);
        if (!response.ok) {
            throw new Error('Falha ao carregar imagens de motivação');
        }

        const imagens = await response.json();
        app.motivacoes = Array.isArray(imagens) ? imagens : [];

        const destaqueAtual = app.motivacaoDestaque || app.motivacoes[0]?.path || null;
        renderizarMotivacaoDestaque(destaqueAtual);
        renderizarGaleriaMotivacao(app.motivacoes, destaqueAtual);
    } catch (error) {
        console.error('Erro:', error);
        renderizarMotivacaoDestaque(null);
        renderizarGaleriaMotivacao([], null);
    }
}

function renderizarMotivacaoDestaque(imagemPath) {
    const container = document.getElementById('motivacao-destaque-container');
    if (!container) return;

    const stats = app.statsEscala || '';
    container.closest('.escala-dashboard')?.classList.toggle('sem-imagem', !imagemPath);

    if (!imagemPath) {
        container.innerHTML = `<div class="escala-stats">${stats}</div>`;
        return;
    }

    container.innerHTML = `
        <div class="motivacao-destaque-card">
            <img src="${imagemPath}" alt="Imagem de motivação da semana">
            <div class="escala-stats overlay">${stats}</div>
        </div>
    `;
}

function renderizarGaleriaMotivacao(imagens, destaqueAtual) {
    const container = document.getElementById('motivacao-admin-galeria');
    if (!container) return;

    if (!Array.isArray(imagens) || imagens.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhuma imagem de motivação enviada ainda.</p>';
        return;
    }

    container.innerHTML = imagens.map(imagem => {
        const ativo = imagem.path === destaqueAtual;
        return `
            <figure class="motivacao-admin-item ${ativo ? 'active' : ''}">
                <img src="${imagem.path}" alt="Imagem motivacional" loading="lazy">
                <figcaption>
                    <span class="motivacao-admin-status">${ativo ? '★ Em destaque' : 'Galeria'}</span>
                    <div class="motivacao-admin-actions">
                        ${ativo ? '' : `<button type="button" class="btn btn-secondary-color" onclick="definirMotivacaoDestaque('${imagem.path}')">Destacar</button>`}
                        <button type="button" class="btn btn-ghost" title="Excluir" aria-label="Excluir imagem" onclick="excluirMotivacao('${imagem.filename}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </figcaption>
            </figure>
        `;
    }).join('');
}

async function definirMotivacaoDestaque(imagemPath, mostrarFeedback = true) {
    try {
        const response = await fetch(`${API_URL}/config/motivacao-destaque`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: imagemPath })
        });

        if (!response.ok) {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Não foi possível definir o destaque');
        }

        const resultado = await response.json();
        app.config = resultado.config || app.config;
        app.motivacaoDestaque = resultado.motivacaoDestaque || imagemPath;
        await carregarMotivacoes();
        carregarEscalaAtual();
        if (mostrarFeedback) {
            mostrarNotificacao('Imagem de motivação definida em destaque', 'success');
        }
    } catch (error) {
        console.error('Erro:', error);
        if (mostrarFeedback) {
            mostrarNotificacao('Erro ao definir destaque', 'error');
        }
    }
}

async function excluirMotivacao(filename) {
    if (!(await mostrarConfirmacao('Excluir esta imagem da galeria?'))) return;

    try {
        const response = await fetch(`${API_URL}/uploads/motivacao/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Não foi possível excluir a imagem');
        }

        if (app.config?.motivacaoDestaque && app.config.motivacaoDestaque.endsWith(`/${filename}`)) {
            app.config.motivacaoDestaque = null;
            app.motivacaoDestaque = null;
        }

        await carregarMotivacoes();
        carregarEscalaAtual();
        mostrarNotificacao('Imagem excluída', 'success');
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao excluir imagem', 'error');
    }
}

// ===== NOTIFICAÇÕES =====
const ICONES_NOTIFICACAO = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
};

function mostrarNotificacao(mensagem, tipo = 'info', duracao = 3000) {
    const area = document.getElementById('toast-area');
    const notification = document.createElement('div');
    notification.className = `toast toast-${ICONES_NOTIFICACAO[tipo] ? tipo : 'info'}`;
    notification.setAttribute('role', tipo === 'error' ? 'alert' : 'status');

    const icone = document.createElement('i');
    icone.className = `fa-solid ${ICONES_NOTIFICACAO[tipo] || ICONES_NOTIFICACAO.info}`;
    const texto = document.createElement('span');
    texto.textContent = mensagem;
    notification.append(icone, texto);

    area.appendChild(notification);

    const fechar = () => {
        notification.classList.add('saindo');
        setTimeout(() => notification.remove(), 250);
    };
    notification.addEventListener('click', fechar);
    setTimeout(fechar, duracao);
}

// ===== VERSÃO EM EXECUÇÃO =====
async function carregarVersao() {
    const container = document.getElementById('versao-info');
    try {
        const versao = await fetch(`${API_URL}/versao`, { cache: 'no-store' }).then(r => r.json());
        if (!versao.sha) {
            container.innerHTML = '<p>Versão não identificada.</p>';
            return;
        }

        const shaCurto = escaparHtml(versao.sha.slice(0, 7));
        const commit = versao.url
            ? `<a href="${escaparHtml(versao.url)}" target="_blank" rel="noopener"><code>${shaCurto}</code></a>`
            : `<code>${shaCurto}</code>`;
        const data = versao.data
            ? new Date(versao.data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : null;

        container.innerHTML = `
            <p><strong>Ambiente:</strong> ${escaparHtml(versao.ambiente)}</p>
            <p><strong>Commit:</strong> ${commit}${versao.branch ? ` (${escaparHtml(versao.branch)})` : ''}</p>
            ${versao.mensagem ? `<p><strong>Mensagem:</strong> ${escaparHtml(versao.mensagem)}</p>` : ''}
            ${versao.autor ? `<p><strong>Autor:</strong> ${escaparHtml(versao.autor)}</p>` : ''}
            ${data ? `<p><strong>Data:</strong> ${escaparHtml(data)}</p>` : ''}
        `;
    } catch (error) {
        console.error('Erro ao carregar versão:', error);
        container.innerHTML = '<p>Não foi possível carregar a versão.</p>';
    }
}

// ===== CONFIGURAÇÕES (LOGO E CORES) =====
async function carregarConfig() {
    try {
        const config = await fetch(`${API_URL}/config`).then(r => r.json());
        app.config = config;
        app.motivacaoDestaque = config.motivacaoDestaque || null;

        aplicarLogo(config.logo);
        aplicarFundo(config.background);
        
        // Carregar logo
        if (config.logo) {
            const preview = document.getElementById('logo-preview');
            preview.innerHTML = `
                <img src="${config.logo}" alt="Logo da república">
                <p>Logo atual</p>
            `;
        } else {
            document.getElementById('logo-preview').innerHTML = '<p class="empty-state">Nenhuma logo definida</p>';
        }

        if (config.background) {
            document.getElementById('background-preview').innerHTML = `
                <img src="${config.background}" alt="Fundo da aplicação">
                <p>Fundo atual</p>
            `;
        } else {
            document.getElementById('background-preview').innerHTML = '<p class="empty-state">Nenhum fundo definido</p>';
        }
        
        // Carregar cores
        if (config.cores) {
            document.getElementById('cor-primaria').value = config.cores.primaria || '#DC0000';
            document.getElementById('cor-primaria-hex').value = config.cores.primaria || '#DC0000';
            
            document.getElementById('cor-secundaria').value = config.cores.secundaria || '#FFD700';
            document.getElementById('cor-secundaria-hex').value = config.cores.secundaria || '#FFD700';
            
            document.getElementById('cor-branca').value = config.cores.branca || '#FFFFFF';
            document.getElementById('cor-branca-hex').value = config.cores.branca || '#FFFFFF';
            
            document.getElementById('cor-preta').value = config.cores.preta || '#000000';
            document.getElementById('cor-preta-hex').value = config.cores.preta || '#000000';
            
            aplicarCores(config.cores);
        }
    } catch (error) {
        console.error('Erro ao carregar config:', error);
    }
}

function aplicarLogo(logoPath) {
    const logoTop = document.getElementById('logo-top');
    if (logoTop) {
        logoTop.src = logoPath || LOGO_PADRAO;
    }
}

function aplicarFundo(backgroundPath) {
    document.documentElement.style.setProperty('--app-background-image', backgroundPath ? `url("${backgroundPath}")` : 'none');
}

function aplicarCores(cores) {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', cores.primaria || '#DC0000');
    root.style.setProperty('--secondary-color', cores.secundaria || '#FFD700');
    root.style.setProperty('--light-color', cores.branca || '#FFFFFF');
    root.style.setProperty('--dark-color', cores.preta || '#000000');
    root.style.setProperty('--danger-color', cores.primaria || '#DC0000');
    root.style.setProperty('--border-color', cores.primaria || '#DC0000');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cores.primaria || '#DC0000');
}

async function uploadLogo(e) {
    e.preventDefault();
    
    const file = document.getElementById('logo-upload').files[0];
    if (!file) {
        mostrarNotificacao('Selecione um arquivo', 'warning');
        return;
    }

    const erroValidacao = validarArquivoImagem(file);
    if (erroValidacao) {
        mostrarNotificacao(erroValidacao, 'error');
        return;
    }

    const formData = new FormData();
    formData.append('logo', file);

    const botao = e.target.querySelector('button[type="submit"]');
    definirCarregando(botao, true);

    try {
        const response = await fetch(`${API_URL}/config/logo`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const resultado = await response.json();
            app.config = resultado.config || app.config;
            aplicarLogo(resultado.logo);
            
            // Atualizar preview
            const preview = document.getElementById('logo-preview');
            preview.innerHTML = `
                <img src="${resultado.logo}" alt="Logo da república">
                <p>Logo atualizado com sucesso!</p>
            `;
            
            document.getElementById('form-logo').reset();
            mostrarNotificacao('Logo enviado com sucesso!', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Falha no upload da logo');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao enviar logo', 'error');
    } finally {
        definirCarregando(botao, false);
    }
}

async function uploadBackground(e) {
    e.preventDefault();

    const file = document.getElementById('background-upload').files[0];
    if (!file) {
        mostrarNotificacao('Selecione uma imagem', 'warning');
        return;
    }

    const erroValidacao = validarArquivoImagem(file);
    if (erroValidacao) {
        mostrarNotificacao(erroValidacao, 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    const botao = e.target.querySelector('button[type="submit"]');
    definirCarregando(botao, true);

    try {
        const response = await fetch(`${API_URL}/config/background`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const resultado = await response.json();
            app.config = resultado.config || app.config;
            aplicarFundo(resultado.background);

            const preview = document.getElementById('background-preview');
            preview.innerHTML = `
                <img src="${resultado.background}" alt="Fundo da aplicação">
                <p>Fundo atualizado com sucesso!</p>
            `;

            document.getElementById('form-background').reset();
            mostrarNotificacao('Fundo enviado com sucesso!', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Falha no upload do fundo');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao enviar fundo', 'error');
    } finally {
        definirCarregando(botao, false);
    }
}

async function salvarCores(e) {
    e.preventDefault();
    
    const cores = {
        primaria: document.getElementById('cor-primaria').value,
        secundaria: document.getElementById('cor-secundaria').value,
        branca: document.getElementById('cor-branca').value,
        preta: document.getElementById('cor-preta').value
    };
    
    try {
        const response = await fetch(`${API_URL}/config/cores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cores })
        });
        
        if (response.ok) {
            aplicarCores(cores);
            mostrarNotificacao('Cores salvas com sucesso!', 'success');
        } else {
            const erro = await response.json().catch(() => ({}));
            throw new Error(erro.error || 'Erro ao salvar cores');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao(error.message || 'Erro ao salvar cores', 'error');
    }
}

function resetarCores() {
    const coresDefault = {
        primaria: '#DC0000',
        secundaria: '#FFD700',
        branca: '#FFFFFF',
        preta: '#000000'
    };
    
    document.getElementById('cor-primaria').value = coresDefault.primaria;
    document.getElementById('cor-primaria-hex').value = coresDefault.primaria;
    
    document.getElementById('cor-secundaria').value = coresDefault.secundaria;
    document.getElementById('cor-secundaria-hex').value = coresDefault.secundaria;
    
    document.getElementById('cor-branca').value = coresDefault.branca;
    document.getElementById('cor-branca-hex').value = coresDefault.branca;
    
    document.getElementById('cor-preta').value = coresDefault.preta;
    document.getElementById('cor-preta-hex').value = coresDefault.preta;
    
    aplicarCores(coresDefault);
    mostrarNotificacao('Cores restauradas ao padrão', 'info');
}
