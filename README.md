# 🏠 Escala - Sistema de Escalas de Limpeza

Aplicação web para gerenciar a escala semanal de limpeza da república: rodízio automático de cômodos e folgas, regra do banheiro da suíte, registro de infrações e personalização visual.

## ⚡ Como Rodar

1. Crie um arquivo `.env` na raiz do projeto:
   ```env
   SUPABASE_URL=https://<seu-projeto>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<chave service_role do projeto>
   ```
2. Instale e inicie (na raiz do projeto):
   ```bash
   npm install
   npm start
   ```
3. Acesse **http://localhost:3000**

Em produção o app roda na Vercel (`vercel.json`), com as mesmas variáveis de ambiente configuradas no painel.

---

## ✨ Funcionalidades Principais

- 🔄 **Rodízio semanal sem sorteio**: cada pessoa passa pelos cômodos em sequência, sem repetir o mesmo cômodo na semana seguinte.
- 🛁 **Regra da suíte**: o banheiro da suíte é feito só por moradores da suíte, um por semana, em revezamento.
- ☕ **Folgas automáticas e iguais para todos**: sobram `integrantes ativos − vagas obrigatórias` folgas por semana, para quem está há mais tempo sem folgar.
- ❌ **Infrações** com contador e histórico por integrante.
- 🎨 **Personalização visual**: logo, fundo, galeria de imagens motivacionais e cores.
- 📅 **Histórico** das escalas de semanas anteriores.

---

## 📚 Documentação

A documentação detalhada está na pasta [`docs/`](docs/README.md):

- 🏗️ [**Arquitetura**](docs/architecture.md) — backend, frontend, banco e o algoritmo do rodízio.
- 🔌 [**Referência da API**](docs/api.md) — endpoints REST `/api/*`.
- 🗄️ [**Modelos de Dados**](docs/data-models.md) — tabelas do Supabase.
- 📖 [**Guia do Usuário**](docs/user-guide.md) — uso no dia a dia.
- ⚡ [**Guia Rápido**](QUICK_START.md) — passo a passo resumido.

---

## 🔧 Stack de Tecnologias

- **Backend**: Node.js + Express + Multer (uploads em memória)
- **Frontend**: HTML5 + CSS3 (variáveis CSS dinâmicas) + JavaScript Vanilla
- **Banco de dados e arquivos**: Supabase (Postgres + Storage)
- **Deploy**: Vercel
