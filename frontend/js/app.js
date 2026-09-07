// API Base URL — usa o próprio host (funciona em localhost e em produção/Vercel, onde /api roda como serverless function)
const API_URL = `${window.location.origin}/api`;

// Estado da aplicação
const app = {
    integrantes: [],
    comodos: [],
    escalas: [],
    infracoes: [],
    motivacoes: [],
    motivacaoDestaque: null,
    config: {},
    imagemComodoAtual: null,
    comodoEmEdicao: null,
    integranteEmEdicao: null
};

const LOGO_PADRAO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="95" fill="%23FFD700" stroke="%23000" stroke-width="4"/><rect x="40" y="50" width="120" height="100" fill="%23DC0000"/><text x="100" y="130" font-size="80" font-weight="bold" text-anchor="middle" font-family="Arial" fill="%23FFD700">B</text><circle cx="75" cy="75" r="15" fill="%23FFF"/><circle cx="125" cy="75" r="15" fill="%23FFF"/><circle cx="75" cy="80" r="8" fill="%23000"/><circle cx="125" cy="80" r="8" fill="%23000"/></svg>';

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    atualizarModoVisual('escala');
    carregarConfig();
    carregarDados();
    setupEventListeners();
    setupTabs();
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

    atualizarModoVisual(tabName);

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
}

