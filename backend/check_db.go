package main

import (
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type WorkflowExecution struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID uuid.UUID `json:"workflow_id"`
	Status     string    `json:"status"`
	LogPath    string    `json:"log_path"`
	StartedAt  time.Time `json:"started_at"`
}

func main() {
	dsn := "host=localhost user=csm_user password=csm_password dbname=csm_db port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}

	var execs []WorkflowExecution
	err = db.Limit(5).Order("started_at desc").Find(&execs).Error
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Recent Executions:")
	for _, e := range execs {
		fmt.Printf("ID: %s | Status: %s | LogPath: %s\n", e.ID, e.Status, e.LogPath)
	}
}
