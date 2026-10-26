# 🔌 Referência da API REST

O backend expõe a API sob o prefixo `/api`. Requisições com corpo usam `Content-Type: application/json`, exceto os uploads, que usam `multipart/form-data`. Erros de validação retornam `400` com `{ "error": string }`.

---

## 👥 Integrantes (`/api/integrantes`)

| Método | Endpoint | Descrição | Corpo / Retorno |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/integrantes` | Lista todos os integrantes | Array de `Integrante` |
| `POST` | `/api/integrantes` | Cria um integrante (sempre ativo) | `{ "nome": string, "isSuite": boolean }` |
| `PUT` | `/api/integrantes/:id` | Atualiza um integrante | `{ "nome"?: string, "isSuite"?: boolean, "ativo"?: boolean }` |
| `DELETE` | `/api/integrantes/:id` | Remove um integrante | `{ "success": true }` |

Nomes de integrantes não podem se repetir (sem diferenciar maiúsculas).

---

## 🚪 Cômodos (`/api/comodos`)

| Método | Endpoint | Descrição | Corpo / Retorno |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/comodos` | Lista os cômodos ordenados por `ordem` e nome | Array de `Comodo` |
| `POST` | `/api/comodos` | Cria um cômodo | `{ "nome": string, "imagem"?: string, "apenassuiteMembers"?: boolean, "pessoasNecessarias"?: number (1–10), "obrigatorio"?: boolean, "ordem"?: number }` |
| `PUT` | `/api/comodos/:id` | Atualiza um cômodo; renomear atualiza o histórico das escalas | Mesmos campos do `POST`, todos opcionais |
| `DELETE` | `/api/comodos/:id` | Remove o cômodo e sua imagem | `{ "success": true }` |
| `POST` | `/api/upload-comodo-image` | Envia a foto de um cômodo | `FormData` com o campo `image`. Retorna `{ "filename", "path" }` |

Nomes de cômodos não podem se repetir.

---

## 📋 Escala (`/api/escala`)

| Método | Endpoint | Descrição | Corpo / Retorno |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/escala/atual` | Linhas da escala da semana atual | Array de `Escala` |
| `POST` | `/api/escala/gerar` | Gera (ou refaz) a escala da semana atual | `{ "escala": Escala[], "alerta": string, "criticas": string[], "motivacaoDestaque": string }` |
| `PUT` | `/api/escala/:id` | Edita uma linha da semana atual | `{ "comodos"?: string[], "folga"?: boolean }` |
| `POST` | `/api/escala/atual/trocar` | Troca os cômodos de dois integrantes na semana atual | `{ "integranteAId": string, "integranteBId": string }` |
| `GET` | `/api/escala/historico` | Todas as escalas agrupadas por semana | `{ "AAAA-SS": Escala[] }` |
| `DELETE` | `/api/escala/historico/:ano/:semana` | Apaga uma semana do histórico | `{ "success": true, "removed": number }` |

Ao gerar, cada integrante ativo recebe uma linha. Quem está de folga tem `comodos: ["FOLGA"]` e `folga: true`. Em caso de erro (sem integrantes ativos, sem cômodos obrigatórios, vagas demais), a resposta é `400` com `{ "error", "criticas" }`.

---

## ❌ Infrações (`/api/infracoes`)

| Método | Endpoint | Descrição | Corpo / Retorno |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/infracoes/:integranteId` | Infrações de um integrante | Array de `Infracao` |
| `GET` | `/api/infracoes-resumo/todas` | Resumo por integrante | `{ [integranteId]: { integranteId, integranteNome, total, infracoes } }` |
| `POST` | `/api/infracoes` | Registra uma infração | `{ "integranteId": string, "descricao": string, "dataSemana"?: string }` |
| `PUT` | `/api/infracoes/:id` | Edita uma infração | `{ "descricao"?: string, "dataSemana"?: string }` |
| `DELETE` | `/api/infracoes/:id` | Remove uma infração | `{ "success": true }` |

---

## 🎨 Configuração e Imagens

| Método | Endpoint | Descrição | Corpo / Retorno |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/config` | Configurações visuais | Objeto `Config` |
| `POST` | `/api/config/cores` | Define as cores | `{ "cores": { "primaria"?, "secundaria"?, "branca"?, "preta"? } }` no formato `#RRGGBB` |
| `POST` | `/api/config/logo` | Envia o logo (substitui o anterior) | `FormData` com o campo `logo` |
| `POST` | `/api/config/background` | Envia a imagem de fundo (substitui a anterior) | `FormData` com o campo `image` |
| `POST` | `/api/upload-motivacao-image` | Envia uma imagem para a galeria de motivação | `FormData` com o campo `image`. Retorna `{ "filename", "path" }` |
| `GET` | `/api/uploads/motivacao` | Lista a galeria de motivação (sem logo e fundo) | Array de `{ "filename", "path" }` |
| `POST` | `/api/config/motivacao-destaque` | Define a imagem em destaque na escala | `{ "path": string }` |
| `DELETE` | `/api/uploads/motivacao/:filename` | Remove uma imagem da galeria | `{ "success": true }` |

A cada geração de escala, uma nova imagem da galeria é sorteada como destaque.
