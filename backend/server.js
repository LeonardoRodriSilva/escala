import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import {
  IntegrantesStore,
  ComodosStore,
  InfracoesStore,
  EscalasStore,
  ConfigStore,
  normalizeBoolean,
  normalizeNumber
} from './data/store.js';
import { montarEscala } from './lib/rodizio.js';
import { uploadImage, deleteImage, listGalleryImages, deleteImageByFilename, getKeyFromUrl } from './lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Converte handlers assíncronos: erros caem aqui em vez de derrubar o processo
const asyncHandler = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'Erro ao acessar o banco de dados' });
});

// Configurar multer para upload de imagens (limite de 5MB e tipos permitidos)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_EXTENSIONS.test(file.originalname)) {
      cb(new Error('Tipo de arquivo não permitido. Envie png, jpg, jpeg, webp ou gif.'));
      return;
    }
    cb(null, true);
  }
});

// ===== FUNÇÕES AUXILIARES =====
const sortByOrderThenName = (a, b) => {
  const orderDiff = normalizeNumber(a.ordem, 0) - normalizeNumber(b.ordem, 0);
  if (orderDiff !== 0) return orderDiff;
  return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
};

// Escolhe uma imagem aleatória da galeria, evitando repetir a atual quando há outra opção
const sortearMotivacaoDestaque = async (config) => {
  const galeria = await listGalleryImages({ exclude: [config.logo, config.background].filter(Boolean) });
  if (galeria.length === 0) return config.motivacaoDestaque || null;

  const candidatos = galeria.filter(imagem => imagem.path !== config.motivacaoDestaque);
  const pool = candidatos.length > 0 ? candidatos : galeria;
  const escolhido = pool[Math.floor(Math.random() * pool.length)];
  return escolhido.path;
};

// A casa fica no Brasil, mas a Vercel roda em UTC: a semana é sempre calculada no horário
// de Brasília (sem horário de verão desde 2019, então o offset é fixo).
const FUSO_CASA = 'America/Sao_Paulo';
const OFFSET_CASA = '-03:00';
const DIA_MS = 86400000;
// Quantas semanas de histórico o rodízio considera: cobre com folga um ciclo completo de
// folgas, suíte e cômodos, e mantém a geração rápida mesmo com anos de histórico
const SEMANAS_HISTORICO_RODIZIO = 52;

// Data de hoje (00:00 UTC) segundo o calendário de Brasília
function hojeNaCasa() {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_CASA })
    .format(new Date())
    .split('-')
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Ano/semana no padrão ISO 8601 (correto em viradas de ano e anos bissextos)
function getISOWeek(dataUtc) {
  const d = new Date(dataUtc);
  const dayNum = d.getUTCDay() || 7; // domingo=0 -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // quinta é o dia de referência do ISO 8601
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / DIA_MS) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getSemanaAtual() {
  const hoje = hojeNaCasa();
  const segunda = new Date(hoje - ((hoje.getUTCDay() || 7) - 1) * DIA_MS);
  const domingo = new Date(segunda.getTime() + 6 * DIA_MS);
  const meiaNoiteNaCasa = (dataUtc) => new Date(`${dataUtc.toISOString().slice(0, 10)}T00:00:00${OFFSET_CASA}`);
  const { year: ano, week: semana } = getISOWeek(segunda);
  return { ano, semana, dataInicio: meiaNoiteNaCasa(segunda), dataFim: meiaNoiteNaCasa(domingo) };
}

function validarComodoPayload(body, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || body.nome !== undefined) {
    if (!body.nome || !String(body.nome).trim()) {
      erros.push('O nome do cômodo é obrigatório.');
    }
  }
  if (body.pessoasNecessarias !== undefined) {
    const pessoas = Number(body.pessoasNecessarias);
    if (!Number.isFinite(pessoas) || pessoas < 1 || pessoas > 10) {
      erros.push('pessoasNecessarias deve ser um número entre 1 e 10.');
    }
  }
  if (body.ordem !== undefined) {
    const ordem = Number(body.ordem);
    if (!Number.isInteger(ordem) || ordem < 0) {
      erros.push('ordem deve ser um número inteiro maior ou igual a 0.');
    }
  }
  return erros;
}

// ===== ROTAS DE INTEGRANTES =====
app.get('/api/integrantes', asyncHandler(async (req, res) => {
  res.json(await IntegrantesStore.list());
}));

