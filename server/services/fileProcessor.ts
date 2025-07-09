import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export class FileProcessor {
  private static upload = multer({
    storage: multer.diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
      }
    }),
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/markdown',
        'text/plain'
      ];
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Unsupported file type'), false);
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB
    }
  });

  static getUploadMiddleware() {
    return this.upload.single('file');
  }

  static async processFile(filePath: string, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    
    try {
      switch (ext) {
        case '.pdf':
          return await this.processPDF(filePath);
        case '.xlsx':
        case '.xls':
          return await this.processExcel(filePath);
        case '.docx':
        case '.doc':
          return await this.processWord(filePath);
        case '.md':
        case '.txt':
          return await this.processText(filePath);
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }
    } finally {
      // Clean up uploaded file
      await fs.unlink(filePath).catch(console.error);
    }
  }

  private static async processPDF(filePath: string): Promise<string> {
    const pdf = await import("pdf-parse");
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf.default(dataBuffer);
    return data.text;
  }

  private static async processExcel(filePath: string): Promise<string> {
    const XLSX = await import("xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    return JSON.stringify(jsonData, null, 2);
  }

  private static async processWord(filePath: string): Promise<string> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  private static async processText(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }
}
