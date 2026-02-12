package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/handler"
	"github.com/user/csm-backend/internal/repository"
	"github.com/user/csm-backend/internal/service"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Database connection string
	dsn := "host=localhost user=csm_user password=csm_password dbname=csm_db port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto-migration
	if err := db.AutoMigrate(&domain.Command{}, &domain.Step{}); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize Repositories
	commandRepo := repository.NewPostgresCommandRepo(db)
	stepRepo := repository.NewPostgresStepRepo(db)

	// Initialize Services
	executorService := service.NewExecutorService(commandRepo, stepRepo)

	// Initialize Handlers
	commandHandler := handler.NewCommandHandler(commandRepo, executorService)

	// Initialize Router
	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Routes
	api := r.Group("/api")
	{
		api.GET("/commands", commandHandler.ListCommands)
		api.POST("/commands", commandHandler.CreateCommand)
		api.POST("/commands/:id/execute", commandHandler.ExecuteCommand)
	}

	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
