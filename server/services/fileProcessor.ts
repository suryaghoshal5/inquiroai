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
        'text/plain',
        'text/x-markdown'
      ];
      
      // Also check file extension for markdown files
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
      const allowedExtensions = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'md', 'txt'];
      
      if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension || '')) {
        cb(null, true);
      } else {
        console.log(`Rejected file: ${file.originalname}, mimetype: ${file.mimetype}, extension: ${fileExtension}`);
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
    try {
      const pdf = await import("pdf-parse");
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf.default(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('PDF processing error:', error);
      // Fallback: return a message indicating the file was uploaded but couldn't be processed
      return `[PDF file uploaded: ${path.basename(filePath)}]\n\nNote: PDF content could not be extracted automatically. Please manually describe the content of this PDF file if needed for the AI analysis.`;
    }
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
