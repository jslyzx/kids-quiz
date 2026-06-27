import { Module } from '@nestjs/common';
import { BaiduOcrService } from './baidu-ocr.service';
import { PaddleOcrService } from './paddle-ocr.service';
import { OcrController } from './ocr.controller';

@Module({
  controllers: [OcrController],
  providers: [BaiduOcrService, PaddleOcrService],
})
export class OcrModule {}
