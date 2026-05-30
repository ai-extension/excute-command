package service

import (
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type DatasetService struct {
	repo domain.DatasetRepository
}

func NewDatasetService(repo domain.DatasetRepository) *DatasetService {
	return &DatasetService{repo: repo}
}

func (s *DatasetService) Create(d *domain.Dataset, user *domain.User) error {
	d.ID = uuid.New()
	if d.Columns == "" {
		d.Columns = "[]"
	}
	if user != nil {
		d.CreatedBy = &user.ID
		d.CreatedByUsername = user.Username
	}
	return s.repo.Create(d)
}

func (s *DatasetService) GetByID(id uuid.UUID, user *domain.User) (*domain.Dataset, error) {
	return s.GetByIDWithAction(id, user, "READ")
}

func (s *DatasetService) GetByIDWithAction(id uuid.UUID, user *domain.User, action string) (*domain.Dataset, error) {
	scope := domain.GetPermissionScope(user, "datasets", action)
	return s.repo.GetByID(id, &scope)
}

func (s *DatasetService) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, user *domain.User) ([]domain.Dataset, int64, error) {
	scope := domain.GetPermissionScope(user, "namespaces", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, createdBy, &scope)
}

func (s *DatasetService) Update(d *domain.Dataset, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "namespaces", "WRITE")
	existing, err := s.repo.GetByID(d.ID, &scope)
	if err != nil {
		return err
	}

	if d.Key != "" {
		existing.Key = d.Key
	}
	if d.Name != "" {
		existing.Name = d.Name
	}
	if d.Description != "" {
		existing.Description = d.Description
	}
	if d.Columns != "" {
		existing.Columns = d.Columns
	}

	return s.repo.Update(existing)
}

func (s *DatasetService) Delete(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "namespaces", "WRITE")
	if _, err := s.repo.GetByID(id, &scope); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

// --- Records (schema is loose; we only ensure Data is a valid JSON object) ---

func validRecordData(data string) error {
	if data == "" {
		return nil
	}
	var v interface{}
	if err := json.Unmarshal([]byte(data), &v); err != nil {
		return errors.New("data must be valid JSON")
	}
	return nil
}

func (s *DatasetService) ListRecords(datasetID uuid.UUID, limit, offset int, searchTerm string, user *domain.User) ([]domain.DatasetRecord, int64, error) {
	return s.ListRecordsFiltered(datasetID, limit, offset, searchTerm, "", user)
}

// ListRecordsFiltered supports a structured "key=val,..." filter (matchConditions syntax) in
// addition to the substring search. When a filter is present, records are loaded and matched
// in memory, then paginated; otherwise SQL pagination is used.
func (s *DatasetService) ListRecordsFiltered(datasetID uuid.UUID, limit, offset int, searchTerm, filter string, user *domain.User) ([]domain.DatasetRecord, int64, error) {
	if _, err := s.GetByIDWithAction(datasetID, user, "READ"); err != nil {
		return nil, 0, err
	}

	filter = strings.TrimSpace(filter)
	if filter == "" {
		return s.repo.ListRecords(datasetID, limit, offset, searchTerm)
	}

	all, err := s.repo.AllRecords(datasetID)
	if err != nil {
		return nil, 0, err
	}
	search := strings.ToLower(strings.TrimSpace(searchTerm))

	matched := make([]domain.DatasetRecord, 0, len(all))
	for _, r := range all {
		m := map[string]interface{}{}
		if r.Data != "" {
			dec := json.NewDecoder(strings.NewReader(r.Data))
			dec.UseNumber()
			_ = dec.Decode(&m)
		}
		m["_id"] = r.ID.String()
		if !evalFilterString(m, filter) {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(r.Data), search) {
			continue
		}
		matched = append(matched, r)
	}

	total := int64(len(matched))
	if offset > len(matched) {
		offset = len(matched)
	}
	end := offset + limit
	if end > len(matched) {
		end = len(matched)
	}
	return matched[offset:end], total, nil
}

// AggregateSelect is one output column to compute per bucket. Field is the numeric
// field to reduce (ignored when Fn=='count'); Label names the column in the response.
type AggregateSelect struct {
	Field string
	Fn    string
	Label string
}

// AggregateRequest configures a server-side aggregation pass over a dataset's records.
//
//   - Filter:   same FilterBuilder JSON tree as ListRecordsFiltered (empty = match all).
//   - GroupBys: field names whose values form a composite bucket key (joined with " | ").
//   - Selects:  one or more reductions; each becomes a value in bucket.Values keyed by Label.
//   - Limit:    max buckets returned (0 = no cap; applied after sort).
//   - Sort:     value_desc | value_asc | key_asc | key_desc — sorts by the FIRST select.
//
// Legacy single-field fields (GroupBy, Metric, Fn) are still accepted; when the array
// fields are empty they are normalized into the new shape so the old API contract holds.
type AggregateRequest struct {
	Filter   string
	GroupBys []string
	Selects  []AggregateSelect
	// Legacy single-field (kept for backward compat with older frontend builds).
	GroupBy string
	Metric  string
	Fn      string
	Limit   int
	Sort    string
}

