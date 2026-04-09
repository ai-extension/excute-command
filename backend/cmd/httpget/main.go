package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	url := flag.String("u", "", "URL to request")
	method := flag.String("X", "GET", "HTTP method")
	headers := flag.String("H", "{}", "JSON headers")
	body := flag.String("d", "", "HTTP body")
	timeout := flag.Int("t", 30, "Timeout in seconds")

	flag.Parse()

	if *url == "" {
		fmt.Println("Usage: httpget -u <url> [-X <method>] [-H <headers_json>] [-d <body>] [-t <timeout>]")
		os.Exit(1)
	}

	var headerMap map[string]string
	if err := json.Unmarshal([]byte(*headers), &headerMap); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to parse headers JSON: %v\n", err)
		os.Exit(1)
	}

	var bodyReader io.Reader
	if *body != "" {
		bodyReader = strings.NewReader(*body)
	}

	client := &http.Client{
		Timeout: time.Duration(*timeout) * time.Second,
	}

	req, err := http.NewRequest(*method, *url, bodyReader)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create request: %v\n", err)
		os.Exit(1)
	}

	for k, v := range headerMap {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Request failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read response body: %v\n", err)
		os.Exit(1)
	}

	fmt.Print(string(respBody))
	if resp.StatusCode >= 400 {
		os.Exit(1)
	}
}
