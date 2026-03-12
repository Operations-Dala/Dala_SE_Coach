import mammoth from 'mammoth';

/**
 * Extract plain text from a .docx file buffer.
 * Returns the extracted string, or throws on failure.
 */
export async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
