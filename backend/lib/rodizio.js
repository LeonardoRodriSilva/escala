// Rodízio da escala: nada é sorteado, cada semana sai do histórico das anteriores.
//
// 1. Folga: quem está há mais tempo sem folgar (empate: ordem alfabética).
// 2. Cômodo da suíte: o morador da suíte há mais tempo sem fazê-lo, entre quem não está de folga.
// 3. Demais cômodos: cada pessoa vai para o cômodo seguinte ao último que fez, na ordem
//    configurada; se ele já estiver ocupado, para o próximo livre. Quem trabalhou num cômodo
//    comum na semana anterior escolhe primeiro, para quem volta de folga/suíte não empurrar a fila.

const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

// Cada cômodo vira uma vaga por pessoa necessária, mantendo a ordem dos cômodos
const vagasDe = (comodos) => comodos.flatMap(comodo =>
  Array(Math.max(1, comodo.pessoasNecessarias || 1)).fill(comodo.nome)
);

export function montarEscala({ integrantes, comodos, historico }) {
  const pessoas = [...integrantes].sort(porNome);
  const vagasSuite = vagasDe(comodos.filter(comodo => comodo.apenassuiteMembers));
  const vagasComuns = vagasDe(comodos.filter(comodo => !comodo.apenassuiteMembers));
  const nomesSuite = new Set(vagasSuite);
  const suiteCount = pessoas.filter(pessoa => pessoa.isSuite).length;
  const totalFolgas = pessoas.length - vagasSuite.length - vagasComuns.length;

  if (vagasSuite.length > suiteCount) {
    return { erro: `Há ${vagasSuite.length} vaga(s) exclusiva(s) da suíte para ${suiteCount} morador(es) da suíte.` };
  }
  if (totalFolgas < 0) {
    return { erro: `Há ${vagasSuite.length + vagasComuns.length} vagas para ${pessoas.length} pessoas. Ative mais integrantes ou desmarque cômodos obrigatórios.` };
  }

  // Semanas do histórico numeradas da mais antiga (0) para a mais recente
  const chaveSemana = (escala) => escala.ano * 100 + escala.semana;
  const semanas = [...new Set(historico.map(chaveSemana))].sort((a, b) => a - b);
  const indiceSemana = new Map(semanas.map((chave, idx) => [chave, idx]));
  const ultimaSemana = semanas.length - 1;

  const historicoPorPessoa = new Map();
  historico.forEach(escala => {
    const id = String(escala.integranteId);
    if (!historicoPorPessoa.has(id)) historicoPorPessoa.set(id, []);
    historicoPorPessoa.get(id).push({ semana: indiceSemana.get(chaveSemana(escala)), comodos: escala.comodos || [] });
  });
  historicoPorPessoa.forEach(registros => registros.sort((a, b) => b.semana - a.semana));

  // Registro mais recente da pessoa que satisfaz o teste (ou null)
  const ultimoRegistro = (pessoa, teste) =>
    (historicoPorPessoa.get(String(pessoa.id)) || []).find(registro => registro.comodos.some(teste)) || null;
  const semanaDaUltima = (pessoa, teste) => ultimoRegistro(pessoa, teste)?.semana ?? -1;
  const quemEsperaMais = (teste) => (a, b) => semanaDaUltima(a, teste) - semanaDaUltima(b, teste);

  const ehFolga = item => item === 'FOLGA';
  const ehSuite = item => nomesSuite.has(item);
  const ehComum = item => vagasComuns.includes(item);

  const resultado = new Map(pessoas.map(pessoa => [pessoa.id, []]));

  // 1. Folgas (sem deixar a suíte sem gente para o cômodo dela)
  const folgas = new Set();
  let suiteDisponivel = suiteCount;
  [...pessoas].sort(quemEsperaMais(ehFolga)).forEach(pessoa => {
    if (folgas.size >= totalFolgas) return;
    if (pessoa.isSuite && suiteDisponivel <= vagasSuite.length) return;
    folgas.add(pessoa.id);
    if (pessoa.isSuite) suiteDisponivel--;
  });
  folgas.forEach(id => resultado.get(id).push('FOLGA'));

  // 2. Cômodo(s) da suíte
  const naSuite = pessoas
    .filter(pessoa => pessoa.isSuite && !folgas.has(pessoa.id))
    .sort(quemEsperaMais(ehSuite))
    .slice(0, vagasSuite.length);
  naSuite.forEach((pessoa, idx) => resultado.get(pessoa.id).push(vagasSuite[idx]));

  // 3. Cômodos comuns
  const trabalhando = pessoas.filter(pessoa => !folgas.has(pessoa.id) && !naSuite.includes(pessoa));
  const vinhaDeComodoComum = pessoa => semanaDaUltima(pessoa, ehComum) === ultimaSemana && ultimaSemana >= 0;
  const ordemDeEscolha = [
    ...trabalhando.filter(vinhaDeComodoComum),
    ...trabalhando.filter(pessoa => !vinhaDeComodoComum(pessoa))
  ];

  const ocupadas = Array(vagasComuns.length).fill(null);
  ordemDeEscolha.forEach(pessoa => {
    const anterior = ultimoRegistro(pessoa, ehComum);
    let vaga;
    if (anterior) {
      const ultimoIdx = Math.max(...anterior.comodos.filter(ehComum).map(nome => vagasComuns.lastIndexOf(nome)));
      vaga = (ultimoIdx + 1) % vagasComuns.length;
    } else {
      vaga = trabalhando.indexOf(pessoa) % vagasComuns.length;
    }
    while (ocupadas[vaga] !== null) vaga = (vaga + 1) % vagasComuns.length;
    ocupadas[vaga] = pessoa;
    resultado.get(pessoa.id).push(vagasComuns[vaga]);
  });

  return { resultado, totalFolgas };
}
