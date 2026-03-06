package service

import (
	"errors"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

var jwtKey []byte

func init() {
	secret := os.Getenv("JWT_SECRET")
	if secret != "" {
		jwtKey = []byte(secret)
		log.Println("JWT schema loaded from environment variable")
	} else {
		// Use a hardcoded default key if no secret is provided in the environment
		// This prevents tokens from invalidating on every restart during development
		defaultSecret := "default-insecure-jwt-secret-key-for-local-development"
		jwtKey = []byte(defaultSecret)
		log.Println("WARNING: JWT_SECRET environment variable not set. Using default insecure secret. Do NOT use this in production!")
	}
}

type AuthService struct {
	userRepo     domain.UserRepository
	settingsRepo domain.SystemSettingRepository
}

func NewAuthService(userRepo domain.UserRepository, settingsRepo domain.SystemSettingRepository) *AuthService {
	return &AuthService{userRepo: userRepo, settingsRepo: settingsRepo}
}

func (s *AuthService) Register(username, password, email string) (*domain.User, error) {
	// Check if registration is allowed
	allowReg, err := s.settingsRepo.GetByKey("allow_registration")
	if err != nil || allowReg.Value != "true" {
		return nil, errors.New("registration is currently disabled")
	}

	// Check if user already exists
	if _, err := s.userRepo.GetByUsername(username); err == nil {
		return nil, errors.New("username already exists")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &domain.User{
		ID:           uuid.New(),
		Username:     username,
		PasswordHash: string(hashedPassword),
		Email:        email,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *AuthService) Login(username, password string) (string, *domain.User, error) {
	user, err := s.userRepo.GetByUsername(username)
	if err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		return "", nil, err
	}

	return tokenString, user, nil
}

func (s *AuthService) ValidateToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

func (s *AuthService) SocialLogin(provider, socialID, email, fullName, avatarURL string) (string, *domain.User, error) {
	// 1. Try to find user by email (using it as unique identifier)
	user, err := s.userRepo.GetByUsername(email)
	if err != nil {
		// Create new user if not found
		user = &domain.User{
			ID:             uuid.New(),
			Username:       email,
			Email:          email,
			FullName:       fullName,
			SocialProvider: provider,
			SocialID:       socialID,
			AvatarURL:      avatarURL,
		}
		if err := s.userRepo.Create(user); err != nil {
			return "", nil, err
		}
	} else {
		// Update existing user's social info
		user.SocialProvider = provider
		user.SocialID = socialID
		user.AvatarURL = avatarURL
		user.FullName = fullName
		s.userRepo.Update(user)
	}

	// Generate token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		return "", nil, err
	}

	return tokenString, user, nil
}
