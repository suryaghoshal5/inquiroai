import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key-32-chars-long!!";
const ALGORITHM = 'aes-256-gcm';

export class CryptoService {
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Validate authentication tag length for GCM mode (must be 16 bytes)
    if (authTag.length !== 16) {
      throw new Error('Invalid authentication tag length');
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  static generateKeyPreview(apiKey: string): string {
    if (apiKey.length < 8) return apiKey;
    return `${apiKey.substring(0, 3)}...${apiKey.slice(-4)}`;
  }
}