// AggregateBucket: one output row. Values is the new multi-aggregate map keyed by
// select Label. Value mirrors the first select for backward compatibility.
type AggregateBucket struct {
	Key    string             `json:"key"`
	Count  int64              `json:"count"`
	Values map[string]float64 `json:"values"`
	Value  float64            `json:"value"` // legacy: == Values[firstSelect.Label]
}

// Aggregate runs a group-by + reduce over a dataset's records. Records are filtered then
// bucketed by GroupBy; for each bucket the metric field is reduced via Fn. Results are
// sorted (default: value desc) and optionally capped to Limit buckets.
func (s *DatasetService) Aggregate(datasetID uuid.UUID, req AggregateRequest, user *domain.User) ([]AggregateBucket, error) {
	if _, err := s.GetByIDWithAction(datasetID, user, "READ"); err != nil {
		return nil, err
	}
	return s.aggregateOnly(datasetID, req)
}

// normalizeAggregate merges the legacy single-field request shape into the new arrays
// so the rest of aggregateOnly can assume the new shape.
func normalizeAggregate(req AggregateRequest) (groupBys []string, selects []AggregateSelect) {
	groupBys = make([]string, 0, len(req.GroupBys))
	for _, g := range req.GroupBys {
		if g = strings.TrimSpace(g); g != "" {
			groupBys = append(groupBys, g)
		}
	}
	if len(groupBys) == 0 && strings.TrimSpace(req.GroupBy) != "" {
		groupBys = []string{strings.TrimSpace(req.GroupBy)}
	}

	for _, sel := range req.Selects {
		fn := strings.ToLower(strings.TrimSpace(sel.Fn))
		if fn == "" {
			fn = "count"
		}
		label := strings.TrimSpace(sel.Label)
		if label == "" {
			label = fn
			if sel.Field != "" {
				label = fn + "(" + sel.Field + ")"
			}
		}
		selects = append(selects, AggregateSelect{Field: sel.Field, Fn: fn, Label: label})
	}
	if len(selects) == 0 {
		// Legacy single-select fallback.
		fn := strings.ToLower(strings.TrimSpace(req.Fn))
		if fn == "" {
			fn = "count"
		}
		label := fn
		if req.Metric != "" {
			label = fn + "(" + req.Metric + ")"
		}
		selects = []AggregateSelect{{Field: req.Metric, Fn: fn, Label: label}}
	}
	return
}

// aggregateOnly is the access-check-free aggregation core. Public-page proxies call this
// after their own membership check.
func (s *DatasetService) aggregateOnly(datasetID uuid.UUID, req AggregateRequest) ([]AggregateBucket, error) {
	all, err := s.repo.AllRecords(datasetID)
	if err != nil {
		return nil, err
	}

	groupBys, selects := normalizeAggregate(req)
	filter := strings.TrimSpace(req.Filter)

	// One accumulator per (bucket, select). We track count separately at bucket scope.
	type selAcc struct {
		numeric int64 // records with a parseable metric value for this select
		sum     float64
		min     float64
		max     float64
		seen    bool
	}
	type bucketAcc struct {
		count int64
		sels  []selAcc
	}
	buckets := map[string]*bucketAcc{}
	order := []string{}

	for _, r := range all {
		m := map[string]interface{}{}
		if r.Data != "" {
			dec := json.NewDecoder(strings.NewReader(r.Data))
			dec.UseNumber()
			_ = dec.Decode(&m)
		}
		m["_id"] = r.ID.String()
		if filter != "" && !evalFilterString(m, filter) {
			continue
		}

		// Composite key: stringify each group_by value, join with " | ". When no
		// group_bys are configured, every record falls into bucket "".
		var key string
		if len(groupBys) == 1 {
			key = stringifyAggValue(m[groupBys[0]])
		} else if len(groupBys) > 1 {
			parts := make([]string, len(groupBys))
			for i, g := range groupBys {
				parts[i] = stringifyAggValue(m[g])
			}
			key = strings.Join(parts, " | ")
		}

		b, ok := buckets[key]
		if !ok {
			b = &bucketAcc{sels: make([]selAcc, len(selects))}
			buckets[key] = b
			order = append(order, key)
		}
		b.count++

		for i, sel := range selects {
			if sel.Fn == "count" {
				continue // count uses bucket.count regardless of field
			}
			if sel.Field == "" {
				continue
			}
			v, ok := toFloat(m[sel.Field])
			if !ok {
				continue
			}
			sa := &b.sels[i]
			sa.numeric++
			sa.sum += v
			if !sa.seen {
				sa.min, sa.max = v, v
				sa.seen = true
			} else {
				if v < sa.min {
					sa.min = v
				}
				if v > sa.max {
					sa.max = v
				}
			}
		}
	}

	out := make([]AggregateBucket, 0, len(order))
	for _, k := range order {
		b := buckets[k]
		values := make(map[string]float64, len(selects))
		for i, sel := range selects {
			var v float64
			switch sel.Fn {
			case "sum":
				v = b.sels[i].sum
			case "avg":
				if b.sels[i].numeric > 0 {
					v = b.sels[i].sum / float64(b.sels[i].numeric)
				}
			case "min":
				v = b.sels[i].min
			case "max":
				v = b.sels[i].max
			default: // count
				v = float64(b.count)
			}
			values[sel.Label] = v
		}
		bucket := AggregateBucket{Key: k, Count: b.count, Values: values}
		if len(selects) > 0 {
			bucket.Value = values[selects[0].Label]
		}
		out = append(out, bucket)
	}

	// Sort uses the first select's value for value_*. Key sorts are unaffected.
	sortAggBuckets(out, req.Sort)
	if req.Limit > 0 && len(out) > req.Limit {
		out = out[:req.Limit]
	}
	return out, nil
}

