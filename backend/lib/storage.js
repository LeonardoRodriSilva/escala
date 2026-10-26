import { randomUUID } from 'crypto';
import path from 'path';
import { supabase } from '../data/supabaseClient.js';

const BUCKET = 'uploads';

const getPublicUrl = (key) => supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

// Extrai a chave dentro do bucket a partir de uma URL pública do Supabase Storage
const getKeyFromPublicUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const marker = `/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
};

export async function uploadImage(buffer, originalName, mimetype) {
  const key = `${randomUUID()}${path.extname(originalName)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: mimetype,
    upsert: false
  });
  if (error) throw error;
  return { filename: key, path: getPublicUrl(key) };
}

export async function deleteImage(imagePathOrUrl) {
  const key = getKeyFromPublicUrl(imagePathOrUrl);
  if (!key) return;
  await supabase.storage.from(BUCKET).remove([key]);
}

const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export async function listGalleryImages({ exclude = [] } = {}) {
  const excludedKeys = new Set(exclude.map(getKeyFromPublicUrl).filter(Boolean));
  // O Storage também lista em páginas: busca até vir uma página vazia
  const arquivos = [];
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000, offset: arquivos.length });
    if (error) throw error;
    if (!data || data.length === 0) break;
    arquivos.push(...data);
  }

  return arquivos
    .filter((entry) => IMAGE_EXTENSION_REGEX.test(entry.name))
    .filter((entry) => !excludedKeys.has(entry.name))
    .map((entry) => ({ filename: entry.name, path: getPublicUrl(entry.name) }));
}

export async function deleteImageByFilename(filename) {
  await supabase.storage.from(BUCKET).remove([filename]);
}

export function getKeyFromUrl(url) {
  return getKeyFromPublicUrl(url);
}
