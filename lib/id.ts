import { nanoid } from 'nanoid/non-secure';

export function generateId(): string {
  return nanoid();
}