app.post('/api/integrantes', asyncHandler(async (req, res) => {
  const { nome, isSuite } = req.body;

  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ error: 'O nome do integrante é obrigatório.' });
  }

  if (await IntegrantesStore.findByNome(nome)) {
    return res.status(400).json({ error: 'Já existe um integrante com esse nome.' });
  }

  const novoIntegrante = await IntegrantesStore.create({ nome, isSuite });
  res.json(novoIntegrante);
}));

app.put('/api/integrantes/:id', asyncHandler(async (req, res) => {
  const existente = await IntegrantesStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Integrante não encontrado' });
  }

  const { nome, isSuite, ativo } = req.body;
  const changes = {};

  if (nome !== undefined) {
    if (!String(nome).trim()) {
      return res.status(400).json({ error: 'O nome do integrante é obrigatório.' });
    }
    if (await IntegrantesStore.findByNome(nome, { excludeId: existente.id })) {
      return res.status(400).json({ error: 'Já existe um integrante com esse nome.' });
    }
    changes.nome = String(nome).trim();
  }
  if (isSuite !== undefined) changes.isSuite = normalizeBoolean(isSuite, existente.isSuite);
  if (ativo !== undefined) changes.ativo = normalizeBoolean(ativo, existente.ativo);

  const atualizado = await IntegrantesStore.update(req.params.id, changes);
  res.json(atualizado);
}));

app.delete('/api/integrantes/:id', asyncHandler(async (req, res) => {
  const existente = await IntegrantesStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Integrante não encontrado' });
  }
  await IntegrantesStore.remove(req.params.id);
  res.json({ success: true });
}));

// O rodízio identifica cômodos pelo nome, então dois cômodos não podem ter o mesmo
const comodoComMesmoNome = async (nome, excludeId) => {
  const alvo = String(nome).trim().toLowerCase();
  return (await ComodosStore.list()).find(comodo =>
    String(comodo.nome || '').trim().toLowerCase() === alvo && String(comodo.id) !== String(excludeId)
  ) || null;
};

// ===== ROTAS DE CÔMODOS =====
app.get('/api/comodos', asyncHandler(async (req, res) => {
  res.json((await ComodosStore.list()).sort(sortByOrderThenName));
}));

app.post('/api/comodos', asyncHandler(async (req, res) => {
  const erros = validarComodoPayload(req.body, { parcial: false });
  if (erros.length > 0) {
    return res.status(400).json({ error: erros[0], erros });
  }

  const { nome, imagem, apenassuiteMembers, pessoasNecessarias, obrigatorio, ordem } = req.body;
  if (await comodoComMesmoNome(nome)) {
    return res.status(400).json({ error: 'Já existe um cômodo com esse nome.' });
  }

  const novoComodo = await ComodosStore.create({
    nome: String(nome).trim(),
    imagem: imagem || null,
    apenassuiteMembers,
    pessoasNecessarias,
    obrigatorio,
    ordem
  });
  res.json(novoComodo);
}));

app.put('/api/comodos/:id', asyncHandler(async (req, res) => {
  const existente = await ComodosStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Cômodo não encontrado' });
  }

  const erros = validarComodoPayload(req.body, { parcial: true });
  if (erros.length > 0) {
    return res.status(400).json({ error: erros[0], erros });
  }

  const { nome, imagem, apenassuiteMembers, pessoasNecessarias, obrigatorio, ordem } = req.body;
  const changes = {};
  if (nome !== undefined) {
    if (await comodoComMesmoNome(nome, existente.id)) {
      return res.status(400).json({ error: 'Já existe um cômodo com esse nome.' });
    }
    changes.nome = String(nome).trim();
  }
  if (apenassuiteMembers !== undefined) changes.apenassuiteMembers = apenassuiteMembers;
  if (pessoasNecessarias !== undefined) changes.pessoasNecessarias = pessoasNecessarias;
  if (obrigatorio !== undefined) changes.obrigatorio = obrigatorio;
  if (ordem !== undefined) changes.ordem = ordem;

  if (imagem !== undefined && imagem !== existente.imagem) {
    await deleteImage(existente.imagem);
    changes.imagem = imagem || null;
  }

  const atualizado = await ComodosStore.update(req.params.id, changes);
  if (changes.nome !== undefined && changes.nome !== existente.nome) {
    await EscalasStore.renomearComodo(existente.nome, changes.nome);
  }
  res.json(atualizado);
}));

app.delete('/api/comodos/:id', asyncHandler(async (req, res) => {
  const existente = await ComodosStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Cômodo não encontrado' });
  }
  await deleteImage(existente.imagem);
  await ComodosStore.remove(req.params.id);
  res.json({ success: true });
}));

// Upload de imagem para cômodo
app.post('/api/upload-comodo-image', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }
  const { filename, path: imagePath } = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
  res.json({ filename, path: imagePath });
}));

