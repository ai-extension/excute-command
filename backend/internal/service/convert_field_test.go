package service

import (
	"encoding/json"
	"testing"
)

func TestExtractField(t *testing.T) {
	src := "Order: 12345, name: Bob\nqty: 7 units\n"

	cases := []struct {
		name  string
		field convertField
		want  string // JSON-marshaled expectation
	}{
		{"delimiter number", convertField{Name: "id", Start: "Order: ", EndMode: "delimiter", End: ",", Format: "number"}, "12345"},
		{"eol string", convertField{Name: "name", Start: "name: ", EndMode: "eol", Format: "string"}, `"Bob"`},
		{"eof from marker", convertField{Name: "qty", Start: "qty: ", EndMode: "eof", Format: "string"}, `"7 units"`},
		{"start not found -> string default", convertField{Name: "missing", Start: "nope", EndMode: "eof", Format: "string", Default: "N/A"}, `"N/A"`},
		{"start not found -> number default", convertField{Name: "missing", Start: "nope", EndMode: "eof", Format: "number", Default: "0"}, "0"},
		{"number parse fail -> default", convertField{Name: "qty", Start: "qty: ", EndMode: "eol", Format: "number", Default: "99"}, "99"},
		{"empty start = from beginning, eol", convertField{Name: "line1", Start: "", EndMode: "eol", Format: "string"}, `"Order: 12345, name: Bob"`},
		{"delimiter missing falls back to eof", convertField{Name: "tail", Start: "qty: ", EndMode: "delimiter", End: "|", Format: "string"}, `"7 units"`},
		{"empty capture -> default", convertField{Name: "x", Start: "Order: ", EndMode: "delimiter", End: "1", Format: "string", Default: "d"}, `"d"`},
		{"number default non-numeric -> null", convertField{Name: "x", Start: "nope", EndMode: "eof", Format: "number", Default: "abc"}, "null"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := json.Marshal(extractField(src, c.field))
			if err != nil {
				t.Fatalf("marshal error: %v", err)
			}
			if string(got) != c.want {
				t.Fatalf("extractField() = %s, want %s", got, c.want)
			}
		})
	}
}

// TestExtractFieldNumberEdgeTokens guards the ParseFloat-vs-JSON mismatch: tokens ParseFloat
// accepts but json.Marshal rejects must fall back to the default, never produce an
// unmarshalable json.Number that would fail the whole step.
func TestExtractFieldNumberEdgeTokens(t *testing.T) {
	for _, tok := range []string{"NaN", "Inf", "+Inf", "-Inf", "0x1p-2", "01", "007"} {
		t.Run(tok, func(t *testing.T) {
			src := "v: " + tok + "\n"
			f := convertField{Name: "v", Start: "v: ", EndMode: "eol", Format: "number", Default: "42"}
			got, err := json.Marshal(extractField(src, f))
			if err != nil {
				t.Fatalf("marshal error for token %q: %v", tok, err)
			}
			if string(got) != "42" {
				t.Fatalf("token %q: extractField() = %s, want default 42", tok, got)
			}
		})
	}
}
