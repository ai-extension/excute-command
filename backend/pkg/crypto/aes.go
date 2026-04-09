package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"log"
	"os"

	"github.com/joho/godotenv"
)

var defaultKey []byte

func init() {
	// Load .env file at the very beginning to ensure DATA_ENCRYPTION_KEY is available
	// regardless of where this package is initialized from.
	// We look for .env in the current directory and also try going up a few levels
	// to handle different execution contexts (e.g. running from root or cmd/server).
	_ = godotenv.Load(".env", "../.env", "../../.env")

	keyStr := os.Getenv("DATA_ENCRYPTION_KEY")
	if keyStr != "" {
		// Expecting a 32-byte key for AES-256, encoded as base64 or just raw string if exactly 32 chars.
		// For simplicity, we hash it or pad it to 32 bytes if it's not.
		// A better approach is to require exactly 32 bytes base64 encoded.
		decoded, err := base64.StdEncoding.DecodeString(keyStr)
		if err == nil && len(decoded) == 32 {
			defaultKey = decoded
		} else {
			// Fallback: Use the string bytes, pad or truncate to 32
			defaultKey = make([]byte, 32)
			copy(defaultKey, []byte(keyStr))
		}
		log.Println("Data encryption key loaded from environment")
	} else {
		log.Println("WARNING: DATA_ENCRYPTION_KEY not set. Using default insecure key for local development. Do NOT use this in production!")
		defaultFallbackKey := "default-insecure-data-encryption-key-local"
		defaultKey = make([]byte, 32)
		copy(defaultKey, []byte(defaultFallbackKey))
	}
}

// Encrypt encrypts plaintext using AES-GCM and the default key
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(defaultKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts ciphertext using AES-GCM and the default key
func Decrypt(ciphertextStr string) (string, error) {
	if ciphertextStr == "" {
		return "", nil
	}

	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextStr)
	if err != nil {
		// Possibly not encrypted (legacy plain text data)
		return ciphertextStr, nil
	}

	block, err := aes.NewCipher(defaultKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		// Not a valid ciphertext, assume plaintext
		return ciphertextStr, nil
	}

	nonce, ciphertextBytes := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		// Decryption failed. This could be because the key changed,
		// or it's actually just plain text that happened to be valid base64.
		// Return the original string as fallback for seamless migration.
		return ciphertextStr, errors.New("decryption failed (wrong key or corrupted data)")
	}

	return string(plaintext), nil
}
