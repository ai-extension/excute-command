package service

import (
	"encoding/json"
	"strings"
)

// filterNode is a recursive boolean filter tree. A node is a GROUP when Logic is set
// (AND/OR over Conds), otherwise it is a leaf CONDITION (Field/Op/Value).
type filterNode struct {
	Logic string       `json:"logic,omitempty"`
	Conds []filterNode `json:"conds,omitempty"`
	Field string       `json:"field,omitempty"`
	Op    string       `json:"op,omitempty"`
	Value string       `json:"value,omitempty"`
}

// evalFilterString evaluates a record map against a filter. The filter is either a JSON
// tree (starts with '{') or the legacy comma-separated "k=v,k=v" AND syntax. Empty = match all.
func evalFilterString(item map[string]interface{}, filter string) bool {
	f := strings.TrimSpace(filter)
	if f == "" {
		return true
	}
	if strings.HasPrefix(f, "{") {
		var root filterNode
		if err := json.Unmarshal([]byte(f), &root); err == nil {
			return evalFilterNode(item, root)
		}
		// fall through to legacy on parse error
	}
	return matchConditions(item, strings.Split(f, ","))
}

func evalFilterNode(item map[string]interface{}, n filterNode) bool {
	if n.Logic != "" { // group
		if len(n.Conds) == 0 {
			return true
		}
		if strings.EqualFold(n.Logic, "OR") {
			for _, c := range n.Conds {
				if evalFilterNode(item, c) {
					return true
				}
			}
			return false
		}
		for _, c := range n.Conds {
			if !evalFilterNode(item, c) {
				return false
			}
		}
		return true
	}
	// leaf condition
	if strings.TrimSpace(n.Field) == "" {
		return true
	}
	op := n.Op
	if op == "" {
		op = "="
	}
	return matchOne(item, n.Field, op, n.Value)
}

// filterIsEmpty reports whether a filter has zero real conditions (used to require a
// filter for UPDATE / DELETE).
func filterIsEmpty(filter string) bool {
	f := strings.TrimSpace(filter)
	if f == "" {
		return true
	}
	if strings.HasPrefix(f, "{") {
		var root filterNode
		if json.Unmarshal([]byte(f), &root) == nil {
			return countConds(root) == 0
		}
	}
	for _, p := range strings.Split(f, ",") {
		if strings.TrimSpace(p) != "" {
			return false
		}
	}
	return true
}

func countConds(n filterNode) int {
	if n.Logic != "" {
		s := 0
		for _, c := range n.Conds {
			s += countConds(c)
		}
		return s
	}
	if strings.TrimSpace(n.Field) != "" {
		return 1
	}
	return 0
}
