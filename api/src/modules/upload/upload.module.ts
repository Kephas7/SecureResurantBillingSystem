import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [
    // In-memory storage: uploads are held as a Buffer only until
    // UploadService's magic-byte check (Layer 3) passes, then written
    // to disk with a UUID filename. See upload.service.ts for the full
    // rationale — an invalid file never touches disk, not even briefly.
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
