import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { AuditLogService } from '../../common/services/audit-log.service';

/**
 * SECURITY: Image upload validation strategy (document in report)
 *
 * Defence-in-depth approach with four independent layers:
 *
 * Layer 1 — Multer file filter (in controller):
 *   Rejects files whose Content-Type header is not an allowed
 *   image MIME type. Fast, but client-controlled — not trusted alone.
 *
 * Layer 2 — Multer size/count limits (in controller):
 *   Hard 2MB cap and single-file-per-request limit enforced at the
 *   multipart-parsing layer, before any application code runs.
 *
 * Layer 3 — Magic byte validation (this file):
 *   Reads the actual file content signature via the `file-type` package
 *   (installed for this purpose — see Step 1) and compares it against
 *   an allow-list of {mime, extension} pairs. This is the only
 *   server-controlled check that cannot be spoofed by the client — a
 *   file claiming to be a JPEG via its Content-Type header or `.jpg`
 *   extension must actually start with the real JPEG signature (FF D8 FF).
 *   (OWASP File Upload Cheat Sheet — "Validate File Content")
 *
 *   Deviation from a hand-rolled magic-byte table: `file-type` is used
 *   instead of manually comparing byte arrays. A hand-rolled check for
 *   WebP in particular is easy to get subtly wrong — WebP files start
 *   with a generic 4-byte RIFF container header (0x52 0x49 0x46 0x46),
 *   which WAV and AVI files *also* start with; a correct check must also
 *   confirm the "WEBP" fourCC at offset 8. `file-type` handles this
 *   (and every other supported format's real signature) correctly, so
 *   it is used here instead of re-implementing signature parsing.
 *
 * Layer 4 — UUID filename, generated only after Layer 3 passes:
 *   The original filename is discarded entirely. A UUID is used as the
 *   stored filename, preventing:
 *     - Path traversal: ../../etc/passwd
 *     - Overwriting existing files via predictable names
 *     - Execution of uploaded scripts via URL guessing
 *   (OWASP File Upload Cheat Sheet — "Do Not Rely on Filename")
 *
 * Storage strategy — validate-before-write, not write-then-delete:
 *   The controller uses multer's in-memory storage (see UploadModule),
 *   so the raw upload only ever exists as a Buffer in this process's
 *   memory until Layer 3 passes. An invalid upload is rejected and
 *   discarded without ever touching disk — there is no window (however
 *   small) where an unvalidated file is present in the statically-served
 *   uploads directory.
 *
 * Limitation to document in report:
 *   Images are not re-encoded/resized before storage. A truly
 *   hardened implementation would pass every upload through an
 *   image processing library (e.g. sharp) to strip EXIF metadata
 *   and re-encode the pixel data, destroying any embedded payloads.
 *   This is noted as a future improvement.
 */

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// Allowed image types. Keyed by the actual, magic-byte-detected MIME
// type (from `file-type`), each mapped to the extension used for the
// stored filename — never the client-supplied original extension.
const ALLOWED_IMAGE_TYPES: ReadonlyArray<{ mime: string; ext: string }> = [
  { mime: 'image/jpeg', ext: '.jpg' },
  { mime: 'image/png', ext: '.png' },
  { mime: 'image/webp', ext: '.webp' },
];

// Only ever matches a filename this service itself generated
// (`randomUUID()` + one of the allowed extensions) — a whitelist, not a
// blacklist, so there is no encoding/edge case (e.g. "..%2f", alternate
// data streams, embedded nulls) that could slip through, unlike a
// blacklist that rejects specific substrings like ".." or "/".
const SAFE_STORED_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly auditLog: AuditLogService) {}

  async validateAndStore(file: Express.Multer.File, actorId: string): Promise<{ imageUrl: string }> {
    // Belt-and-braces: multer's `limits.fileSize` (see controller) already
    // enforces this at the multipart-parsing layer, before this method
    // ever runs. Re-checked here in case that configuration ever drifts.
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 2MB size limit');
    }

    // Layer 3: magic byte validation (see class-level comment).
    const detected = await fileTypeFromBuffer(file.buffer);
    const allowed = detected && ALLOWED_IMAGE_TYPES.find((t) => t.mime === detected.mime);

    if (!allowed) {
      // SECURITY: do not reveal what the actual detected type was (or
      // that detection failed vs. mismatched) — that distinction could
      // help an attacker iterate toward a bypass.
      throw new BadRequestException(
        'File content does not match an allowed image type. Upload a valid JPEG, PNG, or WebP image.',
      );
    }

    // Layer 4: UUID filename, generated only now that content is verified.
    const storedFilename = `${randomUUID()}${allowed.ext}`;
    await writeFile(join(UPLOAD_DIR, storedFilename), file.buffer);

    const imageUrl = `/uploads/${storedFilename}`;

    // Audit log — the stored UUID filename only. The original filename
    // is never stored, logged, or returned anywhere in this system: it
    // may contain path traversal attempts, PII, or be used to fingerprint
    // the uploader's device/software (OWASP A09: Security Logging and
    // Monitoring Failures — logs must not themselves become a place
    // sensitive/attacker-controlled data leaks to).
    await this.auditLog.write(actorId, 'IMAGE_UPLOADED', 'MenuItem', undefined, {
      storedFilename,
      size: file.size,
      mimetype: detected.mime,
    });

    return { imageUrl };
  }

  async deleteUploadedFile(filename: string, actorId: string): Promise<void> {
    // Whitelist match only — see SAFE_STORED_FILENAME comment above.
    // Rejects path traversal (../../etc/passwd), absolute paths, and
    // anything that isn't exactly a filename this service could have
    // generated itself.
    if (!SAFE_STORED_FILENAME.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }

    const filePath = join(UPLOAD_DIR, filename);

    try {
      await unlink(filePath);
    } catch (err: unknown) {
      // Deleting a file that's already gone (e.g. a repeated request)
      // should not be treated as a hard failure — log and continue so
      // the audit trail and API response stay consistent either way.
      this.logger.warn(`Could not delete file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }

    await this.auditLog.write(actorId, 'IMAGE_DELETED', 'MenuItem', undefined, { storedFilename: filename });
  }
}
