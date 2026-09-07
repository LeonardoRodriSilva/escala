import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import {
  IntegrantesStore,
  ComodosStore,
  InfracoesStore,
  EscalasStore,
  ConfigStore,
  normalizeBoolean,
  normalizeNumber
} from './data/store.js';
import { uploadImage, deleteImage, listGalleryImages, deleteImageByFilename, getKeyFromUrl } from './lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
const rotateList = (items, offset) => {
  if (!items.length) return [];
  const normalizedOffset = offset % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
};

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

// Segunda-feira (00:00) da semana da data informada, sem mutar a data original
function getMondayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // domingo=0 -> 7
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  return d;
}

// Ano/semana no padrão ISO 8601 (correto em viradas de ano e anos bissextos)
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 4; // domingo=0 -> 4 (quinta é o dia de referência do ISO 8601)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getSemanaAtual() {
  const dataInicio = getMondayOfWeek(new Date());
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + 6);
  const { year: ano, week: semana } = getISOWeek(dataInicio);
  return { ano, semana, dataInicio, dataFim };
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

// ===== ROTAS DE CÔMODOS =====
app.get('/api/comodos', asyncHandler(async (req, res) => {
  res.json((await ComodosStore.list()).sort(sortByOrderThenName));
}));

app.post('/api/comodos', asyncHandler(async (req, res) => {
  const erros = validarComodoPayload(req.body, { parcial: false });
  if (erros.length > 0) {
    return res.status(400).json({ error: erros[0], erros });
  }

  const { nome, imagem, apenassuiteMembers, pessoasNecessarias, permitirMultiplasAtribuicoes, obrigatorio, ordem } = req.body;
  const novoComodo = await ComodosStore.create({
    nome: String(nome).trim(),
    imagem: imagem || null,
    apenassuiteMembers,
    pessoasNecessarias,
    permitirMultiplasAtribuicoes,
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

  const { nome, imagem, apenassuiteMembers, pessoasNecessarias, permitirMultiplasAtribuicoes, obrigatorio, ordem } = req.body;
  const changes = {};
  if (nome !== undefined) changes.nome = String(nome).trim();
  if (apenassuiteMembers !== undefined) changes.apenassuiteMembers = apenassuiteMembers;
  if (pessoasNecessarias !== undefined) changes.pessoasNecessarias = pessoasNecessarias;
  if (permitirMultiplasAtribuicoes !== undefined) changes.permitirMultiplasAtribuicoes = permitirMultiplasAtribuicoes;
  if (obrigatorio !== undefined) changes.obrigatorio = obrigatorio;
  if (ordem !== undefined) changes.ordem = ordem;

  if (imagem !== undefined && imagem !== existente.imagem) {
    await deleteImage(existente.imagem);
    changes.imagem = imagem || null;
  }

  const atualizado = await ComodosStore.update(req.params.id, changes);
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

app.post('/api/upload-background-image', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }

  const config = await ConfigStore.get();
  await deleteImage(config.background);
  const { path: imagePath, filename } = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
  config.background = imagePath;
  await ConfigStore.save(config);

  res.json({ filename, path: config.background, config });
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

  const resultados = await EscalasStore.updateMany([
    { id: linhaA.id, changes: { comodos: linhaB.comodos, folga: linhaB.folga } },
    { id: linhaB.id, changes: { comodos: linhaA.comodos, folga: linhaA.folga } }
  ]);

  res.json({ success: true, escala: resultados });
}));

app.post('/api/escala/gerar', asyncHandler(async (req, res) => {
  const integrantes = await IntegrantesStore.list();
  const comodos = (await ComodosStore.list()).sort(sortByOrderThenName);
  const semanaAtual = getSemanaAtual();

  // Histórico = todas as escalas exceto a semana atual (que está sendo regerada)
  const historico = (await EscalasStore.list()).filter(e =>
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
  const suiteRooms = mandatoryRooms.filter(comodo => comodo.apenassuiteMembers);
  const normalRooms = mandatoryRooms.filter(comodo => !comodo.apenassuiteMembers);
  const totalRequiredSlots = mandatoryRooms.reduce((sum, room) => sum + Math.max(1, room.pessoasNecessarias || 1), 0);
  const suiteCount = integrantesAtivos.filter(integrante => integrante.isSuite).length;
  const geracaoSeed = Date.now() ^ Math.floor(Math.random() * 1000000000);
  const semanaSeed = (semanaAtual.ano * 53 + semanaAtual.semana) + geracaoSeed;
  const suiteSlotsNecessarios = suiteRooms.reduce((sum, room) => sum + Math.max(1, room.pessoasNecessarias || 1), 0);

  const historicoFolgas = new Map();
  const historicoComodos = new Map();
  historico.forEach(escala => {
    const integranteId = escala.integranteId;
    const nome = escala.integranteNome;
    if (!integranteId && !nome) return;

    const chave = integranteId ?? nome;
    if (Array.isArray(escala.comodos) && escala.comodos.includes('FOLGA')) {
      historicoFolgas.set(chave, (historicoFolgas.get(chave) || 0) + 1);
    }

    if (Array.isArray(escala.comodos)) {
      escala.comodos.filter(item => item !== 'FOLGA' && item !== 'Nenhum').forEach(roomName => {
        if (!historicoComodos.has(chave)) {
          historicoComodos.set(chave, new Map());
        }
        const porRoom = historicoComodos.get(chave);
        porRoom.set(roomName, (porRoom.get(roomName) || 0) + 1);
      });
    }
  });

  const criticas = [];
  const avisos = [];
  if (mandatoryRooms.length === 0) {
    return res.status(400).json({
      error: 'Nenhum cômodo obrigatório configurado',
      criticas: ['Marque ao menos um cômodo como obrigatório antes de gerar a escala.']
    });
  }

  if (suiteRooms.length > 0 && suiteCount === 0) {
    criticas.push(`Existem ${suiteRooms.length} cômodo(s) exclusivos da suíte, mas nenhum integrante está marcado como suíte.`);
  } else if (suiteSlotsNecessarios > suiteCount) {
    criticas.push(`Há ${suiteSlotsNecessarios} vaga(s) obrigatória(s) de suíte para apenas ${suiteCount} morador(es) da suíte disponíveis.`);
  }

  if (totalRequiredSlots > integrantesAtivos.length) {
    avisos.push(`Há ${totalRequiredSlots} vagas obrigatórias para ${integrantesAtivos.length} pessoas. ${totalRequiredSlots - integrantesAtivos.length} pessoa(s) precisarão receber mais de uma tarefa.`);
  }

  const escalaPorIntegrante = new Map();
  integrantesAtivos.forEach((integrante) => {
    escalaPorIntegrante.set(integrante.id, {
      id: randomUUID(),
      ano: semanaAtual.ano,
      semana: semanaAtual.semana,
      integranteId: integrante.id,
      integranteNome: integrante.nome,
      folga: false,
      comodos: [],
      dataInicio: new Date(semanaAtual.dataInicio),
      dataFim: new Date(semanaAtual.dataFim),
      alerta: null
    });
  });

  const assignedCounts = new Map();
  integrantesAtivos.forEach(integrante => assignedCounts.set(integrante.id, 0));

  const totalFolgas = Math.max(0, integrantesAtivos.length - totalRequiredSlots);
  const folgaBaseOrder = rotateList([...integrantesAtivos], semanaSeed % integrantesAtivos.length);
  const candidatosFolga = [...integrantesAtivos].filter(integrante => {
    if (!integrante.isSuite) return true;
    return suiteCount > suiteSlotsNecessarios;
  });

  const folgas = new Set(
    candidatosFolga
      .map(integrante => ({
        integrante,
        folgas: historicoFolgas.get(integrante.id) || 0,
        baseIndex: folgaBaseOrder.findIndex(item => item.id === integrante.id)
      }))
      .sort((a, b) => {
        const diff = a.folgas - b.folgas;
        if (diff !== 0) return diff;
        return a.baseIndex - b.baseIndex;
      })
      .slice(0, Math.min(totalFolgas, candidatosFolga.length))
      .map(item => item.integrante.id)
  );

  if (folgas.size < totalFolgas) {
    [...integrantesAtivos]
      .filter(integrante => !folgas.has(integrante.id))
      .sort((a, b) => {
        const diff = (historicoFolgas.get(a.id) || 0) - (historicoFolgas.get(b.id) || 0);
        if (diff !== 0) return diff;
        return a.nome.localeCompare(b.nome, 'pt-BR');
      })
      .slice(0, totalFolgas - folgas.size)
      .forEach(integrante => folgas.add(integrante.id));
  }

  const novaEscala = [];
  const roomWarnings = [];
  const roomFailures = [];

  const roomPrioritySort = (a, b) => {
    const ordemDiff = normalizeNumber(a.ordem, 0) - normalizeNumber(b.ordem, 0);
    if (ordemDiff !== 0) return ordemDiff;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  };

  const assignmentOrder = [
    ...suiteRooms.sort(roomPrioritySort),
    ...normalRooms.sort(roomPrioritySort)
  ];

  const getCandidatePool = (room) => {
    if (room.apenassuiteMembers) {
      return integrantesAtivos.filter(integrante => integrante.isSuite);
    }

    const naoSuite = integrantesAtivos.filter(integrante => !integrante.isSuite);
    const suite = integrantesAtivos.filter(integrante => integrante.isSuite);
    return [...naoSuite, ...suite];
  };

  const getRoomHistoryCount = (integranteId, roomName) => {
    const historicoIntegrante = historicoComodos.get(integranteId) || historicoComodos.get(String(integranteId));
    if (!historicoIntegrante) return 0;
    return historicoIntegrante.get(roomName) || 0;
  };

  const chooseCandidate = (room, slotIndex, usedInRoom) => {
    const pool = getCandidatePool(room);
    if (pool.length === 0) return null;

    const rotatedPool = rotateList(pool, (semanaSeed + room.ordem + slotIndex) % pool.length);
    const uniqueOrdered = [];
    const seen = new Set();

    rotatedPool.forEach(integrante => {
      if (seen.has(integrante.id) || usedInRoom.has(integrante.id) || folgas.has(integrante.id)) return;
      seen.add(integrante.id);
      uniqueOrdered.push(integrante);
    });

    if (uniqueOrdered.length === 0) {
      return null;
    }

    // Posição no sorteio da semana: usada como desempate final para evitar viés
    // alfabético (empates de histórico sempre favoreciam o mesmo nome).
    const poolIndex = new Map(uniqueOrdered.map((integrante, idx) => [integrante.id, idx]));

    const livres = uniqueOrdered
      .filter(integrante => assignedCounts.get(integrante.id) === 0)
      .sort((a, b) => {
        const diffHistorico = getRoomHistoryCount(a.id, room.nome) - getRoomHistoryCount(b.id, room.nome);
        if (diffHistorico !== 0) return diffHistorico;
        const diffAtual = (assignedCounts.get(a.id) || 0) - (assignedCounts.get(b.id) || 0);
        if (diffAtual !== 0) return diffAtual;
        return poolIndex.get(a.id) - poolIndex.get(b.id);
      });

    if (livres.length > 0) {
      return { integrante: livres[0], reused: false };
    }

    const reutilizavel = uniqueOrdered
      .filter(integrante => room.permitirMultiplasAtribuicoes || assignedCounts.get(integrante.id) === 0)
      .sort((a, b) => {
        const diffHistorico = getRoomHistoryCount(a.id, room.nome) - getRoomHistoryCount(b.id, room.nome);
        if (diffHistorico !== 0) return diffHistorico;
        const diffAtual = (assignedCounts.get(a.id) || 0) - (assignedCounts.get(b.id) || 0);
        if (diffAtual !== 0) return diffAtual;
        return poolIndex.get(a.id) - poolIndex.get(b.id);
      })[0] || null;

    return reutilizavel ? { integrante: reutilizavel, reused: true } : null;
  };

  for (const room of assignmentOrder) {
    const requiredSlots = Math.max(1, room.pessoasNecessarias || 1);
    const usedInRoom = new Set();
    let roomAssigned = 0;

    for (let slotIndex = 0; slotIndex < requiredSlots; slotIndex++) {
      const escolhido = chooseCandidate(room, slotIndex, usedInRoom);
      const candidato = escolhido?.integrante || null;

      if (!candidato) {
        const pool = getCandidatePool(room);

        if (room.apenassuiteMembers && suiteCount === 0) {
          roomFailures.push(`Não foi possível preencher ${room.nome}: esse cômodo exige integrantes da suíte, mas nenhum morador foi marcado como suíte.`);
        } else if (room.apenassuiteMembers && pool.length === 0) {
          roomFailures.push(`Não foi possível preencher ${room.nome}: não há integrantes da suíte disponíveis.`);
        } else {
          roomWarnings.push(`O cômodo ${room.nome} precisou reutilizar integrante(s) para fechar a escala.`);
          const fallback = pool
            .filter(integrante => usedInRoom.has(integrante.id) === false && !folgas.has(integrante.id))
            .sort((a, b) => (assignedCounts.get(a.id) || 0) - (assignedCounts.get(b.id) || 0))[0];
          if (fallback) {
            usedInRoom.add(fallback.id);
            const linhaFallback = escalaPorIntegrante.get(fallback.id);
            if (linhaFallback && !linhaFallback.comodos.includes(room.nome)) {
              linhaFallback.comodos.push(room.nome);
            }
            assignedCounts.set(fallback.id, (assignedCounts.get(fallback.id) || 0) + 1);
            roomAssigned++;
            continue;
          }
          roomFailures.push(`Não foi possível preencher ${room.nome}: a configuração atual não gerou uma combinação válida.`);
        }

        break;
      }

      if (escolhido.reused) {
        roomWarnings.push(`O cômodo ${room.nome} reutilizou ${candidato.nome} por falta de pessoas livres.`);
      }

      usedInRoom.add(candidato.id);
      roomAssigned++;

      const linha = escalaPorIntegrante.get(candidato.id);
      if (linha && !linha.comodos.includes(room.nome)) {
        linha.comodos.push(room.nome);
      }
      assignedCounts.set(candidato.id, (assignedCounts.get(candidato.id) || 0) + 1);
    }

    if (roomAssigned < requiredSlots) {
      break;
    }
  }

  if (roomFailures.length > 0) {
    return res.status(400).json({
      error: roomFailures[0],
      criticas: [...roomFailures, ...criticas]
    });
  }

  const pessoasEmFolga = integrantesAtivos.filter(integrante => (assignedCounts.get(integrante.id) || 0) === 0);
  pessoasEmFolga.forEach(integrante => {
    const linha = escalaPorIntegrante.get(integrante.id);
    if (linha) {
      linha.folga = true;
      linha.comodos = ['FOLGA'];
    }
  });

  let alerta = null;
  if (totalRequiredSlots === integrantesAtivos.length) {
    alerta = 'Quantidade exata: ninguém ficou de folga nesta semana.';
  } else if (totalRequiredSlots < integrantesAtivos.length) {
    alerta = `${pessoasEmFolga.length} pessoa(s) ficaram de folga porque há ${integrantesAtivos.length} integrantes para ${totalRequiredSlots} vagas obrigatórias.`;
  } else if (totalRequiredSlots > integrantesAtivos.length) {
    alerta = `Faltam ${totalRequiredSlots - integrantesAtivos.length} pessoa(s); algumas receberam mais de uma tarefa para fechar a escala.`;
  }

  if (pessoasEmFolga.length === 0 && totalRequiredSlots <= integrantesAtivos.length) {
    criticas.push('A configuração atual preencheu todas as vagas e não deixou folgas.');
  }

  criticas.push(...avisos, ...roomWarnings);

  integrantesAtivos.forEach(integrante => {
    const linha = escalaPorIntegrante.get(integrante.id);
    if (!linha.folga && linha.comodos.length === 0) {
      linha.comodos.push('Nenhum');
    }
    novaEscala.push(linha);
  });

  await EscalasStore.replaceSemana(semanaAtual.ano, semanaAtual.semana, novaEscala);

  // Sorteia uma nova "motivação da semana" a cada geração de escala
  const config = await ConfigStore.get();
  config.motivacaoDestaque = await sortearMotivacaoDestaque(config);
  await ConfigStore.save(config);

  res.json({
    escala: novaEscala,
    alerta: alerta,
    criticas: criticas,
    motivacaoDestaque: config.motivacaoDestaque,
    integrantesComMultiplos: Array.from(assignedCounts.entries())
      .filter(([, total]) => total > 1)
      .map(([integranteId]) => {
        const integrante = integrantesAtivos.find(i => i.id === integranteId);
        return integrante ? integrante.nome : integranteId;
      })
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
  const infracoes = await InfracoesStore.list();
  const integrantesAtivos = (await IntegrantesStore.list()).filter(i => i.ativo !== false);
  const resumo = {};

  integrantesAtivos.forEach(integrante => {
    resumo[integrante.id] = {
      integranteId: integrante.id,
      integranteNome: integrante.nome,
      total: 0,
      infracoes: []
    };
  });

  for (const infracao of infracoes) {
    const chave = String(infracao.integranteId);
    if (!resumo[chave]) {
      const integrante = await IntegrantesStore.findById(infracao.integranteId);
      resumo[chave] = {
        integranteId: infracao.integranteId,
        integranteNome: integrante ? integrante.nome : infracao.integranteNome,
        total: 0,
        infracoes: []
      };
    }
    resumo[chave].total++;
    resumo[chave].infracoes.push(infracao);
  }

  res.json(resumo);
}));

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
