# 📚 Documentação do Projeto Escala

Bem-vindo à documentação do **Escala**, sistema de gestão e rodízio de escalas de limpeza.

## 📁 Estrutura de Documentos

| Documento | Descrição |
| :--- | :--- |
| 🏗️ [**Arquitetura do Sistema**](architecture.md) | Backend (Node/Express), frontend (SPA Vanilla), Supabase e o algoritmo do rodízio. |
| 🔌 [**Referência de APIs**](api.md) | Todas as rotas REST (`/api/integrantes`, `/api/comodos`, `/api/escala`, `/api/infracoes`, `/api/config`, uploads). |
| 🗄️ [**Modelos de Dados**](data-models.md) | Tabelas do Supabase e o bucket de imagens. |
| 📖 [**Guia do Usuário**](user-guide.md) | Integrantes, cômodos, como o rodízio funciona, infrações e personalização. |
| ⚡ [**Guia Rápido**](../QUICK_START.md) | Instalação e primeira execução. |

---

## 🗺️ Mapa da Estrutura do Código

```
escala/
├── backend/
│   ├── data/
│   │   ├── store.js              # Acesso às tabelas do Supabase (integrantes, comodos, escalas...)
│   │   └── supabaseClient.js     # Cliente Supabase (lê SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)
│   ├── lib/
│   │   ├── rodizio.js            # Algoritmo do rodízio semanal (folgas, suíte, cômodos)
│   │   └── storage.js            # Upload/listagem/remoção de imagens no Supabase Storage
│   └── server.js                 # Servidor Express e endpoints REST
├── frontend/
│   ├── css/
│   │   └── style.css             # Estilos responsivos e tema com variáveis CSS
│   ├── js/
│   │   ├── app.js                # Lógica da SPA, requisições fetch e renderização
│   │   └── modal.js              # Modais de confirmação e de texto
│   └── index.html                # Estrutura HTML da aplicação
├── docs/                         # Esta documentação
├── package.json                  # Dependências e scripts (npm start)
├── vercel.json                   # Deploy na Vercel
└── README.md
```