// Upload de imagem motivacional
app.post('/api/upload-motivacao-image', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }
  const { filename, path: imagePath } = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
  res.json({ filename, path: imagePath });
}));

// ===== ROTAS DE ESCALA =====
app.get('/api/escala/atual', asyncHandler(async (req, res) => {
  const semanaAtual = getSemanaAtual();
  res.json(await EscalasStore.listBySemana(semanaAtual.ano, semanaAtual.semana));
}));

app.get('/api/escala/historico', asyncHandler(async (req, res) => {
  const escalas = await EscalasStore.list();
  const escalaPorSemana = {};

  escalas.forEach(escala => {
    const semana = `${escala.ano}-${String(escala.semana).padStart(2, '0')}`;
    if (!escalaPorSemana[semana]) {
      escalaPorSemana[semana] = [];
    }
    escalaPorSemana[semana].push(escala);
  });

  res.json(escalaPorSemana);
}));

app.delete('/api/escala/historico/:ano/:semana', asyncHandler(async (req, res) => {
  const ano = normalizeNumber(req.params.ano, null);
  const semana = normalizeNumber(req.params.semana, null);

  if (!ano || !semana) {
    return res.status(400).json({ error: 'Ano e semana são obrigatórios' });
  }

  const removed = await EscalasStore.removeSemana(ano, semana);

  res.json({ success: true, removed });
}));

app.put('/api/escala/:id', asyncHandler(async (req, res) => {
  const existente = await EscalasStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Registro de escala não encontrado' });
  }

  const semanaAtual = getSemanaAtual();
  if (existente.ano !== semanaAtual.ano || existente.semana !== semanaAtual.semana) {
    return res.status(400).json({ error: 'Só é possível editar a escala da semana atual' });
  }

  const changes = {};
  if (req.body.comodos !== undefined) {
    if (!Array.isArray(req.body.comodos) || req.body.comodos.some(item => typeof item !== 'string')) {
      return res.status(400).json({ error: 'comodos deve ser uma lista de textos' });
    }
    changes.comodos = req.body.comodos;
    changes.folga = req.body.comodos.includes('FOLGA');
  }
  if (req.body.folga !== undefined && changes.folga === undefined) {
    changes.folga = normalizeBoolean(req.body.folga, existente.folga);
  }

  const atualizado = await EscalasStore.update(req.params.id, changes);
  res.json(atualizado);
}));

app.post('/api/escala/atual/trocar', asyncHandler(async (req, res) => {
  const { integranteAId, integranteBId } = req.body;

  if (!integranteAId || !integranteBId) {
    return res.status(400).json({ error: 'Informe integranteAId e integranteBId' });
  }
  if (String(integranteAId) === String(integranteBId)) {
    return res.status(400).json({ error: 'Selecione dois integrantes diferentes' });
  }

  const semanaAtual = getSemanaAtual();
  const escalasSemana = await EscalasStore.listBySemana(semanaAtual.ano, semanaAtual.semana);
  const linhaA = escalasSemana.find(e => String(e.integranteId) === String(integranteAId));
  const linhaB = escalasSemana.find(e => String(e.integranteId) === String(integranteBId));

  if (!linhaA || !linhaB) {
    return res.status(404).json({ error: 'Um dos integrantes não está na escala da semana atual' });
  }

  const resultados = await EscalasStore.saveMany([
    { ...linhaA, comodos: linhaB.comodos, folga: linhaB.folga },
    { ...linhaB, comodos: linhaA.comodos, folga: linhaA.folga }
  ]);

  res.json({ success: true, escala: resultados });
}));

