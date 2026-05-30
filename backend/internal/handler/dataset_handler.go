package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/lib/utils"
	"github.com/user/csm-backend/internal/service"
)

type DatasetHandler struct {
	service  *service.DatasetService
	auditLog domain.AuditLogService
}

func NewDatasetHandler(service *service.DatasetService, auditLog domain.AuditLogService) *DatasetHandler {
	return &DatasetHandler{service: service, auditLog: auditLog}
}

// maxPageLimit caps a single page size for record/dataset listings so a client cannot
// request an unbounded result set.
const maxPageLimit = 500

func pageParams(c *gin.Context) (int, int) {
	limit := 20
	offset := 0
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > maxPageLimit {
		limit = maxPageLimit
	}
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}
	return limit, offset
}

func (h *DatasetHandler) List(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}
	limit, offset := pageParams(c)
	searchTerm := c.Query("search")

	var createdBy *uuid.UUID
	if cb := c.Query("created_by"); cb != "" {
		if id, err := uuid.Parse(cb); err == nil {
			createdBy = &id
		}
	}

	user, _ := c.Get("user")
	items, total, err := h.service.ListPaginated(nsID, limit, offset, searchTerm, createdBy, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "limit": limit, "offset": offset})
}

func (h *DatasetHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	user, _ := c.Get("user")
	d, err := h.service.GetByID(id, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found or permission denied"})
		return
	}
	c.JSON(http.StatusOK, d)
}

func (h *DatasetHandler) Create(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var d domain.Dataset
	if err := c.ShouldBindJSON(&d); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	d.NamespaceID = nsID
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	nsIDStr := nsID.String()
	if !domain.HasPermission(user, "namespaces", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create dataset in this namespace"})
		return
	}

	if err := h.service.Create(&d, user); err != nil {
		h.auditLog.LogAction(c, "CREATE", "DATASET", "", map[string]string{"key": d.Key, "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "CREATE", "DATASET", d.ID.String(), map[string]string{"key": d.Key}, "SUCCESS")
	c.JSON(http.StatusCreated, d)
}

func (h *DatasetHandler) Update(c *gin.Context) {
	var d domain.Dataset
	if err := c.ShouldBindJSON(&d); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	d.ID = id

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	existing, err := h.service.GetByIDWithAction(id, user, "WRITE")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found or permission denied"})
		return
	}
	c.Set("namespace_id", existing.NamespaceID)

	diff := utils.CalculateDiff(existing, &d)
	if err := h.service.Update(&d, user); err != nil {
		meta := diff
		if meta == nil {
			meta = make(map[string]interface{})
		}
		meta["error"] = err.Error()
		h.auditLog.LogAction(c, "UPDATE", "DATASET", d.ID.String(), meta, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPDATE", "DATASET", d.ID.String(), diff, "SUCCESS")
	c.JSON(http.StatusOK, d)
}

func (h *DatasetHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	existing, err := h.service.GetByIDWithAction(id, user, "WRITE")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found or permission denied"})
		return
	}
	c.Set("namespace_id", existing.NamespaceID)
	metadata := map[string]string{"key": existing.Key}

	resID := id.String()
	if err := h.service.Delete(id, user); err != nil {
		metadata["error"] = err.Error()
		h.auditLog.LogAction(c, "DELETE", "DATASET", resID, metadata, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "DELETE", "DATASET", resID, metadata, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"message": "dataset deleted"})
}

// --- Records ---

func (h *DatasetHandler) ListRecords(c *gin.Context) {
	datasetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}
	limit, offset := pageParams(c)
	searchTerm := c.Query("search")
	filter := c.Query("filter")

	user, _ := c.Get("user")
	items, total, err := h.service.ListRecordsFiltered(datasetID, limit, offset, searchTerm, filter, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "limit": limit, "offset": offset})
}

// selectBody mirrors the frontend SelectAggregation type for JSON binding.
type selectBody struct {
	Field string `json:"field"`
	Fn    string `json:"fn"`
	Label string `json:"label"`
}

// aggregateRequestBody is the wire shape for POST /datasets/:id/aggregate. Keep field
// names in sync with the frontend DatasetSource type.
type aggregateRequestBody struct {
	Filter   string       `json:"filter"`
	GroupBys []string     `json:"group_bys"`
	Selects  []selectBody `json:"selects"`
	// Legacy single-field
	GroupBy string `json:"group_by"`
	Metric  string `json:"metric"`
	Fn      string `json:"fn"`
	Limit   int    `json:"limit"`
	Sort    string `json:"sort"`
}

func (b aggregateRequestBody) toServiceReq() service.AggregateRequest {
	selects := make([]service.AggregateSelect, 0, len(b.Selects))
	for _, s := range b.Selects {
		selects = append(selects, service.AggregateSelect{Field: s.Field, Fn: s.Fn, Label: s.Label})
	}
	return service.AggregateRequest{
		Filter:   b.Filter,
		GroupBys: b.GroupBys,
		Selects:  selects,
		GroupBy:  b.GroupBy,
		Metric:   b.Metric,
		Fn:       b.Fn,
		Limit:    b.Limit,
		Sort:     b.Sort,
	}
}

func (h *DatasetHandler) Aggregate(c *gin.Context) {
	datasetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}
	var body aggregateRequestBody
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	user, _ := c.Get("user")
	items, err := h.service.Aggregate(datasetID, body.toServiceReq(), user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *DatasetHandler) CreateRecord(c *gin.Context) {
	datasetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dataset id"})
		return
	}
	var rec domain.DatasetRecord
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)
	if err := h.service.CreateRecord(datasetID, &rec, user); err != nil {
		h.auditLog.LogAction(c, "CREATE", "DATASET_RECORD", "", map[string]string{"dataset_id": datasetID.String(), "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "CREATE", "DATASET_RECORD", rec.ID.String(), map[string]string{"dataset_id": datasetID.String()}, "SUCCESS")
	c.JSON(http.StatusCreated, rec)
}

func (h *DatasetHandler) UpdateRecord(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var rec domain.DatasetRecord
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rec.ID = id

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)
	if err := h.service.UpdateRecord(&rec, user); err != nil {
		h.auditLog.LogAction(c, "UPDATE", "DATASET_RECORD", id.String(), map[string]string{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPDATE", "DATASET_RECORD", id.String(), nil, "SUCCESS")
	c.JSON(http.StatusOK, rec)
}

func (h *DatasetHandler) DeleteRecord(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)
	if err := h.service.DeleteRecord(id, user); err != nil {
		h.auditLog.LogAction(c, "DELETE", "DATASET_RECORD", id.String(), map[string]string{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "DELETE", "DATASET_RECORD", id.String(), nil, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"message": "record deleted"})
}