function atualizarModoVisual(tabName) {
    document.body.classList.toggle('scale-view', tabName === 'escala');
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
        botao.dataset.textoOriginal = botao.dataset.textoOriginal || botao.textContent;
        botao.disabled = true;
        botao.textContent = textoCarregando;
    } else {
        botao.disabled = false;
        botao.textContent = botao.dataset.textoOriginal || botao.textContent;
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
    document.getElementById('btn-integrante-submit').textContent = '✏️ Salvar Alterações';
    document.getElementById('btn-integrante-cancel').style.display = 'inline-block';
    
    app.integranteEmEdicao = id;
    
    // Scroll para o formulário
    setTimeout(() => {
        document.getElementById('form-integrante').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function cancelarEdicaoIntegrante() {
    document.getElementById('integrante-id').value = '';
    document.getElementById('form-integrante').reset();
    document.getElementById('btn-integrante-submit').textContent = 'Adicionar Integrante';
    document.getElementById('btn-integrante-cancel').style.display = 'none';
    document.getElementById('integrante-ativo').checked = true;
    app.integranteEmEdicao = null;
}

async function deletarIntegrante(id) {
    if (!(await mostrarConfirmacao('Tem certeza que deseja remover este integrante?'))) return;

    try {
        const response = await fetch(`${API_URL}/integrantes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            app.integrantes = app.integrantes.filter(i => i.id !== id);
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

    app.integrantes.forEach(integrante => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div>
                <span class="list-item-name">${integrante.nome}</span>
                ${integrante.isSuite ? '<span class="list-item-badge">Suite</span>' : ''}
                ${integrante.ativo === false ? '<span class="list-item-badge list-item-badge-muted">Inativo</span>' : '<span class="list-item-badge list-item-badge-muted">Ativo</span>'}
            </div>
            <div class="list-item-actions">
                <button class="btn btn-secondary" onclick="editarIntegrante('${integrante.id}')">✏️</button>
                <button class="btn btn-danger" onclick="deletarIntegrante('${integrante.id}')">🗑️</button>
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
    const permitirMultiplasAtribuicoes = document.getElementById('comodo-multiplas').checked;
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
                    permitirMultiplasAtribuicoes,
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
                body: JSON.stringify({ nome, imagem, apenassuiteMembers, pessoasNecessarias, obrigatorio, permitirMultiplasAtribuicoes, ordem })
            });

            if (response.ok) {
                const novoComodo = await response.json();
                app.comodos.push(novoComodo);
                renderizarComodos();
                document.getElementById('form-comodo').reset();
                document.getElementById('comodo-pessoas').value = '1';
                document.getElementById('comodo-ordem').value = '0';
                document.getElementById('comodo-obrigatorio').checked = true;
                document.getElementById('comodo-multiplas').checked = false;
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
    console.log('Editando comodo:', id); // Debug
    const comodo = app.comodos.find(c => c.id == id);
    if (!comodo) {
        console.error('Comodo não encontrado:', id);
        return;
    }

    document.getElementById('comodo-id').value = id;
    document.getElementById('comodo-nome').value = comodo.nome;
    document.getElementById('comodo-suite').checked = comodo.apenassuiteMembers;
    document.getElementById('comodo-obrigatorio').checked = comodo.obrigatorio !== false;
    document.getElementById('comodo-multiplas').checked = !!comodo.permitirMultiplasAtribuicoes;
    document.getElementById('comodo-pessoas').value = comodo.pessoasNecessarias || 1;
    document.getElementById('comodo-ordem').value = comodo.ordem || 0;
    document.getElementById('btn-comodo-submit').textContent = '✏️ Salvar Alterações';
    document.getElementById('btn-comodo-cancel').style.display = 'inline-block';

    app.imagemComodoAtual = comodo.imagem || null;
    atualizarPreviewImagemComodo(app.imagemComodoAtual);
    document.getElementById('upload-status').textContent = '';

    app.comodoEmEdicao = id;

    // Scroll para o formulário
    setTimeout(() => {
        document.getElementById('form-comodo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function cancelarEdicaoComodo() {
    document.getElementById('comodo-id').value = '';
    document.getElementById('form-comodo').reset();
    document.getElementById('btn-comodo-submit').textContent = 'Adicionar Cômodo';
    document.getElementById('btn-comodo-cancel').style.display = 'none';
    document.getElementById('upload-status').textContent = '';
    document.getElementById('comodo-pessoas').value = '1';
    document.getElementById('comodo-ordem').value = '0';
    document.getElementById('comodo-obrigatorio').checked = true;
    document.getElementById('comodo-multiplas').checked = false;
    app.imagemComodoAtual = null;
    app.comodoEmEdicao = null;
    atualizarPreviewImagemComodo(null);
}

function atualizarPreviewImagemComodo(imagemPath) {
    const preview = document.getElementById('comodo-imagem-preview');
    const btnRemover = document.getElementById('btn-comodo-imagem-remover');
    if (!preview || !btnRemover) return;

    if (imagemPath) {
        preview.innerHTML = `<img src="${imagemPath}" alt="Imagem do cômodo">`;
        btnRemover.style.display = 'inline-block';
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

    app.comodos.forEach(comodo => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div>
                <span class="list-item-name">${comodo.nome}</span>
                ${comodo.apenassuiteMembers ? '<span class="list-item-badge">Suite</span>' : ''}
                ${comodo.obrigatorio === false ? '<span class="list-item-badge list-item-badge-muted">Opcional</span>' : ''}
                ${comodo.permitirMultiplasAtribuicoes ? '<span class="list-item-badge list-item-badge-muted">Múltiplas</span>' : ''}
                <span class="list-item-badge list-item-badge-muted">Ordem ${comodo.ordem ?? 0}</span>
            </div>
            <div class="list-item-actions">
                <button class="btn btn-secondary" onclick="editarComodo('${comodo.id}')">✏️</button>
                <button class="btn btn-danger" onclick="deletarComodo('${comodo.id}')">🗑️</button>
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
        app.escalas = escalas;

        if (escalas.length === 0) {
            document.getElementById('escala-container').innerHTML =
                '<p style="grid-column: 1/-1; text-align: center; color: #999;">Nenhuma escala gerada. Clique em "Gerar Nova Escala" para começar!</p>';
            document.getElementById('semana-info').textContent = 'Nenhuma escala gerada ainda';
            renderizarCriticasEscala([]);
            return;
        }

        // Pegar info da semana
        const primeira = escalas[0];
        const dataInicio = new Date(primeira.dataInicio).toLocaleDateString('pt-BR');
        const dataFim = new Date(primeira.dataFim).toLocaleDateString('pt-BR');
        document.getElementById('semana-info').textContent =
            `📅 Semana ${primeira.semana} de ${primeira.ano} (${dataInicio} a ${dataFim})`;

        renderizarEscalaTabela(escalas);
        renderizarCriticasEscala([]);
    } catch (error) {
        console.error('Erro:', error);
    }
}

function renderizarEscalaTabela(escalas) {
    const container = document.getElementById('escala-container');
    container.innerHTML = '';
    const resumoInfracoes = app.infracoes || {};
    const totalFolgas = escalas.filter(escala => Array.isArray(escala.comodos) && escala.comodos.includes('FOLGA')).length;
    const totalXs = Object.values(resumoInfracoes).reduce((sum, dados) => sum + (dados?.total || 0), 0);
    const destaqueMotivacao = app.motivacaoDestaque || app.motivacoes[0]?.path || null;

    const cards = escalas.map(escala => {
        const isFolga = Array.isArray(escala.comodos) && escala.comodos.includes('FOLGA');
        const totalInfracoes = resumoInfracoes[escala.integranteId]?.total || 0;
        const tarefas = Array.isArray(escala.comodos) ? escala.comodos.filter(item => item !== 'FOLGA') : [];

        const rotulo = isFolga
            ? '😴 Folga'
            : (tarefas.length > 0 ? tarefas.join(', ').toUpperCase() : 'Nenhum cômodo');

        return `
            <article class="escala-card ${isFolga ? 'folga' : ''}">
                <div class="escala-card-info">
                    <span class="escala-card-name">${escala.integranteNome}</span>
                    <span class="escala-card-comodo ${isFolga ? 'is-folga' : ''}">- ${rotulo}</span>
                </div>
                <div class="escala-card-right">
                    <span class="escala-card-badge ${isFolga ? 'folga' : ''}" title="${totalInfracoes} infração(ões)">${totalInfracoes}</span>
                    ${!isFolga ? `<button class="escala-card-x-btn" title="Marcar X" onclick="marcarInfracaoRapido('${escala.integranteId}', '${escala.integranteNome}')">❌</button>` : ''}
                </div>
            </article>
        `;
    }).join('');

    const html = `
        <div class="escala-dashboard">
            <div class="escala-dashboard-header">
                <h3 class="escala-dashboard-title">Escala da semana</h3>
                <div class="escala-dashboard-stats">
                    <span class="stat-chip">${escalas.length} pessoas</span>
                    <span class="stat-chip">${totalFolgas} folga(s)</span>
                    <span class="stat-chip" title="Total acumulado no histórico, não apenas desta semana">${totalXs} X(s) acumulados</span>
                </div>
            </div>
            <div id="motivacao-destaque-container" class="motivacao-destaque-container">
                ${destaqueMotivacao ? `<div class="motivacao-destaque-card"><img src="${destaqueMotivacao}" alt="Imagem de motivação da semana"></div>` : '<p class="empty-state">Sem imagem</p>'}
            </div>
            <div class="escala-cards-grid">
                ${cards}
            </div>
        </div>
    `;

    container.innerHTML = html;
    carregarMotivacoes();
}

function renderizarCriticasEscala(criticas, tipo = 'warning') {
    const container = document.getElementById('criticas-escala-container');
    if (!container) return;

    if (!criticas || criticas.length === 0) {
        container.innerHTML = '';
        return;
    }

    const itens = criticas.map(critica => `<li>${critica}</li>`).join('');
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

    if (!(await mostrarConfirmacao('Gerar nova escala para esta semana?'))) return;

    const botao = document.getElementById('btn-gerar-escala');
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = '⏳ Gerando...';

    try {
        const response = await fetch(`${API_URL}/escala/gerar`, { method: 'POST' });
        if (!response.ok) {
            const erro = await response.json().catch(() => ({}));
            const criticas = Array.isArray(erro.criticas) ? erro.criticas : (erro.error ? [erro.error] : ['Erro ao gerar escala']);
            renderizarCriticasEscala(criticas, 'error');
            throw new Error(erro.error || 'Erro ao gerar escala');
        }
        const resultado = await response.json();

        // Processar novo formato: pode vir como array ou com { escala, alerta }
        let novaEscala, alerta;
        if (Array.isArray(resultado)) {
            novaEscala = resultado;
            alerta = null;
        } else {
            novaEscala = resultado.escala;
            alerta = resultado.alerta;
        }

        app.escalas = novaEscala;
        if (!Array.isArray(resultado) && resultado.motivacaoDestaque !== undefined) {
            app.motivacaoDestaque = resultado.motivacaoDestaque;
        }
        renderizarEscalaTabela(novaEscala);
        const criticas = Array.isArray(resultado.criticas) ? resultado.criticas : [];
        renderizarCriticasEscala(criticas, 'warning');

        // Mostrar alerta se houver
        if (alerta) {
            mostrarNotificacao(alerta, 'warning');
        } else if (criticas.length > 0) {
            mostrarNotificacao('Escala gerada com críticas de configuração', 'warning');
        } else {
            mostrarNotificacao('Escala gerada com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao gerar escala', 'error');
    } finally {
        botao.disabled = false;
        botao.textContent = textoOriginal;
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
            container.innerHTML = '<p style="text-align: center; color: #999;">Nenhum histórico disponível</p>';
            return;
        }

        // Ordenar semanas (mais recentes primeiro)
        const semanas = Object.keys(escalaPorSemana).sort().reverse();

        semanas.forEach(semana => {
            const escalas = escalaPorSemana[semana];
            const primeira = escalas[0];

            const div = document.createElement('div');
            div.className = 'historico-semana';
            div.innerHTML = `
                <div class="historico-semana-header">
                    <h4>Semana ${primeira.semana}/${primeira.ano} - ${new Date(primeira.dataInicio).toLocaleDateString('pt-BR')}</h4>
                    <button class="btn btn-danger" onclick="deletarHistoricoSemana(${primeira.ano}, ${primeira.semana})">Excluir semana</button>
                </div>
            `;

            const itensDiv = document.createElement('div');
            itensDiv.className = 'historico-semana-itens';

            escalas.forEach(escala => {
                const item = document.createElement('div');
                item.className = 'historico-item';
                item.innerHTML = `
                    <div class="historico-item-comodo">${Array.isArray(escala.comodos) ? escala.comodos.join(', ') : 'Sem cômodos'}</div>
                    <div class="historico-item-integrante">${escala.integranteNome}</div>
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

async function marcarInfracaoRapido(integranteId, integranteNome) {
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
        carregarInfracoes();
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
        container.innerHTML = '';

        if (Object.keys(resumo).length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999;">Nenhuma infração registrada</p>';
            return;
        }

        // Ordenar por total de infrações (maior primeiro), depois por nome
        const ids = Object.keys(resumo).sort((a, b) => {
            const diff = resumo[b].total - resumo[a].total;
            if (diff !== 0) return diff;
            return (resumo[a].integranteNome || '').localeCompare(resumo[b].integranteNome || '', 'pt-BR');
        });

        ids.forEach(id => {
            const dados = resumo[id];
            const div = document.createElement('div');
            div.className = 'resumo-item';

            let html = `
                <div class="resumo-nome">
                    ${dados.integranteNome}
                    <span class="resumo-contador">${dados.total}</span>
                </div>
                <div class="infracao-lista">
            `;

            dados.infracoes.forEach(inf => {
                html += `
                    <div class="infracao-item">
                        <div>
                            <div class="infracao-descricao">• ${inf.descricao}</div>
                            <div class="infracao-data">${new Date(inf.dataRegistro).toLocaleDateString('pt-BR')}</div>
                        </div>
                        <button class="btn btn-danger" onclick="deletarInfracao('${inf.id}')">🗑️</button>
                    </div>
                `;
            });

            html += '</div>';
            div.innerHTML = html;
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
        renderizarMotivacaoDestaque(destaqueAtual, app.motivacoes);
        renderizarGaleriaMotivacao(app.motivacoes, destaqueAtual);
    } catch (error) {
        console.error('Erro:', error);
        renderizarMotivacaoDestaque(null, []);
        renderizarGaleriaMotivacao([], null);
    }
}

function renderizarMotivacaoDestaque(imagemPath, imagens = []) {
    const container = document.getElementById('motivacao-destaque-container');
    if (!container) return;

    if (!imagemPath) {
        container.innerHTML = '<p class="empty-state">Sem imagem</p>';
        return;
    }

    container.innerHTML = `
        <div class="motivacao-destaque-card">
            <img src="${imagemPath}" alt="Imagem de motivação da semana">
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

    container.innerHTML = imagens.map(imagem => `
        <figure class="motivacao-admin-item ${imagem.path === destaqueAtual ? 'active' : ''}">
            <img src="${imagem.path}" alt="Imagem motivacional">
            <figcaption>
                <span>${imagem.path === destaqueAtual ? 'Destaque' : 'Galeria'}</span>
                <div class="motivacao-admin-actions">
                    <button type="button" class="btn btn-secondary" onclick="definirMotivacaoDestaque('${imagem.path}')">Destacar</button>
                    <button type="button" class="btn btn-danger" onclick="excluirMotivacao('${imagem.filename}')">Excluir</button>
                </div>
            </figcaption>
        </figure>
    `).join('');
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
function mostrarNotificacao(mensagem, tipo = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 9999;
        animation: slideIn 0.3s ease-in;
        max-width: 300px;
    `;

    const cores = {
        'success': '#51cf66',
        'error': '#ff6b6b',
        'warning': '#ffd43b',
        'info': '#6c63ff'
    };

    notification.style.background = cores[tipo] || cores['info'];
    notification.textContent = mensagem;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Adicionar estilos de animação
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

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
                <p style="margin-top: 10px; font-size: 12px; color: #666;">Logo atual</p>
            `;
        } else {
            document.getElementById('logo-preview').innerHTML = '<p style="color: #999; font-size: 14px;">Nenhuma logo definida</p>';
        }

        if (config.background) {
            document.getElementById('background-preview').innerHTML = `
                <img src="${config.background}" alt="Fundo da aplicação">
                <p style="margin-top: 10px; font-size: 12px; color: #666;">Fundo atual</p>
            `;
        } else {
            document.getElementById('background-preview').innerHTML = '<p style="color: #999; font-size: 14px;">Nenhum fundo definido</p>';
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
                <p style="margin-top: 10px; font-size: 12px; color: #666;">Logo atualizado com sucesso!</p>
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
                <p style="margin-top: 10px; font-size: 12px; color: #666;">Fundo atualizado com sucesso!</p>
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
