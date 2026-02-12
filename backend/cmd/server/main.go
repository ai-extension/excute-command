package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/handler"
	"github.com/user/csm-backend/internal/middleware"
	"github.com/user/csm-backend/internal/repository"
	"github.com/user/csm-backend/internal/service"
	"golang.org/x/crypto/bcrypt"
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
	if err := db.AutoMigrate(
		&domain.Namespace{},
		&domain.Command{},
		&domain.Step{},
		&domain.User{},
		&domain.Role{},
		&domain.Permission{},
	); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize Repositories
	namespaceRepo := repository.NewPostgresNamespaceRepo(db)
	commandRepo := repository.NewPostgresCommandRepo(db)
	stepRepo := repository.NewPostgresStepRepo(db)
	userRepo := repository.NewPostgresUserRepo(db)
	roleRepo := repository.NewPostgresRoleRepo(db)
	permRepo := repository.NewPostgresPermissionRepo(db)

	// Seed Admin User
	seedAdmin(db)

	// Initialize Services
	executorService := service.NewExecutorService(commandRepo, stepRepo)
	authService := service.NewAuthService(userRepo)

	// Initialize Handlers
	namespaceHandler := handler.NewNamespaceHandler(namespaceRepo)
	commandHandler := handler.NewCommandHandler(commandRepo, executorService)
	authHandler := handler.NewAuthHandler(authService)
	userHandler := handler.NewUserHandler(userRepo, roleRepo)
	roleHandler := handler.NewRoleHandler(roleRepo, permRepo)
	permHandler := handler.NewPermissionHandler(permRepo)

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

	api := r.Group("/api")
	{
		api.POST("/login", authHandler.Login)
		api.POST("/logout", authHandler.Logout)

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware(authService))
		{
			protected.GET("/namespaces", namespaceHandler.ListNamespaces)
			protected.POST("/namespaces", namespaceHandler.CreateNamespace)
			protected.DELETE("/namespaces/:id", namespaceHandler.DeleteNamespace)

			protected.GET("/commands", commandHandler.ListCommands)
			protected.POST("/commands", commandHandler.CreateCommand)
			protected.POST("/commands/:id/execute", commandHandler.ExecuteCommand)

			// User & Role Management
			protected.GET("/users", userHandler.ListUsers)
			protected.POST("/users", userHandler.CreateUser)
			protected.POST("/users/:id/roles", userHandler.UpdateUserRoles)
			protected.GET("/roles", roleHandler.ListRoles)
			protected.POST("/roles", roleHandler.CreateRole)
			protected.POST("/roles/:id/permissions", roleHandler.UpdateRolePermissions)
			protected.GET("/permissions", permHandler.ListPermissions)
		}
	}

	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}

func seedAdmin(db *gorm.DB) {
	log.Println("Ensuring system permissions...")

	// Default permissions
	perms := []domain.Permission{
		{ID: uuid.New(), Name: "Execute Commands", Type: "FUNCTION", Action: "EXECUTE"},
		{ID: uuid.New(), Name: "Read Commands", Type: "RESOURCE", Action: "READ"},
		{ID: uuid.New(), Name: "Manage Users", Type: "FUNCTION", Action: "WRITE"},
		{ID: uuid.New(), Name: "Manage Roles", Type: "FUNCTION", Action: "WRITE"},
		{ID: uuid.New(), Name: "View Dashboard", Type: "RESOURCE", Action: "READ"},
	}
	for i := range perms {
		db.FirstOrCreate(&perms[i], "name = ?", perms[i].Name)
	}

	var count int64
	db.Model(&domain.User{}).Where("username = ?", "admin").Count(&count)
	if count == 0 {
		log.Println("Seeding admin user...")
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		admin := domain.User{
			ID:           uuid.New(),
			Username:     "admin",
			PasswordHash: string(hashedPassword),
			Email:        "admin@example.com",
		}

		// Create admin role
		adminRole := domain.Role{
			ID:          uuid.New(),
			Name:        "admin",
			Description: "Full access role",
			Permissions: perms,
		}
		db.FirstOrCreate(&adminRole, "name = ?", adminRole.Name)

		admin.Roles = []domain.Role{adminRole}
		if err := db.Create(&admin).Error; err != nil {
			log.Println("Failed to seed admin:", err)
		} else {
			log.Println("Admin user seeded successfully (admin/admin)")
		}
	} else {
		// Ensure admin role has permissions even if user exists
		var adminRole domain.Role
		if err := db.Where("name = ?", "admin").First(&adminRole).Error; err == nil {
			db.Model(&adminRole).Association("Permissions").Replace(perms)
		}
	}
}
