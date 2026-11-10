import type { DocumentPickerAsset } from 'expo-document-picker';

import { getAccessToken } from '@/lib/auth';

export type KnowledgeSource = {
  id: string;
  title: string;
  source_type: 'webpage' | 'pdf' | 'paragraph';
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

type SourceListResponse = {
  sources: KnowledgeSource[];
  canManage: boolean;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnowledgeSource(value: unknown): value is KnowledgeSource {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.source_type === 'webpage' ||
      value.source_type === 'pdf' ||
      value.source_type === 'paragraph') &&
    (value.source_url === null || typeof value.source_url === 'string') &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error('The source service is unavailable. Check the API connection and retry.');
  }
}

async function getErrorMessage(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The source service returned an invalid response.');
  }
  if (isRecord(payload) && typeof payload.error === 'string') {
    throw new Error(payload.error);
  }
  throw new Error(`The source request failed with status ${response.status}.`);
}

async function getCreatedSource(response: Response): Promise<KnowledgeSource> {
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isKnowledgeSource(payload.source)) {
    throw new Error('The source service returned data in an unexpected format.');
  }
  return payload.source;
}

export async function listSources(): Promise<SourceListResponse> {
  const response = await request('/sources');
  if (!response.ok) await getErrorMessage(response);
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.sources) ||
    !payload.sources.every(isKnowledgeSource) ||
    typeof payload.canManage !== 'boolean'
  ) {
    throw new Error('The source service returned data in an unexpected format.');
  }
  return { sources: payload.sources, canManage: payload.canManage };
}

export async function addSourceFromLink(url: string) {
  const response = await request('/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'link', url }),
  });
  if (!response.ok) await getErrorMessage(response);
  return getCreatedSource(response);
}

export async function addSourceParagraph(title: string, text: string) {
  const response = await request('/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'paragraph', title, text }),
  });
  if (!response.ok) await getErrorMessage(response);
  return getCreatedSource(response);
}

export async function addPdfSource(asset: DocumentPickerAsset) {
  const hasPdfMimeType = asset.mimeType === 'application/pdf';
  const hasPdfExtension = asset.name.toLowerCase().endsWith('.pdf');
  if (!hasPdfMimeType && !hasPdfExtension) {
    throw new Error('Choose a PDF file.');
  }
  if (asset.size !== undefined && asset.size > 10 * 1024 * 1024) {
    throw new Error('PDF files must be 10 MB or smaller.');
  }

  let file: Blob;
  try {
    const fileResponse = await fetch(asset.uri);
    if (!fileResponse.ok) throw new Error('Could not read the selected PDF.');
    file = await fileResponse.blob();
  } catch {
    throw new Error('Could not read the selected PDF.');
  }

  const formData = new FormData();
  formData.append('file', file, asset.name);
  const response = await request('/sources', { method: 'POST', body: formData });
  if (!response.ok) await getErrorMessage(response);
  return getCreatedSource(response);
}

export async function renameSource(id: string, title: string) {
  const response = await request(`/sources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) await getErrorMessage(response);
}

export async function deleteSource(id: string) {
  const response = await request(`/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) await getErrorMessage(response);
}