app.post('/api/escala/gerar', asyncHandler(async (req, res) => {
  const integrantes = await IntegrantesStore.list();
  const comodos = (await ComodosStore.list()).sort(sortByOrderThenName);
  const semanaAtual = getSemanaAtual();

  // Histórico = último ano de escalas, exceto a semana atual (que está sendo regerada)
  const inicioHistorico = getISOWeek(new Date(semanaAtual.dataInicio - SEMANAS_HISTORICO_RODIZIO * 7 * DIA_MS));
  const historico = (await EscalasStore.listDesde(inicioHistorico.year, inicioHistorico.week)).filter(e =>
    !(e.ano === semanaAtual.ano && e.semana === semanaAtual.semana)
  );

  const integrantesAtivos = integrantes.filter(i => i.ativo);

  if (integrantesAtivos.length === 0) {
    return res.status(400).json({
      error: 'Nenhum integrante ativo',
      criticas: ['Ative ao menos um integrante para gerar a escala.']
    });
  }

  const mandatoryRooms = comodos.filter(comodo => comodo.obrigatorio !== false);
  if (mandatoryRooms.length === 0) {
    return res.status(400).json({
      error: 'Nenhum cômodo obrigatório configurado',
      criticas: ['Marque ao menos um cômodo como obrigatório antes de gerar a escala.']
    });
  }

  const { erro, resultado, totalFolgas } = montarEscala({
    integrantes: integrantesAtivos,
    comodos: mandatoryRooms,
    historico
  });

  if (erro) {
    return res.status(400).json({ error: erro, criticas: [erro] });
  }

  const novaEscala = integrantesAtivos.map(integrante => {
    const comodosIntegrante = resultado.get(integrante.id);
    return {
      id: randomUUID(),
      ano: semanaAtual.ano,
      semana: semanaAtual.semana,
      integranteId: integrante.id,
      integranteNome: integrante.nome,
      folga: comodosIntegrante.includes('FOLGA'),
      comodos: comodosIntegrante,
      dataInicio: new Date(semanaAtual.dataInicio),
      dataFim: new Date(semanaAtual.dataFim),
      alerta: null
    };
  });

  await EscalasStore.replaceSemana(semanaAtual.ano, semanaAtual.semana, novaEscala);

  // Sorteia uma nova "motivação da semana" a cada geração de escala
  const config = await ConfigStore.get();
  config.motivacaoDestaque = await sortearMotivacaoDestaque(config);
  await ConfigStore.save(config);

  res.json({
    escala: novaEscala,
    alerta: totalFolgas === 0
      ? 'Quantidade exata: ninguém ficou de folga nesta semana.'
      : `${totalFolgas} pessoa(s) ficaram de folga porque há ${integrantesAtivos.length} integrantes para ${integrantesAtivos.length - totalFolgas} vagas obrigatórias.`,
    criticas: [],
    motivacaoDestaque: config.motivacaoDestaque
  });
}));

// ===== ROTAS DE INFRAÇÕES =====
app.get('/api/infracoes/:integranteId', asyncHandler(async (req, res) => {
  res.json(await InfracoesStore.listByIntegranteId(req.params.integranteId));
}));

app.post('/api/infracoes', asyncHandler(async (req, res) => {
  const { integranteId, descricao, dataSemana } = req.body;

  if (!integranteId) {
    return res.status(400).json({ error: 'integranteId é obrigatório' });
  }

  const integrante = await IntegrantesStore.findById(integranteId);
  if (!integrante) {
    return res.status(400).json({ error: 'Integrante não encontrado' });
  }

  if (!descricao || !String(descricao).trim()) {
    return res.status(400).json({ error: 'A descrição da infração é obrigatória' });
  }

  const novaInfracao = await InfracoesStore.create({
    integranteId: integrante.id,
    integranteNome: integrante.nome,
    descricao,
    dataSemana
  });

  res.json(novaInfracao);
}));

app.put('/api/infracoes/:id', asyncHandler(async (req, res) => {
  const existente = await InfracoesStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Infração não encontrada' });
  }

  const { descricao, dataSemana } = req.body;
  const changes = {};

  if (descricao !== undefined) {
    if (!String(descricao).trim()) {
      return res.status(400).json({ error: 'A descrição da infração é obrigatória' });
    }
    changes.descricao = String(descricao).trim();
  }
  if (dataSemana !== undefined) changes.dataSemana = dataSemana;

  const atualizada = await InfracoesStore.update(req.params.id, changes);
  res.json(atualizada);
}));

app.delete('/api/infracoes/:id', asyncHandler(async (req, res) => {
  const existente = await InfracoesStore.findById(req.params.id);
  if (!existente) {
    return res.status(404).json({ error: 'Infração não encontrada' });
  }
  await InfracoesStore.remove(req.params.id);
  res.json({ success: true });
}));

app.get('/api/infracoes-resumo/todas', asyncHandler(async (req, res) => {
  const [infracoes, integrantes] = await Promise.all([InfracoesStore.list(), IntegrantesStore.list()]);
  const integrantesPorId = new Map(integrantes.map(integrante => [String(integrante.id), integrante]));
  const resumo = {};

  integrantes.filter(i => i.ativo !== false).forEach(integrante => {
    resumo[integrante.id] = {
      integranteId: integrante.id,
      integranteNome: integrante.nome,
      total: 0,
      infracoes: []
    };
  });

  infracoes.forEach(infracao => {
    const chave = String(infracao.integranteId);
    if (!resumo[chave]) {
      const integrante = integrantesPorId.get(chave);
      resumo[chave] = {
        integranteId: infracao.integranteId,
        integranteNome: integrante ? integrante.nome : infracao.integranteNome,
        total: 0,
        infracoes: []
      };
    }
    resumo[chave].total++;
    resumo[chave].infracoes.push(infracao);
  });

  res.json(resumo);
}));

