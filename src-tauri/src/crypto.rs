//! Account-file encryption.
//!
//! Mirrors the spirit of the original C# `Cryptography` class: derive a key from
//! a password with Argon2, then seal the plaintext with an authenticated cipher.
//! Format on disk: [MAGIC (8)] [salt (16)] [nonce (24)] [ciphertext..].

use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand::RngCore;

use crate::error::{AppError, AppResult};

const MAGIC: &[u8; 8] = b"RAMv1\0\0\0";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;

fn derive_key(password: &str, salt: &[u8]) -> AppResult<[u8; KEY_LEN]> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Crypto(format!("argon2: {e}")))?;
    Ok(key)
}

pub fn encrypt(plaintext: &[u8], password: &str) -> AppResult<Vec<u8>> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce);

    let key = derive_key(password, &salt)?;
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());

    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext)
        .map_err(|e| AppError::Crypto(format!("seal: {e}")))?;

    let mut out = Vec::with_capacity(MAGIC.len() + SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn decrypt(data: &[u8], password: &str) -> AppResult<Vec<u8>> {
    let header = MAGIC.len() + SALT_LEN + NONCE_LEN;
    if data.len() < header {
        return Err(AppError::Crypto("file too short / corrupt".into()));
    }
    if &data[..MAGIC.len()] != MAGIC {
        return Err(AppError::Crypto("bad file header".into()));
    }

    let salt = &data[MAGIC.len()..MAGIC.len() + SALT_LEN];
    let nonce = &data[MAGIC.len() + SALT_LEN..header];
    let ciphertext = &data[header..];

    let key = derive_key(password, salt)?;
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());

    cipher
        .decrypt(XNonce::from_slice(nonce), ciphertext)
        .map_err(|_| AppError::Crypto("wrong password or corrupt data".into()))
}
