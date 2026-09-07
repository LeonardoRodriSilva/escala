// Substitui confirm()/prompt() nativos por modais no tema da aplicação.
function criarOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';

    const card = document.createElement('div');
    card.className = 'app-modal-card';
    overlay.appendChild(card);

    document.body.appendChild(overlay);
    // Força reflow antes de adicionar a classe de transição de entrada
    requestAnimationFrame(() => overlay.classList.add('visible'));

    return { overlay, card };
}

function fecharOverlay(overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 150);
}

function mostrarConfirmacao(mensagem, { titulo = 'Confirmar ação', confirmarTexto = 'Confirmar', cancelarTexto = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        const { overlay, card } = criarOverlay();

        card.innerHTML = `
            <h3 class="app-modal-title">${titulo}</h3>
            <p class="app-modal-message"></p>
            <div class="app-modal-actions">
                <button type="button" class="btn btn-secondary" data-action="cancelar">${cancelarTexto}</button>
                <button type="button" class="btn btn-danger" data-action="confirmar">${confirmarTexto}</button>
            </div>
        `;
        card.querySelector('.app-modal-message').textContent = mensagem;

        const resolver = (valor) => {
            fecharOverlay(overlay);
            document.removeEventListener('keydown', onKeydown);
            resolve(valor);
        };

        const onKeydown = (e) => {
            if (e.key === 'Escape') resolver(false);
            if (e.key === 'Enter' && document.activeElement === botaoConfirmar) resolver(true);
        };

        const botaoConfirmar = card.querySelector('[data-action="confirmar"]');
        const botaoCancelar = card.querySelector('[data-action="cancelar"]');
        botaoCancelar.addEventListener('click', () => resolver(false));
        botaoConfirmar.addEventListener('click', () => resolver(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) resolver(false);
        });
        document.addEventListener('keydown', onKeydown);

        botaoCancelar.focus();
    });
}

function mostrarPrompt(mensagem, valorInicial = '', { titulo = 'Informe um valor', confirmarTexto = 'Confirmar', cancelarTexto = 'Cancelar', placeholder = '' } = {}) {
    return new Promise((resolve) => {
        const { overlay, card } = criarOverlay();

        card.innerHTML = `
            <h3 class="app-modal-title">${titulo}</h3>
            <p class="app-modal-message"></p>
            <textarea class="app-modal-input" rows="3"></textarea>
            <div class="app-modal-actions">
                <button type="button" class="btn btn-secondary" data-action="cancelar">${cancelarTexto}</button>
                <button type="button" class="btn btn-success" data-action="confirmar">${confirmarTexto}</button>
            </div>
        `;
        card.querySelector('.app-modal-message').textContent = mensagem;
        const input = card.querySelector('.app-modal-input');
        input.value = valorInicial || '';
        input.placeholder = placeholder;

        const resolver = (valor) => {
            fecharOverlay(overlay);
            document.removeEventListener('keydown', onKeydown);
            resolve(valor);
        };

        const onKeydown = (e) => {
            if (e.key === 'Escape') resolver(null);
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                resolver(input.value);
            }
        };

        card.querySelector('[data-action="cancelar"]').addEventListener('click', () => resolver(null));
        card.querySelector('[data-action="confirmar"]').addEventListener('click', () => resolver(input.value));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) resolver(null);
        });
        document.addEventListener('keydown', onKeydown);

        setTimeout(() => input.focus(), 0);
    });
}
