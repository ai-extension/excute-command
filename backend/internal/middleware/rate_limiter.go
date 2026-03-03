package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimit struct {
	attempts int
	lockout  time.Time
}

var (
	// Track failed login attempts by IP or username. Let's use IP for now to prevent distributed username brute forces.
	limits = make(map[string]*rateLimit)
	mu     sync.Mutex

	MaxAttempts     = 5
	LockoutDuration = 5 * time.Minute
	ResetDuration   = 15 * time.Minute // Clean up if no attempts for 15 mins
)

// LoginRateLimiter creates a basic memory-based rate limiting middleware focused on failed authentication attempts
func LoginRateLimiter() gin.HandlerFunc {
	// Background cleanup for old records
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			mu.Lock()
			now := time.Now()
			for k, v := range limits {
				if now.After(v.lockout) && now.Sub(v.lockout) > ResetDuration {
					delete(limits, k)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = "unknown"
		}

		mu.Lock()
		limit, exists := limits[ip]
		if !exists {
			limit = &rateLimit{}
			limits[ip] = limit
		}

		// Check if actively locked out
		if time.Now().Before(limit.lockout) {
			mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many attempts. Please try again later."})
			return
		}

		// Reset attempts if lockout period just ended
		if limit.attempts >= MaxAttempts && time.Now().After(limit.lockout) {
			limit.attempts = 0
		}
		mu.Unlock()

		// Allow request to proceed
		c.Next()

		// After request, check if it was an unauthorized (failed) login
		if c.Writer.Status() == http.StatusUnauthorized || c.Writer.Status() == http.StatusBadRequest {
			mu.Lock()
			limit.attempts++
			if limit.attempts >= MaxAttempts {
				limit.lockout = time.Now().Add(LockoutDuration)
			} else {
				// Simply update time so it stays tracked
				limit.lockout = time.Now()
			}
			mu.Unlock()
		} else if c.Writer.Status() == http.StatusOK {
			// Success! Clear their limits
			mu.Lock()
			delete(limits, ip)
			mu.Unlock()
		}
	}
}
