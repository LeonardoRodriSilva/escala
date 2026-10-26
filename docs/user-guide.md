# 📖 Guia do Usuário

Este guia explica como operar o **Escala** no dia a dia.

---

## 🚀 1. Primeiro Acesso

1. Configure o `.env` e inicie o servidor na raiz do projeto (veja o [README](../README.md)):
   ```bash
   npm install
   npm start
   ```
2. Abra o navegador em `http://localhost:3000` (ou na URL da Vercel).

---

## ⚙️ 2. Configurações Iniciais

Na aba **⚙️ Configurações**:

### A. Integrantes
- Informe o nome e clique em **Adicionar Integrante**.
- Marque **"É da suíte?"** para quem mora na suíte: só essas pessoas fazem os cômodos "apenas suíte".
- Desmarque **"Está ativo?"** se alguém estiver viajando ou ausente. A pessoa sai da próxima escala gerada (a da semana atual só muda se você gerar de novo).

### B. Cômodos
- Cadastre os cômodos da casa (ex.: *Cozinha*, *Sala*, *Lavanderia*, *Sacada*). Os nomes não podem se repetir.
- **Quantas pessoas?**: quantas pessoas o cômodo precisa por semana.
- **Ordem na rotação**: a sequência que cada pessoa percorre (ordem 0 → 1 → 2...).
- **Apenas suite members?**: marque no banheiro da suíte.
- **Cômodo obrigatório?**: desmarque para tirar o cômodo da escala sem apagá-lo.
- Não cadastre "FOLGA": as folgas são calculadas automaticamente.
- Pode renomear um cômodo à vontade: o histórico acompanha o novo nome.

---

## 📋 3. Gerando a Escala

1. Na aba **📋 Escala Atual**, clique em **🔄 Gerar Nova Escala**.
2. O rodízio é previsível e não tem sorteio:
   - **Folgas**: sobram `integrantes ativos − vagas obrigatórias` por semana. Vão para quem está há mais tempo sem folgar, então todos folgam o mesmo número de vezes.
   - **Banheiro da suíte**: um morador da suíte por semana, em revezamento.
   - **Demais cômodos**: cada pessoa vai para o cômodo seguinte ao último que fez. Ninguém repete o mesmo cômodo na semana seguinte.
3. Gerar de novo na mesma semana refaz a escala da semana com o mesmo resultado (a não ser que integrantes ou cômodos tenham mudado).
4. Se faltar gente para as vagas, aparece um erro: ative mais integrantes ou desmarque cômodos obrigatórios.

A semana vai de segunda a domingo e vira à 0h de segunda, no horário de Brasília.

---

## ❌ 4. Registro de Infrações

1. Na escala, clique no ❌ do card da pessoa, ou vá na aba **❌ Infrações**.
2. Selecione o integrante, descreva o que aconteceu e clique em **Registrar Infração**.
3. O contador do integrante aumenta e aparece no resumo e no card da escala.

---

## 🎨 5. Personalização Visual

Na aba **⚙️ Configurações**:
- **Imagens motivacionais**: envie imagens para a galeria. A cada escala gerada, uma delas é sorteada como destaque; você também pode escolher uma na galeria.
- **Logo**: imagem do cabeçalho.
- **Fundo**: imagem de plano de fundo da aplicação.
- **Esquema de cores**: cor primária, secundária, clara e escura. **Restaurar Padrão** volta às cores originais.
