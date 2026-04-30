import { nanoid } from 'nanoid/non-secure';

export function generateId(): string {
  return nanoid();
}

export function newClientId(): string {
  return nanoid(21);
}

export function newGenerationId(): string {
  return nanoid(21);
}
