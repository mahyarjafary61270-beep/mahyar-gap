import { hash, verify } from '@node-rs/argon2';
import { argonOptions } from '../db/migrate.js';

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, argonOptions);
}

export function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return verify(hashed, plain);
}
