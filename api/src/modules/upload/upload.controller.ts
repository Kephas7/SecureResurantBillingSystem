import { Controller, Post, Delete, Param, UseInterceptors, UploadedFile, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { UploadService } from './upload.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /upload/menu-item-image
   *
   * SECURITY:
   * - @Roles('ADMIN', 'MANAGER'): only privileged roles can upload.
   *   Kitchen staff, waiters, and cashiers have no reason to upload
   *   images — principle of least privilege.
   * - FileInterceptor uses in-memory storage (see UploadModule) rather
   *   than disk storage: the raw upload is held as a Buffer only, so an
   *   invalid file is rejected in UploadService without ever having
   *   touched disk (see upload.service.ts's class-level comment).
   *     fileFilter: Layer 1 MIME type check (client-supplied but fast)
   *     limits: Layer 2 — 2MB hard cap, one file per request
   *   UploadService.validateAndStore() performs Layers 3 and 4 (magic
   *   byte validation, UUID filename generation) and writes the audit log.
   * - @Throttle: without a limit here, an authenticated Manager/Admin
   *   account (or a stolen session for one) could flood this endpoint
   *   with upload requests, exhausting disk space or CPU (multipart
   *   parsing + magic-byte checks per request) — a DoS route that
   *   doesn't require guessing anything, just repeated legitimate-looking
   *   calls. 20/min is well above any plausible legitimate editing
   *   session's pace but bounds sustained/automated abuse.
   */
  @Post('menu-item-image')
  @Roles('ADMIN', 'MANAGER')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('image', {
      // In-memory, not disk: nothing is written to the uploads directory
      // until UploadService's magic-byte check (Layer 3) has passed.
      storage: memoryStorage(),

      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB — hard limit at the multer layer
        files: 1, // only one file per request
      },

      fileFilter: (_req, file, cb) => {
        // Layer 1: MIME type check.
        // Note: this is client-supplied via the Content-Type header of
        // the multipart part. It is a first, fast filter only — magic
        // byte validation in UploadService is the authoritative content
        // check (this header can be set to anything by the client).
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          return cb(new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadMenuItemImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() userId: string,
  ): Promise<{ imageUrl: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded. Send a file in the "image" field.');
    }

    return this.uploadService.validateAndStore(file, userId);
  }

  /**
   * DELETE /upload/menu-item-image/:filename
   *
   * Called when a Manager replaces or removes a menu item image.
   * Only the UUID filename is accepted — path traversal is blocked
   * in UploadService.deleteUploadedFile().
   */
  @Delete('menu-item-image/:filename')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMenuItemImage(@Param('filename') filename: string, @CurrentUser() userId: string): Promise<void> {
    await this.uploadService.deleteUploadedFile(filename, userId);
  }
}
