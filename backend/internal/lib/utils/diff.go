package utils

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
)

// CalculateDiff compares two objects and returns a map representing the delta.
// It only stores the NEW values of fields that changed, preserving the hierarchy.
// It ignores metadata and sensitive fields recursively.
func CalculateDiff(oldObj, newObj interface{}) map[string]interface{} {
	oldMap := toMap(oldObj)
	newMap := toMap(newObj)

	if oldMap == nil || newMap == nil {
		return nil
	}

	diff := deepDiffOnlyNew(oldMap, newMap)
	if len(diff) == 0 {
		return nil
	}
	return diff
}

func deepDiffOnlyNew(oldMap, newMap map[string]interface{}) map[string]interface{} {
	diff := make(map[string]interface{})

	for key, newVal := range newMap {
		if isIgnored(key) || isSensitive(key) {
			continue
		}

		oldVal, exists := oldMap[key]

		// For partial updates, if the new value is zero-equivalent and not provided in old, skip it
		if !exists && isZero(newVal) {
			continue
		}

		if exists && reflect.DeepEqual(oldVal, newVal) {
			continue
		}

		// Recurse into maps
		oldSubMap, ok1 := oldVal.(map[string]interface{})
		newSubMap, ok2 := newVal.(map[string]interface{})
		if ok1 && ok2 {
			subDiff := deepDiffOnlyNew(oldSubMap, newSubMap)
			if len(subDiff) > 0 {
				diff[key] = subDiff
			}
			continue
		}

		// Recurse into slices
		oldSlice, ok1 := oldVal.([]interface{})
		newSlice, ok2 := newVal.([]interface{})
		if ok1 && ok2 {
			sliceDiff := diffSlicesOnlyNew(oldSlice, newSlice)
			if len(sliceDiff) > 0 {
				diff[key] = sliceDiff
			}
			continue
		}

		// Store only the new value
		diff[key] = newVal
	}

	return diff
}

func diffSlicesOnlyNew(oldSlice, newSlice []interface{}) map[string]interface{} {
	diff := make(map[string]interface{})
	maxLen := len(oldSlice)
	if len(newSlice) > maxLen {
		maxLen = len(newSlice)
	}

	for i := 0; i < maxLen; i++ {
		var oldItem, newItem interface{}
		if i < len(oldSlice) {
			oldItem = oldSlice[i]
		}
		if i < len(newSlice) {
			newItem = newSlice[i]
		}

		if oldItem == nil && newItem != nil {
			diff[fmt.Sprintf("[%d]", i)] = stripMetadata(newItem)
			continue
		}
		
		if newItem == nil {
			continue // We don't log deletions in slices for this minimalist view
		}

		// Deep compare elements
		oldMap, ok1 := oldItem.(map[string]interface{})
		newMap, ok2 := newItem.(map[string]interface{})
		if ok1 && ok2 {
			subDiff := deepDiffOnlyNew(oldMap, newMap)
			if len(subDiff) > 0 {
				diff[fmt.Sprintf("[%d]", i)] = subDiff
			}
		} else if !reflect.DeepEqual(oldItem, newItem) {
			diff[fmt.Sprintf("[%d]", i)] = newItem
		}
	}

	return diff
}

func toMap(obj interface{}) map[string]interface{} {
	if obj == nil {
		return nil
	}
	if m, ok := obj.(map[string]interface{}); ok {
		return m
	}
	data, err := json.Marshal(obj)
	if err != nil {
		return nil
	}
	var res map[string]interface{}
	_ = json.Unmarshal(data, &res)
	return res
}

func stripMetadata(obj interface{}) interface{} {
	if obj == nil {
		return nil
	}
	if m, ok := obj.(map[string]interface{}); ok {
		res := make(map[string]interface{})
		for k, v := range m {
			if isIgnored(k) || isSensitive(k) {
				continue
			}
			res[k] = stripMetadata(v)
		}
		return res
	}
	if s, ok := obj.([]interface{}); ok {
		res := make([]interface{}, len(s))
		for i, v := range s {
			res[i] = stripMetadata(v)
		}
		return res
	}
	return obj
}

func isZero(v interface{}) bool {
	if v == nil {
		return true
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array, reflect.Map, reflect.String:
		return rv.Len() == 0
	case reflect.Bool:
		return false
	default:
		return reflect.DeepEqual(v, reflect.Zero(rv.Type()).Interface())
	}
}

func isIgnored(name string) bool {
	n := strings.ToLower(name)
	ignored := []string{"id", "created_at", "updated_at", "deleted_at", "namespace_id", "namespace", "group_id", "workflow_id"}
	for _, s := range ignored {
		if n == s {
			return true
		}
	}
	return false
}

func isSensitive(name string) bool {
	n := strings.ToLower(name)
	sensitive := []string{"password", "privatekey", "token", "secret", "apikey"}
	for _, s := range sensitive {
		if strings.Contains(n, s) {
			return true
		}
	}
	return false
}
