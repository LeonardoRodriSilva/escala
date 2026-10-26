# 🏗️ Arquitetura do Sistema

O **Escala** é uma aplicação monolítica leve: um servidor Node.js/Express expõe uma API REST e serve o frontend em JavaScript puro. Dados e imagens ficam no Supabase.

---

## 📐 Visão Geral

```
+-------------------------------------------------------+
|                   Navegador (SPA)                     |
|     index.html + style.css + app.js + modal.js        |
+---------------------------+---------------------------+
                            |
                    HTTP / JSON (REST /api)
                            |
+---------------------------v---------------------------+
|                Backend Node.js (server.js)            |
|                                                       |
|  Express Router ── lib/rodizio.js (gera a escala)     |
|        │                                              |
|        ├── data/store.js ──────┐                      |
|        └── lib/storage.js ──┐  │   Multer (memória)   |
+-----------------------------|--|----------------------+
                              |  |
               +--------------v--v--------------+
               |            Supabase            |
               |  Storage (bucket "uploads")    |
               |  Postgres (tabelas do app)     |
               +--------------------------------+
```

Em produção, a Vercel roda `backend/server.js` como função serverless para `/api/*` e serve `frontend/` como arquivos estáticos (veja `vercel.json`). Localmente, o próprio Express serve o frontend.

---

## ⚙️ Backend

- **Runtime**: Node.js com ES Modules (`"type": "module"`).
- **Framework**: Express, na porta `3000` ou na variável `PORT`.
- **Persistência** (`backend/data/store.js`): um objeto por tabela (`IntegrantesStore`, `ComodosStore`, `EscalasStore`, `InfracoesStore`, `ConfigStore`) que converte entre o formato do banco (`snake_case`) e o da API (`camelCase`).
  - A troca da escala de uma semana (`replaceSemana`) usa a função Postgres `replace_semana_escala`, que apaga e insere numa única transação.
  - Trocas e renomeações gravam várias linhas num único `upsert`.
- **Imagens** (`backend/lib/storage.js`): o Multer recebe o arquivo em memória (png, jpg, jpeg, webp ou gif, até 5MB) e ele é enviado ao bucket `uploads` do Supabase Storage. O banco guarda a URL pública.
- **Fuso horário**: a "semana atual" é calculada no horário de Brasília (`America/Sao_Paulo`), seguindo a semana ISO 8601 (segunda a domingo). A Vercel roda em UTC, então isso não depende do servidor.

### Algoritmo do Rodízio (`backend/lib/rodizio.js`)

Nada é sorteado: cada semana é calculada a partir do histórico das anteriores.

1. **Vagas**: cada cômodo obrigatório gera `pessoasNecessarias` vagas. Cômodos marcados como "apenas suíte" geram vagas da suíte.
2. **Folgas**: `integrantes ativos − total de vagas`. Vão para quem está há mais tempo sem folgar (empate: ordem alfabética), sem deixar a suíte sem morador para o banheiro dela.
3. **Banheiro da suíte**: o morador da suíte há mais tempo sem fazê-lo, entre quem não está de folga.
4. **Demais cômodos**: cada pessoa vai para o cômodo seguinte ao último que fez, na ordem configurada (campo `ordem`). Se ele já estiver ocupado, vai para o próximo livre. Quem trabalhou num cômodo comum na semana anterior escolhe primeiro.

Se houver mais vagas que pessoas, ou mais vagas da suíte que moradores da suíte, a geração retorna erro em vez de dar dois cômodos à mesma pessoa.

O histórico identifica cômodos pelo **nome**: por isso não é permitido ter dois cômodos com o mesmo nome, e renomear um cômodo atualiza o nome em todas as escalas antigas.

---

## 🎨 Frontend

- **SPA**: uma página HTML com navegação por abas, sem recarregar.
- **Abas**:
  - `escala`: escala da semana, imagem motivacional em destaque e botão de gerar.
  - `historico`: escalas das semanas anteriores.
  - `infracoes`: resumo por integrante e registro de infrações.
  - `config`: integrantes, cômodos, imagens motivacionais, logo, fundo e cores.
- **Tema**: cores aplicadas via variáveis CSS (`style.setProperty()`).
- **Segurança de renderização**: todo texto vindo do banco passa por `escaparHtml` antes de entrar em `innerHTML`.
