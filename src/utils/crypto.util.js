import crypto from 'crypto';

function getEncryptionSecret(secret) {
    if (!secret || typeof secret !== 'string' || secret.length < 16) {
        throw new Error('Encryption secret is not configured or too short');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptText(plainText, secret) {
    const key = getEncryptionSecret(secret);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`;
}

function decryptText(payload, secret) {
    const [ivHex, tagHex, encryptedBase64] = String(payload || '').split(':');
    if (!ivHex || !tagHex || !encryptedBase64) {
        throw new Error('Invalid encrypted payload format');
    }

    const key = getEncryptionSecret(secret);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
}

export { encryptText, decryptText };