// ===== VERSÃO EM EXECUÇÃO =====
// Na Vercel, o commit vem das variáveis de sistema VERCEL_GIT_*. Localmente, do git.
function lerVersao() {
  if (process.env.VERCEL) {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
    const dono = process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.VERCEL_GIT_REPO_SLUG;
    return {
      ambiente: process.env.VERCEL_ENV || 'vercel',
      sha,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      mensagem: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
      autor: process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || null,
      data: null,
      url: sha && dono && repo ? `https://github.com/${dono}/${repo}/commit/${sha}` : null
    };
  }

  try {
    const git = (args) => execSync(`git ${args}`, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const [sha, autor, data, mensagem] = git('log -1 --format=%H%n%an%n%cI%n%s').split('\n');
    return { ambiente: 'local', sha, branch: git('rev-parse --abbrev-ref HEAD'), mensagem, autor, data, url: null };
  } catch {
    return { ambiente: 'local', sha: null, branch: null, mensagem: null, autor: null, data: null, url: null };
  }
}

const VERSAO = lerVersao();

app.get('/api/versao', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(VERSAO);
});

// ===== CONFIGURAÇÕES (LOGO, FUNDO E CORES) =====
app.get('/api/config', asyncHandler(async (req, res) => {
  res.json(await ConfigStore.get());
}));

app.post('/api/config/cores', asyncHandler(async (req, res) => {
  const { cores } = req.body;

  if (!cores || typeof cores !== 'object') {
    return res.status(400).json({ error: 'Informe as cores' });
  }

  const camposInvalidos = Object.entries(cores).filter(([, valor]) => !HEX_COLOR_REGEX.test(valor));
  if (camposInvalidos.length > 0) {
    return res.status(400).json({
      error: `Cor inválida em: ${camposInvalidos.map(([campo]) => campo).join(', ')}. Use o formato #RRGGBB.`
    });
  }

  const config = await ConfigStore.get();
  config.cores = { ...config.cores, ...cores };
  await ConfigStore.save(config);
  res.json({ success: true, config });
}));

app.post('/api/config/logo', upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const config = await ConfigStore.get();
  await deleteImage(config.logo);
  const { path: imagePath } = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
  config.logo = imagePath;
  await ConfigStore.save(config);

  res.json({
    success: true,
    logo: config.logo,
    config
  });
}));

app.post('/api/config/background', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }

  const config = await ConfigStore.get();
  await deleteImage(config.background);
  const { path: imagePath } = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
  config.background = imagePath;
  await ConfigStore.save(config);

  res.json({
    success: true,
    background: config.background,
    config
  });
}));

app.get('/api/uploads/motivacao', asyncHandler(async (req, res) => {
  const config = await ConfigStore.get();
  const imagens = await listGalleryImages({ exclude: [config.logo, config.background].filter(Boolean) });

  res.json(imagens.sort((a, b) => b.filename.localeCompare(a.filename)));
}));

app.post('/api/config/motivacao-destaque', asyncHandler(async (req, res) => {
  const { path: imagemPath } = req.body;

  if (!imagemPath || typeof imagemPath !== 'string' || !getKeyFromUrl(imagemPath)) {
    return res.status(400).json({ error: 'Informe uma imagem válida' });
  }

  const config = await ConfigStore.get();
  config.motivacaoDestaque = imagemPath;
  await ConfigStore.save(config);

  res.json({
    success: true,
    motivacaoDestaque: config.motivacaoDestaque,
    config
  });
}));

app.delete('/api/uploads/motivacao/:filename', asyncHandler(async (req, res) => {
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).json({ error: 'Arquivo inválido' });
  }

  await deleteImageByFilename(filename);

  const config = await ConfigStore.get();
  if (getKeyFromUrl(config.motivacaoDestaque) === filename) {
    config.motivacaoDestaque = null;
    await ConfigStore.save(config);
  }

  res.json({ success: true });
}));

// Middleware de erro (converte falhas de upload — tamanho/tipo — em resposta JSON 400)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE: 'Arquivo muito grande. O limite é 5MB.'
    };
    return res.status(400).json({ error: mensagens[err.code] || err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Requisição inválida' });
  }
  next();
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Acesse o app no navegador!');
  });
}

export default app;
