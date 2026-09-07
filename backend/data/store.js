import { randomUUID } from 'crypto';
import { supabase } from './supabaseClient.js';

const sameId = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

export const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return Boolean(value);
};

export const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ===== INTEGRANTES =====
const integranteFromDb = (row) => ({
  id: row.id,
  nome: row.nome,
  isSuite: row.is_suite,
  ativo: row.ativo
});

export const IntegrantesStore = {
  async list() {
    const rows = check(await supabase.from('integrantes').select('*'));
    return rows.map(integranteFromDb);
  },
  async findById(id) {
    return (await this.list()).find((integrante) => sameId(integrante.id, id)) || null;
  },
  async findByNome(nome, { excludeId } = {}) {
    const alvo = String(nome || '').trim().toLowerCase();
    return (await this.list()).find((integrante) =>
      String(integrante.nome || '').trim().toLowerCase() === alvo &&
      !sameId(integrante.id, excludeId)
    ) || null;
  },
  async create({ nome, isSuite }) {
    const row = check(await supabase.from('integrantes').insert({
      nome: nome.trim(),
      is_suite: normalizeBoolean(isSuite, false),
      ativo: true
    }).select().single());
    return integranteFromDb(row);
  },
  async update(id, changes) {
    const dbChanges = {};
    if (changes.nome !== undefined) dbChanges.nome = changes.nome;
    if (changes.isSuite !== undefined) dbChanges.is_suite = changes.isSuite;
    if (changes.ativo !== undefined) dbChanges.ativo = changes.ativo;

    const row = check(await supabase.from('integrantes').update(dbChanges).eq('id', id).select().maybeSingle());
    return row ? integranteFromDb(row) : null;
  },
  async remove(id) {
    const rows = check(await supabase.from('integrantes').delete().eq('id', id).select());
    return rows.length > 0;
  }
};

// ===== COMODOS =====
const DEFAULT_COMODO_CONFIG = {
  imagem: null,
  apenassuiteMembers: false,
  pessoasNecessarias: 1,
  permitirMultiplasAtribuicoes: false,
  obrigatorio: true,
  ordem: 0
};

const normalizeComodo = (comodo = {}, index = 0) => ({
  ...DEFAULT_COMODO_CONFIG,
  ...comodo,
  pessoasNecessarias: Math.max(1, Math.min(10, normalizeNumber(comodo.pessoasNecessarias, 1))),
  permitirMultiplasAtribuicoes: normalizeBoolean(comodo.permitirMultiplasAtribuicoes, false),
  obrigatorio: normalizeBoolean(comodo.obrigatorio, true),
  ordem: Math.max(0, Math.trunc(normalizeNumber(comodo.ordem, index)))
});

const comodoFromDb = (row) => ({
  id: row.id,
  nome: row.nome,
  imagem: row.imagem,
  apenassuiteMembers: row.apenas_suite_members,
  pessoasNecessarias: row.pessoas_necessarias,
  permitirMultiplasAtribuicoes: row.permitir_multiplas_atribuicoes,
  obrigatorio: row.obrigatorio,
  ordem: row.ordem
});

const comodoChangesToDb = (changes) => {
  const dbChanges = {};
  if (changes.nome !== undefined) dbChanges.nome = changes.nome;
  if (changes.imagem !== undefined) dbChanges.imagem = changes.imagem;
  if (changes.apenassuiteMembers !== undefined) dbChanges.apenas_suite_members = normalizeBoolean(changes.apenassuiteMembers, false);
  if (changes.pessoasNecessarias !== undefined) dbChanges.pessoas_necessarias = Math.max(1, Math.min(10, normalizeNumber(changes.pessoasNecessarias, 1)));
  if (changes.permitirMultiplasAtribuicoes !== undefined) dbChanges.permitir_multiplas_atribuicoes = normalizeBoolean(changes.permitirMultiplasAtribuicoes, false);
  if (changes.obrigatorio !== undefined) dbChanges.obrigatorio = normalizeBoolean(changes.obrigatorio, true);
  if (changes.ordem !== undefined) dbChanges.ordem = Math.max(0, Math.trunc(normalizeNumber(changes.ordem, 0)));
  return dbChanges;
};

export const ComodosStore = {
  async list() {
    const rows = check(await supabase.from('comodos').select('*'));
    return rows.map((row, index) => normalizeComodo(comodoFromDb(row), index));
  },
  async findById(id) {
    return (await this.list()).find((comodo) => sameId(comodo.id, id)) || null;
  },
  async create(data) {
    const novo = normalizeComodo(data);
    const row = check(await supabase.from('comodos').insert({
      nome: novo.nome,
      imagem: novo.imagem,
      apenas_suite_members: novo.apenassuiteMembers,
      pessoas_necessarias: novo.pessoasNecessarias,
      permitir_multiplas_atribuicoes: novo.permitirMultiplasAtribuicoes,
      obrigatorio: novo.obrigatorio,
      ordem: novo.ordem
    }).select().single());
    return normalizeComodo(comodoFromDb(row));
  },
  async update(id, changes) {
    const row = check(await supabase.from('comodos').update(comodoChangesToDb(changes)).eq('id', id).select().maybeSingle());
    return row ? normalizeComodo(comodoFromDb(row)) : null;
  },
  async remove(id) {
    const rows = check(await supabase.from('comodos').delete().eq('id', id).select());
    return rows.length > 0;
  }
};

