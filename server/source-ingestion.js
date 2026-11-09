import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';
import { load } from 'cheerio';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_PARAGRAPH_CHARACTERS = 100_000;
const MAX_REDIRECTS = 5;
const WORDS_PER_CHUNK = 800;
const WORDS_OVERLAP = 120;
const REQUEST_TIMEOUT_MS = 15_000;

export class SourceIngestionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'SourceIngestionError';
    this.status = status;
  }
}

function isPublicAddress(address) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

async function resolvePublicAddresses(hostname) {
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SourceIngestionError('The source host could not be resolved.', 422);
  }

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new SourceIngestionError('The source URL must resolve only to public IP addresses.');
  }
  return addresses;
}

function validateSourceUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SourceIngestionError('Enter a valid public webpage or direct PDF URL.');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  ) {
    throw new SourceIngestionError('Only public HTTP or HTTPS source URLs are supported.');
  }
  return url;
}

async function fetchBoundedResponse(url, addresses) {
  const firstAddress = addresses[0];
  const dispatcher = new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (options?.all) {
          callback(null, addresses);
          return;
        }
        callback(null, firstAddress.address, firstAddress.family);
      },
    },
  });

  try {
    const response = await fetch(url, {
      dispatcher,
      redirect: 'manual',
      headers: {
        Accept: 'text/html, application/pdf;q=0.9',
        'User-Agent': 'AgriAdvisorKnowledgeImporter/1.0',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { response, close: () => dispatcher.close() };
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
}

async function readResponseBody(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new SourceIngestionError('The source is larger than the 10 MB limit.', 413);
  }

  if (!response.body) {
    throw new SourceIngestionError('The source returned an empty response.', 422);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new SourceIngestionError('The source is larger than the 10 MB limit.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

export async function fetchPublicResource(value) {
  let url = validateSourceUrl(value);
  let response;
  let activeResponse;
  let redirects = 0;

  while (true) {
    const addresses = await resolvePublicAddresses(url.hostname);
    try {
      activeResponse = await fetchBoundedResponse(url, addresses);
      response = activeResponse.response;
    } catch (error) {
      if (error instanceof SourceIngestionError) throw error;
      throw new SourceIngestionError('The public source could not be fetched.', 422);
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    try {
      await response.body?.cancel();
    } finally {
      await activeResponse.close();
    }
    if (!location || redirects >= MAX_REDIRECTS) {
      throw new SourceIngestionError('The source has too many or invalid redirects.', 422);
    }
    url = validateSourceUrl(new URL(location, url).toString());
    redirects += 1;
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } finally {
      await activeResponse.close();
    }
    throw new SourceIngestionError(`The source server returned HTTP ${response.status}.`, 422);
  }

  const contentType = (response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!['text/html', 'application/pdf'].includes(contentType)) {
    try {
      await response.body?.cancel();
    } finally {
      await activeResponse.close();
    }
    throw new SourceIngestionError('The URL must point to a public webpage or PDF.', 415);
  }

  try {
    return {
      bytes: await readResponseBody(response),
      contentType,
      url: url.toString(),
    };
  } finally {
    await activeResponse.close();
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function chunkSections(sections) {
  const chunks = [];
  for (const section of sections) {
    const words = normalizeText(section.text).split(' ').filter(Boolean);
    for (let start = 0; start < words.length; start += WORDS_PER_CHUNK - WORDS_OVERLAP) {
      const content = words.slice(start, start + WORDS_PER_CHUNK).join(' ').trim();
      if (content) {
        chunks.push({ index: chunks.length, location: section.location, content });
      }
    }
  }
  return chunks;
}

function extractWebSections(html) {
  const $ = load(html);
  $('script, style, noscript, svg, nav, header, footer, form, aside').remove();

  const pageTitle = normalizeText($('title').first().text()) ||
    normalizeText($('h1').first().text());
  const sections = [];
  let currentHeading = '';
  let currentText = [];

  function flush() {
    const text = normalizeText(currentText.join(' '));
    if (text) {
      sections.push({
        location: currentHeading ? `Section: ${currentHeading}` : 'Webpage content',
        text,
      });
    }
    currentText = [];
  }

  $('body').find('h1, h2, h3, h4, h5, h6, p, li, blockquote').each((_index, element) => {
    const text = normalizeText($(element).text());
    if (!text) return;
    if (/^h[1-6]$/.test(element.tagName.toLowerCase())) {
      flush();
      currentHeading = text;
    } else {
      currentText.push(text);
    }
  });
  flush();

  if (sections.length === 0) {
    const text = normalizeText($('body').text());
    if (text) sections.push({ location: 'Webpage content', text });
  }
  return { pageTitle, sections };
}

async function extractPdfSections(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new SourceIngestionError('The file is not a valid PDF.', 422);
  }

  const sections = [];
  let pageNumber = 0;
  try {
    await pdfParse(bytes, {
      pagerender: async (page) => {
        pageNumber += 1;
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        sections.push({ location: `Page ${pageNumber}`, text });
        return text;
      },
    });
  } catch {
    throw new SourceIngestionError('The PDF could not be read. Use a valid text-based PDF.', 422);
  }

  const nonEmptySections = sections.filter((section) => normalizeText(section.text));
  if (nonEmptySections.length === 0) {
    throw new SourceIngestionError('The PDF contains no extractable text. Scanned PDFs are not supported.', 422);
  }
  return nonEmptySections;
}

function validateTitle(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SourceIngestionError('A source title is required.');
  }
  const title = value.trim();
  if (title.length > 200) {
    throw new SourceIngestionError('The source title must be 200 characters or fewer.');
  }
  return title;
}

let storageClient;
function getStorage() {
  const required = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ENDPOINT_URL_S3',
    'AWS_REGION',
    'SOURCES_BUCKET',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Object storage is not configured. Missing: ${missing.join(', ')}.`);
  }

  if (!storageClient) {
    storageClient = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      region: process.env.AWS_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return {
    async putObject(key, body) {
      await storageClient.send(new PutObjectCommand({
        Bucket: process.env.SOURCES_BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
      }));
    },
    async deleteObject(key) {
      await storageClient.send(new DeleteObjectCommand({
        Bucket: process.env.SOURCES_BUCKET,
        Key: key,
      }));
    },
  };
}

export function createSourceIngestion({
  repository,
  storage,
  fetchResource = fetchPublicResource,
  createId = randomUUID,
}) {
  return {
    list: () => repository.listSources(),

    async ingest({ body, file, userId }) {
      let title;
      let sourceType;
      let sourceUrl = null;
      let pdfBytes = null;
      let sections;

      if (file) {
        if (file.mimetype !== 'application/pdf') {
          throw new SourceIngestionError('Choose a PDF file.');
        }
        if (file.size > MAX_SOURCE_BYTES) {
          throw new SourceIngestionError('PDF files must be 10 MB or smaller.', 413);
        }
        pdfBytes = file.buffer;
        title = validateTitle(file.originalname.replace(/\.pdf$/i, '') || 'PDF source');
        sourceType = 'pdf';
        sections = await extractPdfSections(pdfBytes);
      } else if (body?.type === 'paragraph') {
        title = validateTitle(body.title);
        if (typeof body.text !== 'string' || body.text.trim().length === 0) {
          throw new SourceIngestionError('Paste the paragraph you want to add.');
        }
        if (body.text.length > MAX_PARAGRAPH_CHARACTERS) {
          throw new SourceIngestionError('Pasted text must be 100,000 characters or fewer.', 413);
        }
        sourceType = 'paragraph';
        sections = [{ location: 'Paragraph', text: body.text }];
      } else if (body?.type === 'link' && typeof body.url === 'string') {
        const resource = await fetchResource(body.url);
        sourceUrl = resource.url;
        if (resource.contentType === 'application/pdf') {
          pdfBytes = resource.bytes;
          title = validateTitle(new URL(sourceUrl).pathname.split('/').pop()?.replace(/\.pdf$/i, '') || 'PDF source');
          sourceType = 'pdf';
          sections = await extractPdfSections(pdfBytes);
        } else {
          const extracted = extractWebSections(resource.bytes.toString('utf8'));
          title = validateTitle(extracted.pageTitle || new URL(sourceUrl).hostname);
          sourceType = 'webpage';
          sections = extracted.sections;
        }
      } else {
        throw new SourceIngestionError('Choose a public link, PDF file, or pasted paragraph.');
      }

      const chunks = chunkSections(sections);
      if (chunks.length === 0) {
        throw new SourceIngestionError('No searchable text could be extracted from this source.', 422);
      }

      const id = createId();
      const objectKey = pdfBytes ? `sources/${id}.pdf` : null;
      const actualStorage = storage ?? getStorage();
      if (objectKey) await actualStorage.putObject(objectKey, pdfBytes);

      try {
        await repository.createSource({
          id,
          title,
          sourceType,
          sourceUrl,
          objectKey,
          createdBy: userId,
          chunks,
        });
      } catch (error) {
        if (objectKey) {
          try {
            await actualStorage.deleteObject(objectKey);
          } catch (cleanupError) {
            console.error('Failed to remove an unindexed source file after database failure.', cleanupError);
          }
        }
        throw error;
      }

      return {
        id,
        title,
        source_type: sourceType,
        source_url: sourceUrl,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },

    async rename(id, title) {
      const normalizedTitle = validateTitle(title);
      return repository.updateSourceTitle(id, normalizedTitle);
    },

    async remove(id) {
      const source = await repository.findSource(id);
      if (!source) return false;

      const deleted = await repository.deleteSource(id);
      if (source.object_key) {
        const actualStorage = storage ?? getStorage();
        await actualStorage.deleteObject(source.object_key);
      }
      return deleted;
    },
  };
}

export const SOURCE_LIMITS = {
  maxFileBytes: MAX_SOURCE_BYTES,
  maxParagraphCharacters: MAX_PARAGRAPH_CHARACTERS,
  maxRedirects: MAX_REDIRECTS,
  wordsPerChunk: WORDS_PER_CHUNK,
  wordsOverlap: WORDS_OVERLAP,
};
