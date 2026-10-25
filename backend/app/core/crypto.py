import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _get_aesgcm() -> AESGCM:
    key_bytes = base64.b64decode(settings.ENCRYPTION_KEY_B64)
    if len(key_bytes) != 32:
        raise ValueError("Encryption key must be exactly 32 bytes for AES-256")
    return AESGCM(key_bytes)

def encrypt_data(plaintext: str) -> str:
    """Encrypts plaintext with AES-256-GCM returning urlsafe base64 string (nonce + ciphertext + tag)"""
    if not plaintext:
        return ""
    aesgcm = _get_aesgcm()
    nonce = os.urandom(12)
    data = plaintext.encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")

def decrypt_data(token: str) -> str:
    """Decrypts urlsafe base64 string (nonce + ciphertext + tag) with AES-256-GCM"""
    if not token:
        return ""
    raw = base64.urlsafe_b64decode(token.encode("utf-8"))
    if len(raw) < 28: # 12 bytes nonce + 16 bytes tag minimum
        raise ValueError("Invalid ciphertext length")
    nonce = raw[:12]
    ciphertext = raw[12:]
    aesgcm = _get_aesgcm()
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")

def process_id_document(doc_number: str) -> tuple[str, str, str]:
    """
    Encrypts an ID document number.
    Returns: (encrypted_doc, last4, lookup_hash)
    """
    clean_doc = doc_number.strip().upper()
    last4 = clean_doc[-4:] if len(clean_doc) >= 4 else clean_doc
    lookup_hash = hashlib.sha256(clean_doc.encode("utf-8")).hexdigest()
    encrypted = encrypt_data(clean_doc)
    return encrypted, last4, lookup_hash
