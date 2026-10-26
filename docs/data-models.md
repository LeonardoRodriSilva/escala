# 🗄️ Modelos de Dados

Os dados ficam no **Supabase**: tabelas no Postgres e imagens no Storage. O acesso passa por `backend/data/store.js`, que converte os nomes de coluna (`snake_case`) para os campos da API (`camelCase`).

---

## 👥 1. Integrantes (tabela `integrantes`)

| Coluna | Campo na API | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Identificador |
| `nome` | `nome` | texto | Nome (único) |
| `is_suite` | `isSuite` | boolean | Mora na suíte (pode fazer cômodos "apenas suíte") |
| `ativo` | `ativo` | boolean | Participa da escala |

```json
{ "id": "9060c789-...", "nome": "Terezinha", "isSuite": true, "ativo": true }
```

---

## 🚪 2. Cômodos (tabela `comodos`)

| Coluna | Campo na API | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Identificador |
| `nome` | `nome` | texto | Nome (único; é como o histórico identifica o cômodo) |
| `imagem` | `imagem` | texto \| null | URL pública da foto no Storage |
| `apenas_suite_members` | `apenassuiteMembers` | boolean | Só moradores da suíte podem fazer |
| `pessoas_necessarias` | `pessoasNecessarias` | inteiro (1–10) | Quantas pessoas o cômodo precisa por semana |
| `obrigatorio` | `obrigatorio` | boolean | Entra na geração da escala |
| `ordem` | `ordem` | inteiro ≥ 0 | Posição na sequência do rodízio |
| `permitir_multiplas_atribuicoes` | — | boolean | Coluna legada, sempre `false` (o rodízio nunca dá dois cômodos à mesma pessoa) |

```json
{
  "id": "e6a0f501-...",
  "nome": "WC Suíte",
  "imagem": null,
  "apenassuiteMembers": true,
  "pessoasNecessarias": 1,
  "obrigatorio": true,
  "ordem": 8
}
```

---

## 📋 3. Escalas (tabela `escalas`)

Uma linha por integrante por semana. O histórico do rodízio é lido daqui.

| Coluna | Campo na API | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Identificador da linha |
| `ano` / `semana` | `ano` / `semana` | inteiro | Semana ISO 8601 |
| `integrante_id` | `integranteId` | UUID | Integrante |
| `integrante_nome` | `integranteNome` | texto | Nome no momento da geração |
| `comodos` | `comodos` | lista de textos | Nomes dos cômodos, ou `["FOLGA"]` |
| `folga` | `folga` | boolean | `true` quando `comodos` é `["FOLGA"]` |
| `data_inicio` / `data_fim` | `dataInicio` / `dataFim` | timestamp | Segunda e domingo da semana, 00:00 de Brasília |
| `alerta` | `alerta` | texto \| null | Reservado |

```json
{
  "id": "1b2c...",
  "ano": 2026,
  "semana": 44,
  "integranteId": "9060c789-...",
  "integranteNome": "Terezinha",
  "folga": false,
  "comodos": ["WC Suíte"],
  "dataInicio": "2026-10-26T03:00:00.000Z",
  "dataFim": "2026-11-01T03:00:00.000Z",
  "alerta": null
}
```

A função Postgres `replace_semana_escala(p_ano, p_semana, p_linhas)` substitui todas as linhas de uma semana numa única transação.

---

## ❌ 4. Infrações (tabela `infracoes`)

| Coluna | Campo na API | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Identificador |
| `integrante_id` | `integranteId` | texto | Integrante |
| `integrante_nome` | `integranteNome` | texto | Nome no momento do registro |
| `descricao` | `descricao` | texto | O que aconteceu |
| `data_semana` | `dataSemana` | timestamp | Data de referência |
| `data_registro` | `dataRegistro` | timestamp | Quando foi registrada |

---

## 🎨 5. Configurações (tabela `config`, linha `id = 1`)

| Coluna | Campo na API | Descrição |
| :--- | :--- | :--- |
| `logo` | `logo` | URL do logo |
| `background` | `background` | URL da imagem de fundo |
| `motivacao_destaque` | `motivacaoDestaque` | URL da imagem em destaque na escala |
| `cores` | `cores` | `{ "primaria", "secundaria", "branca", "preta" }` em `#RRGGBB` |

---

## 🖼️ 6. Imagens (Storage, bucket `uploads`)

Fotos de cômodos, logo, fundo e galeria de motivação ficam no bucket público `uploads`, cada uma com um nome aleatório (UUID + extensão). A galeria de motivação é tudo o que está no bucket, exceto o logo e o fundo atuais.
