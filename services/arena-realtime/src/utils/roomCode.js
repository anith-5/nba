import { customAlphabet } from "nanoid";

// Excludes ambiguous characters (0/O, 1/I) so codes are easy to read aloud/type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(ALPHABET, 6);

export function generateRoomCode(existingCodes) {
  let code = generate();
  while (existingCodes.has(code)) {
    code = generate();
  }
  return code;
}