// ===== INFRAÇÕES =====
const infracaoFromDb = (row) => ({
  id: row.id,
  integranteId: row.integrante_id,
  integranteNome: row.integrante_nome,
  descricao: row.descricao,
  dataSemana: row.data_semana,
  dataRegistro: row.data_registro
});

export const InfracoesStore = {
  async list() {
    const rows = check(await supabase.from('infracoes').select('*'));
    return rows.map(infracaoFromDb);
  },
  async findById(id) {
    return (await this.list()).find((infracao) => sameId(infracao.id, id)) || null;
  },
  async listByIntegranteId(integranteId) {
    return (await this.list()).filter((infracao) => sameId(infracao.integranteId, integranteId));
  },
  async create({ integranteId, integranteNome, descricao, dataSemana }) {
    const row = check(await supabase.from('infracoes').insert({
      integrante_id: String(integranteId),
      integrante_nome: integranteNome,
      descricao: descricao.trim(),
      data_semana: dataSemana || new Date().toISOString()
    }).select().single());
    return infracaoFromDb(row);
  },
  async update(id, changes) {
    const dbChanges = {};
    if (changes.descricao !== undefined) dbChanges.descricao = changes.descricao;
    if (changes.dataSemana !== undefined) dbChanges.data_semana = changes.dataSemana;

    const row = check(await supabase.from('infracoes').update(dbChanges).eq('id', id).select().maybeSingle());
    return row ? infracaoFromDb(row) : null;
  },
  async remove(id) {
    const rows = check(await supabase.from('infracoes').delete().eq('id', id).select());
    return rows.length > 0;
  }
};

// ===== ESCALAS =====
const escalaFromDb = (row) => ({
  id: row.id,
  ano: row.ano,
  semana: row.semana,
  integranteId: row.integrante_id,
  integranteNome: row.integrante_nome,
  folga: row.folga,
  comodos: row.comodos,
  dataInicio: row.data_inicio,
  dataFim: row.data_fim,
  alerta: row.alerta
});

const escalaToDb = (escala) => ({
  id: escala.id,
  ano: escala.ano,
  semana: escala.semana,
  integrante_id: escala.integranteId,
  integrante_nome: escala.integranteNome,
  folga: escala.folga,
  comodos: escala.comodos,
  data_inicio: escala.dataInicio,
  data_fim: escala.dataFim,
  alerta: escala.alerta
});

export const EscalasStore = {
  async list() {
    const rows = check(await supabase.from('escalas').select('*'));
    return rows.map(escalaFromDb);
  },
  async findById(id) {
    return (await this.list()).find((escala) => sameId(escala.id, id)) || null;
  },
  async listBySemana(ano, semana) {
    const rows = check(await supabase.from('escalas').select('*').eq('ano', ano).eq('semana', semana));
    return rows.map(escalaFromDb);
  },
  async replaceSemana(ano, semana, novasLinhas) {
    // Delegado a uma função Postgres (replace_semana_escala) que faz delete+insert
    // dentro de uma única transação serializada por advisory lock, evitando duplicação
    // de linhas quando duas gerações de escala da mesma semana rodam ao mesmo tempo.
    const rows = check(await supabase.rpc('replace_semana_escala', {
      p_ano: ano,
      p_semana: semana,
      p_linhas: novasLinhas.map(escalaToDb)
    }));
    return rows.map(escalaFromDb);
  },
  async removeSemana(ano, semana) {
    const rows = check(await supabase.from('escalas').delete().eq('ano', ano).eq('semana', semana).select());
    return rows.length;
  },
  async update(id, changes) {
    const dbChanges = {};
    if (changes.comodos !== undefined) dbChanges.comodos = changes.comodos;
    if (changes.folga !== undefined) dbChanges.folga = changes.folga;

    const row = check(await supabase.from('escalas').update(dbChanges).eq('id', id).select().maybeSingle());
    return row ? escalaFromDb(row) : null;
  },
  async updateMany(updates) {
    const resultados = [];
    for (const { id, changes } of updates) {
      const atualizada = await this.update(id, changes);
      if (atualizada) resultados.push(atualizada);
    }
    return resultados;
  }
};

// ===== CONFIG =====
const DEFAULT_CORES = {
  primaria: '#DC0000',
  secundaria: '#FFD700',
  branca: '#FFFFFF',
  preta: '#000000'
};

const configFromDb = (row) => ({
  logo: row.logo,
  background: row.background,
  motivacaoDestaque: row.motivacao_destaque,
  cores: { ...DEFAULT_CORES, ...(row.cores || {}) }
});

export const ConfigStore = {
  async get() {
    const row = check(await supabase.from('config').select('*').eq('id', 1).single());
    return configFromDb(row);
  },
  async save(config) {
    const row = check(await supabase.from('config').update({
      logo: config.logo,
      background: config.background,
      motivacao_destaque: config.motivacaoDestaque,
      cores: { ...DEFAULT_CORES, ...(config.cores || {}) }
    }).eq('id', 1).select().single());
    return configFromDb(row);
  }
};
