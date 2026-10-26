# ⚡ Guia Rápido

## 🚀 3 Passos para Começar

### 1. Instale o Node.js
https://nodejs.org/ (versão LTS)

### 2. Configure e execute
Crie o `.env` na raiz com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (veja o [README](README.md)) e rode:
```bash
npm install
npm start
```

### 3. Acesse
```
http://localhost:3000
```

## ⚙️ Configure em 5 Min

1. **⚙️ Configurações → Integrantes**
   - Cadastre todos os moradores e marque **"É da suíte?"** para quem mora na suíte.

2. **⚙️ Configurações → Cômodos**
   - Cadastre os cômodos (ex.: Sala, Cozinha, Lavanderia, Sacada) e defina a **ordem na rotação**.
   - No banheiro da suíte, marque **"Apenas suite members?"**.
   - Não cadastre "FOLGA" como cômodo: as folgas são calculadas sozinhas.

3. **📋 Escala Atual**
   - Clique em **"🔄 Gerar Nova Escala"**.

## 🎮 Usar Toda Semana

```
Segunda: gera a escala da semana (a semana vira à 0h de segunda, horário de Brasília)
Durante: marca infrações se necessário (❌)
Próxima: cada um vai para o cômodo seguinte da sequência
```

## 🆘 Problemas?

| Erro | Solução |
|------|---------|
| `Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY` | Crie o `.env` na raiz do projeto |
| Porta em uso | Rode com outra porta: `PORT=3001 npm start` |
| Sem módulos | `npm install` na raiz do projeto |
| "Há N vagas para M pessoas" ao gerar | Ative mais integrantes ou desmarque cômodos obrigatórios |

**Pronto!** 🎉

---
Para arquitetura, APIs e modelo de dados, consulte a pasta [`docs/`](docs/README.md).
