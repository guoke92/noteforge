use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use ring::rand::{SystemRandom, SecureRandom};
use ring::pbkdf2;
use std::fs;
use std::path::Path;
use crate::error::NoteforgeError;

const CREDENTIAL_LEN: usize = 32;
const ITERATIONS: u32 = 100_000;
const SALT_LEN: usize = 16;

pub struct EncryptionService {
    rng: SystemRandom,
}

impl EncryptionService {
    pub fn new() -> Self {
        Self {
            rng: SystemRandom::new(),
        }
    }
    
    pub fn encrypt_data(&self, data: &[u8], password: &str) -> Result<Vec<u8>, NoteforgeError> {
        // Generate random salt
        let mut salt = [0u8; SALT_LEN];
        self.rng.fill(&mut salt)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        // Derive key using PBKDF2
        let mut key = [0u8; CREDENTIAL_LEN];
        pbkdf2::derive(
            pbkdf2::PBKDF2_HMAC_SHA256,
            std::num::NonZeroU32::new(ITERATIONS).unwrap(),
            &salt,
            password.as_bytes(),
            &mut key,
        );
        
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        let mut nonce_bytes = [0u8; 12];
        self.rng.fill(&mut nonce_bytes)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        // Format: salt (16) + nonce (12) + ciphertext
        let mut result = salt.to_vec();
        result.extend(nonce_bytes);
        result.extend(ciphertext);
        
        Ok(result)
    }
    
    pub fn decrypt_data(&self, encrypted: &[u8], password: &str) -> Result<Vec<u8>, NoteforgeError> {
        if encrypted.len() < SALT_LEN + 12 {
            return Err(NoteforgeError::Encryption("Invalid encrypted data".to_string()));
        }
        
        // Extract salt and nonce
        let salt = &encrypted[..SALT_LEN];
        let nonce = &encrypted[SALT_LEN..SALT_LEN + 12];
        let ciphertext = &encrypted[SALT_LEN + 12..];
        
        // Derive key using PBKDF2
        let mut key = [0u8; CREDENTIAL_LEN];
        pbkdf2::derive(
            pbkdf2::PBKDF2_HMAC_SHA256,
            std::num::NonZeroU32::new(ITERATIONS).unwrap(),
            salt,
            password.as_bytes(),
            &mut key,
        );
        
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        cipher.decrypt(Nonce::from_slice(nonce), ciphertext)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))
    }
    
    pub fn create_backup(
        &self,
        workspace_path: &Path,
        password: &str,
        output_path: &Path,
    ) -> Result<String, NoteforgeError> {
        // Create a zip of the workspace
        let zip_path = output_path.with_extension("zip");
        let _zip_file = fs::File::create(&zip_path)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        // For now, just copy the workspace directory
        // In a real implementation, we'd use a zip library
        copy_dir_all(workspace_path, &zip_path)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        // Encrypt the zip file
        let data = fs::read(&zip_path)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        let encrypted = self.encrypt_data(&data, password)?;
        fs::write(output_path, encrypted)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        // Clean up temporary zip
        let _ = fs::remove_file(&zip_path);
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    pub fn restore_backup(
        &self,
        backup_path: &Path,
        password: &str,
        output_path: &Path,
    ) -> Result<usize, NoteforgeError> {
        let encrypted = fs::read(backup_path)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        let data = self.decrypt_data(&encrypted, password)?;
        
        // Write the decrypted data
        fs::write(output_path, data)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        Ok(1)
    }
    
    pub fn store_api_key(
        &self,
        service: &str,
        key: &str,
        password: &str,
    ) -> Result<(), NoteforgeError> {
        let encrypted = self.encrypt_data(key.as_bytes(), password)?;
        let key_path = format!("{}.key", service);
        fs::write(&key_path, encrypted)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        
        Ok(())
    }
    
    pub fn retrieve_api_key(
        &self,
        service: &str,
        password: &str,
    ) -> Result<String, NoteforgeError> {
        let key_path = format!("{}.key", service);
        if !Path::new(&key_path).exists() {
            return Err(NoteforgeError::NotFound(format!("API key for {} not found", service)));
        }
        
        let encrypted = fs::read(&key_path)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))?;
        let data = self.decrypt_data(&encrypted, password)?;
        
        String::from_utf8(data)
            .map_err(|e| NoteforgeError::Encryption(e.to_string()))
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            fs::copy(entry.path(), dst_path)?;
        }
    }
    
    Ok(())
}