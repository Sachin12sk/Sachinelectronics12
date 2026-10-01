import CryptoJS from 'crypto-js';

const SECRET_KEY = 'sachin_electricals_military_grade_secret_key_2026';

export const isPromptInjection = (text: string): boolean => {
  const lower = text.toLowerCase();
  const patterns = [
    "ignore previous instructions",
    "system prompt reveal",
    "bypass admin",
    "<script",
    "javascript:"
  ];
  return patterns.some(p => lower.includes(p));
};

export const secureStorage = {
  setItem: (key: string, value: any) => {
    try {
      const jsonString = JSON.stringify(value);
      const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString();
      localStorage.setItem(key, encrypted);
    } catch (e) {
      console.error("Encryption failed", e);
    }
  },
  getItem: (key: string) => {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      
      // Fallback for unencrypted data to not break existing data
      if (encrypted.startsWith('[') || encrypted.startsWith('{')) {
        return JSON.parse(encrypted);
      }

      const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
      if (!decryptedString) return null;
      return JSON.parse(decryptedString);
    } catch (e) {
      console.error("Decryption failed", e);
      return null;
    }
  }
};

export const isValidFile = (file: File): boolean => {
  const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!validTypes.includes(file.type)) return false;
  
  const validExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !validExtensions.includes(extension)) return false;

  return true;
};

export const hashPassword = (password: string, customSalt?: string): { hash: string; salt: string } => {
  const salt = customSalt || CryptoJS.lib.WordArray.random(16).toString();
  const hash = CryptoJS.SHA256(password + ':' + salt).toString();
  return { hash, salt };
};

export const verifyPassword = (candidatePassword: string, storedHash: string, salt: string): boolean => {
  if (!candidatePassword || !storedHash || !salt) return false;
  const hash = CryptoJS.SHA256(candidatePassword + ':' + salt).toString();
  return hash === storedHash;
};

export const normalizePincode = (pin: any): string => {
  if (pin === null || pin === undefined) return '';
  return String(pin).replace(/[^0-9a-zA-Z]/g, '').trim().toUpperCase();
};