// AggregatePublic skips the user RBAC check; the page handler is expected to have
// already verified the dataset belongs to the page's namespace.
func (s *DatasetService) AggregatePublic(datasetID uuid.UUID, req AggregateRequest) ([]AggregateBucket, error) {
	return s.aggregateOnly(datasetID, req)
}

// ListRecordsPublic mirrors ListRecordsFiltered without the per-user RBAC check, for
// public-page dataset widgets. Caller must have already verified namespace membership.
func (s *DatasetService) ListRecordsPublic(datasetID uuid.UUID, limit, offset int, searchTerm, filter string) ([]domain.DatasetRecord, int64, error) {
	filter = strings.TrimSpace(filter)
	if filter == "" {
		return s.repo.ListRecords(datasetID, limit, offset, searchTerm)
	}
	all, err := s.repo.AllRecords(datasetID)
	if err != nil {
		return nil, 0, err
	}
	search := strings.ToLower(strings.TrimSpace(searchTerm))
	matched := make([]domain.DatasetRecord, 0, len(all))
	for _, r := range all {
		m := map[string]interface{}{}
		if r.Data != "" {
			dec := json.NewDecoder(strings.NewReader(r.Data))
			dec.UseNumber()
			_ = dec.Decode(&m)
		}
		m["_id"] = r.ID.String()
		if !evalFilterString(m, filter) {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(r.Data), search) {
			continue
		}
		matched = append(matched, r)
	}
	total := int64(len(matched))
	if offset > len(matched) {
		offset = len(matched)
	}
	end := offset + limit
	if end > len(matched) {
		end = len(matched)
	}
	return matched[offset:end], total, nil
}

// GetDatasetForPublic returns a dataset for use by public-page widgets without the
// per-user RBAC scope. The page handler must verify namespace membership.
func (s *DatasetService) GetDatasetForPublic(id uuid.UUID) (*domain.Dataset, error) {
	return s.repo.GetByID(id, nil)
}

func stringifyAggValue(v interface{}) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case bool:
		if x {
			return "true"
		}
		return "false"
	case json.Number:
		return x.String()
	}
	if b, err := json.Marshal(v); err == nil {
		return string(b)
	}
	return ""
}

func toFloat(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		return f, err == nil
	}
	return 0, false
}

func sortAggBuckets(buckets []AggregateBucket, mode string) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "key_asc":
		sort.Slice(buckets, func(i, j int) bool { return buckets[i].Key < buckets[j].Key })
	case "key_desc":
		sort.Slice(buckets, func(i, j int) bool { return buckets[i].Key > buckets[j].Key })
	case "value_asc":
		sort.Slice(buckets, func(i, j int) bool { return buckets[i].Value < buckets[j].Value })
	default: // value_desc
		sort.Slice(buckets, func(i, j int) bool { return buckets[i].Value > buckets[j].Value })
	}
}

func (s *DatasetService) CreateRecord(datasetID uuid.UUID, rec *domain.DatasetRecord, user *domain.User) error {
	if _, err := s.GetByIDWithAction(datasetID, user, "WRITE"); err != nil {
		return err
	}
	if err := validRecordData(rec.Data); err != nil {
		return err
	}
	rec.ID = uuid.New()
	rec.DatasetID = datasetID
	if rec.Data == "" {
		rec.Data = "{}"
	}
	return s.repo.CreateRecord(rec)
}

func (s *DatasetService) UpdateRecord(rec *domain.DatasetRecord, user *domain.User) error {
	existing, err := s.repo.GetRecord(rec.ID)
	if err != nil {
		return err
	}
	if _, err := s.GetByIDWithAction(existing.DatasetID, user, "WRITE"); err != nil {
		return err
	}
	if err := validRecordData(rec.Data); err != nil {
		return err
	}
	if rec.Data != "" {
		existing.Data = rec.Data
	}
	return s.repo.UpdateRecord(existing)
}

func (s *DatasetService) DeleteRecord(id uuid.UUID, user *domain.User) error {
	existing, err := s.repo.GetRecord(id)
	if err != nil {
		return err
	}
	if _, err := s.GetByIDWithAction(existing.DatasetID, user, "DELETE"); err != nil {
		return err
	}
	return s.repo.DeleteRecord(id)
}
