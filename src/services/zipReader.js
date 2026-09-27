/**
 * Minimal, dependency-free ZIP reader built on the browser's native
 * `DecompressionStream('deflate-raw')`.
 *
 * DOCX files are ZIP packages. Reading the OOXML parts directly gives us far
 * better layout fidelity than a plain HTML conversion: real page size, real
 * margins, real column counts, real font sizes, real bullet glyphs.
 *
 * Falls back to `stored` (uncompressed) entries and skips anything it cannot
 * inflate instead of throwing, so a partially damaged DOCX still yields
 * whatever text is readable.
 */

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

const findEocd = (view) => {
  const max = Math.min(view.byteLength, 0xffff + 22);
  for (let i = view.byteLength - 22; i >= view.byteLength - max; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
};

const inflateRaw = async (bytes) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support DecompressionStream, which is required to read DOCX files. Chrome 80+, Edge 80+, Firefox 113+ or Safari 16.4+ are supported.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
};

const decodeText = (bytes) => new TextDecoder('utf-8').decode(bytes);

/**
 * Namespace-agnostic element lookup. OOXML uses the `w:` prefix, so plain
 * `querySelector('sz')` is unreliable across engines. `getElementsByTagNameNS`
 * is unambiguous and fast.
 */
export const q = (node, localName) => node ? node.getElementsByTagNameNS('*', localName)[0] || null : null;
export const qa = (node, localName) => (node ? Array.from(node.getElementsByTagNameNS('*', localName)) : []);

/** Direct-element-child lookup (ignores grandchildren). */
const child = (node, localName) => {
  if (!node) return null;
  for (const el of node.children) {
    if (el.localName === localName) return el;
  }
  return null;
};
const children = (node, localName) => {
  if (!node) return [];
  return Array.from(node.children).filter((el) => el.localName === localName);
};

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<Map<string, Uint8Array>>} map of entry path -> raw bytes
 */
export const readZipEntries = async (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd === -1) throw new Error('The DOCX package could not be read (no ZIP central directory found). The file is likely corrupt.');

  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(pointer, true) !== CDH_SIG) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLen = view.getUint16(pointer + 28, true);
    const extraLen = view.getUint16(pointer + 30, true);
    const commentLen = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decodeText(bytes.subarray(pointer + 46, pointer + 46 + nameLen));

    if (view.getUint32(localOffset, true) === LFH_SIG) {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      try {
        if (method === 0) {
          entries.set(name, data);
        } else if (method === 8) {
           
          entries.set(name, await inflateRaw(data));
        }
      } catch {
        /* keep going with the entries we could read */
      }
    }
    pointer += 46 + nameLen + extraLen + commentLen;
  }

  if (!entries.size) throw new Error('The DOCX package contains no readable entries. The file may be corrupt or encrypted.');
  return entries;
};

/** Read a single entry as a UTF-8 string. */
export const readZipText = async (zipInput, path) => {
  const entries = zipInput instanceof Map ? zipInput : await readZipEntries(zipInput);
  const bytes = entries.get(path);
  if (!bytes) return null;
  return decodeText(bytes);
};

const parseXml = (xml) => {
  if (!xml) return null;
  let doc = null;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return null;
  }
  return doc.querySelector('parsererror') ? null : doc;
};

export const twipsToPt = (twips) => (Number(twips) || 0) / 20;
export const halfPointsToPt = (hp) => Number(hp) / 2;
export const eighthPointsToPt = (ep) => Number(ep) / 8;

const onOff = (el) => {
  if (!el) return false;
  const v = el.getAttribute('w:val');
  return v === null || v === undefined || v === '1' || v === 'true' || v === 'on';
};

/** Read `word/styles.xml` -> { styleId: { name, type, basedOn, sizePt, bold, ... } } */
export const readDocxStyles = async (zipInput) => {
  const xml = await readZipText(zipInput, 'word/styles.xml');
  const out = {};
  if (!xml) return out;
  const doc = parseXml(xml);
  if (!doc) return out;

  const root = doc.documentElement;
  const docDefaults = child(child(child(root, 'docDefaults'), 'rPrDefault'), 'rPr');
  const defaults = {
    sizePt: docDefaults && q(docDefaults, 'sz') ? halfPointsToPt(q(docDefaults, 'sz').getAttribute('w:val')) : null,
    fontFamily: docDefaults && q(docDefaults, 'rFonts') ? q(docDefaults, 'rFonts').getAttribute('w:ascii') : null,
    bold: docDefaults ? onOff(q(docDefaults, 'b')) : false,
  };

  for (const style of children(root, 'style')) {
    const id = style.getAttribute('w:styleId');
    if (!id) continue;
    const rPr = child(style, 'rPr');
    const pPr = child(style, 'pPr');
    out[id] = {
      id,
      name: q(style, 'name')?.getAttribute('w:val') || id,
      type: style.getAttribute('w:type') || 'paragraph',
      basedOn: q(style, 'basedOn')?.getAttribute('w:val') || null,
      sizePt: rPr && q(rPr, 'sz') ? halfPointsToPt(q(rPr, 'sz').getAttribute('w:val')) : null,
      bold: rPr ? onOff(q(rPr, 'b')) : false,
      italic: rPr ? onOff(q(rPr, 'i')) : false,
      color: rPr && q(rPr, 'color') ? q(rPr, 'color').getAttribute('w:val') : null,
      fontFamily: rPr && q(rPr, 'rFonts') ? q(rPr, 'rFonts').getAttribute('w:ascii') || q(rPr, 'rFonts').getAttribute('w:hAnsi') : null,
      upperCase: rPr ? onOff(q(rPr, 'caps')) || onOff(q(rPr, 'smallCaps')) : false,
      align: pPr && q(pPr, 'jc') ? q(pPr, 'jc').getAttribute('w:val') : null,
    };
  }
  out.__defaults = defaults;
  return out;
};

/** Read `word/numbering.xml` -> { numId: { ilvl: { numFmt, lvlText } } } */
export const readDocxNumbering = async (zipInput) => {
  const xml = await readZipText(zipInput, 'word/numbering.xml');
  const out = {};
  if (!xml) return out;
  const doc = parseXml(xml);
  if (!doc) return out;

  const abstract = {};
  for (const a of children(doc.documentElement, 'abstractNum')) {
    const id = a.getAttribute('w:abstractNumId');
    abstract[id] = {};
    for (const lvl of children(a, 'lvl')) {
      const ilvl = lvl.getAttribute('w:ilvl') || '0';
      abstract[id][ilvl] = {
        numFmt: q(lvl, 'numFmt')?.getAttribute('w:val') || 'bullet',
        lvlText: q(lvl, 'lvlText')?.getAttribute('w:val') || '\u2022',
      };
    }
  }
  for (const num of children(doc.documentElement, 'num')) {
    const numId = num.getAttribute('w:numId');
    const ref = q(num, 'abstractNumId')?.getAttribute('w:val');
    out[numId] = abstract[ref] || {};
  }
  return out;
};

/** Read `word/settings.xml` flags that affect rendering. */
export const readDocxSettings = async (zipInput) => {
  const xml = await readZipText(zipInput, 'word/settings.xml');
  if (!xml) return {};
  const doc = parseXml(xml);
  if (!doc) return {};
  const root = doc.documentElement;
  return {
    defaultTabStop: q(root, 'defaultTabStop')?.getAttribute('w:val') || null,
    trackChanges: Boolean(q(root, 'trackChanges')),
    evenAndOddHeaders: Boolean(q(root, 'evenAndOddHeaders')),
  };
};

export default readZipEntries;
