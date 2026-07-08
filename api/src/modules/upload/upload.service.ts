import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
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
 * Layer 3 — Magic byte validation (this file, detectImageType()):
 *   Reads the actual file content signature and compares it against
 *   the three allowed image formats' real signatures. This is the only
 *   server-controlled check that cannot be spoofed by the client — a
 *   file claiming to be a JPEG via its Content-Type header or `.jpg`
 *   extension must actually start with the real JPEG signature (FF D8 FF).
 *   (OWASP File Upload Cheat Sheet — "Validate File Content")
 *
 *   Note on using a hand-rolled check instead of the `file-type` npm
 *   package: `file-type` was evaluated first (and is still installed as
 *   a transitive dependency of @nestjs/common), but rejected for this
 *   code path for two independent reasons discovered during
 *   implementation:
 *     1. Versions of `file-type` that still ship CommonJS builds (v16.x)
 *        predate its `fileTypeFromBuffer` API; the current major (v22)
 *        is ESM-only and cannot be statically imported from this
 *        project's CommonJS TypeScript build without changing
 *        `moduleResolution` project-wide — too large a change to make
 *        for one endpoint.
 *     2. More importantly: even the CJS-compatible v16.5.4 falls inside
 *        the version range flagged by two moderate-severity advisories
 *        (GHSA-5v7r-6r5c-r473 — infinite loop in the ASF/video-container
 *        parser; GHSA-j47w-4g3g-c36v — ZIP-bomb DoS in the ZIP parser).
 *        `file-type` detects dozens of formats — video containers,
 *        archives, executables — and that detection code runs on the
 *        full buffer before any allow-list check of ours ever sees the
 *        result, so those unrelated parsers remain a reachable attack
 *        surface through this endpoint even though this app only ever
 *        wants to recognise 3 image formats.
 *   Given this endpoint only needs to distinguish 3 well-documented,
 *   simple, fixed-offset binary signatures, a small correctly-written
 *   check (see detectImageType() below) has no dependency surface at
 *   all and cannot inherit vulnerabilities from parsers for formats
 *   this application will never accept.
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

// Real file signatures for exactly the 3 formats this endpoint accepts.
// Source: https://en.wikipedia.org/wiki/List_of_file_signatures
//
// WebP requires checking BOTH the 4-byte RIFF container header AND the
// "WEBP" fourCC at offset 8 - RIFF alone is a generic container header
// also used by WAV and AVI files, so checking only the first 4 bytes
// would incorrectly accept those as valid WebP images.
function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' };
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 && // "RIFF"
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50 // "WEBP"
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }

  return null;
}

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
    const detected = detectImageType(file.buffer);

    if (!detected) {
      // SECURITY: do not reveal what the actual detected type was (or
      // that detection failed vs. mismatched) — that distinction could
      // help an attacker iterate toward a bypass.
      throw new BadRequestException(
        'File content does not match an allowed image type. Upload a valid JPEG, PNG, or WebP image.',
      );
    }

    // Layer 4: UUID filename, generated only now that content is verified.
    const storedFilename = `${randomUUID()}${detected.ext}`;
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
