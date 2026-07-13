import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function getKey() {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret || secret.length < 16) throw new Error('ENCRYPTION_KEY غير مضبوط أو قصير جداً')
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptSecret(payload: { ciphertext: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

