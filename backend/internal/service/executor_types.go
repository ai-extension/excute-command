package service

import (
	"bytes"
	"context"
	"io"
	"regexp"
	"strings"
	"sync"
	"time"
)

// AutoInputRule mô tả một cặp (pattern → input) để tự động điền vào stdin
// khi output của lệnh khớp với pattern.
type AutoInputRule struct {
	// Pattern là plain string hoặc regex POSIX được tìm kiếm trong từng dòng output.
	Pattern string `json:"pattern"`
	// Input là chuỗi sẽ được gửi vào stdin (kèm "\n" tự động).
	Input string `json:"value"` // Note: UI uses "value", but json might map differently, but we align with FE!
	// Dùng Regex để quét match output thay vì plain string chứa  
	IsRegex bool `json:"isRegex"`
}

// GroupExecConfig chứa cấu hình terminal cho một WorkflowGroup.
// Thiết kế dạng value-type để dễ pass-by-value qua stack call.
type GroupExecConfig struct {
	// UseTTY = true → spawn PTY (pseudo-terminal) thay vì sh -c thường.
	UseTTY bool
	// AutoInputs là danh sách các rule tự động điền stdin.
	// Hoạt động cả khi UseTTY=false (nếu lệnh không check isatty).
	AutoInputs []AutoInputRule
}

// autoInputWatcher theo dõi output và gửi auto-input vào stdinPipe khi pattern khớp.
// Caller chạy nó trong một goroutine riêng.
type autoInputWatcher struct {
	rules     []AutoInputRule
    regexes   []*regexp.Regexp
	stdinPipe io.Writer
	mu        sync.Mutex

	// cooldown để tránh gửi cùng một input nhiều lần liên tiếp trong short burst
	lastSent map[int]time.Time
}

func newAutoInputWatcher(rules []AutoInputRule, stdinPipe io.Writer) *autoInputWatcher {
    regexes := make([]*regexp.Regexp, len(rules))
    for i, r := range rules {
        if r.IsRegex && r.Pattern != "" {
            regexes[i], _ = regexp.Compile(r.Pattern)
        }
    }
	return &autoInputWatcher{
		rules:     rules,
        regexes:   regexes,
		stdinPipe: stdinPipe,
		lastSent:  make(map[int]time.Time),
	}
}

// Write implements io.Writer — được gọi mỗi khi có output mới từ process.
// Caller thường dùng cùng với io.MultiWriter để vừa log vừa watch.
func (w *autoInputWatcher) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	chunk := string(p)
	lines := strings.Split(chunk, "\n")

	now := time.Now()
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		for i, rule := range w.rules {
			if rule.Pattern == "" {
				continue
			}
            
            matched := false
            if rule.IsRegex && w.regexes[i] != nil {
                matched = w.regexes[i].MatchString(line)
            } else {
                matched = strings.Contains(strings.ToLower(line), strings.ToLower(rule.Pattern))
            }

			if matched {
				// Cooldown 500ms để tránh spam cùng một rule
				if last, ok := w.lastSent[i]; ok && now.Sub(last) < 500*time.Millisecond {
					continue
				}
				w.stdinPipe.Write([]byte(rule.Input + "\n")) //nolint:errcheck
				w.lastSent[i] = now
				break // chỉ match rule đầu tiên khớp mỗi dòng
			}
		}
	}
	return len(p), nil
}

// combinedWriter = MultiWriter nhưng tất cả lỗi nil đều được bỏ qua,
// tránh một sink lỗi cancel cả pipeline.
type combinedWriter struct {
	writers []io.Writer
}

func newCombinedWriter(writers ...io.Writer) io.Writer {
	var valid []io.Writer
	for _, w := range writers {
		if w != nil {
			valid = append(valid, w)
		}
	}
	if len(valid) == 0 {
		return io.Discard
	}
	return io.MultiWriter(valid...)
}

// captureAndBroadcastWriter gom output vào buffer đồng thời ghi ra downstream.
type captureAndBroadcastWriter struct {
	downstream io.Writer
	buf        bytes.Buffer
	mu         sync.Mutex
}

func (w *captureAndBroadcastWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	w.buf.Write(p) //nolint:errcheck
	w.mu.Unlock()
	if w.downstream != nil {
		return w.downstream.Write(p)
	}
	return len(p), nil
}

func (w *captureAndBroadcastWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.buf.String()
}

// runWithAutoInput chạy một function f(stdinPipe) rồi khởi động watcher goroutine.
// Trả về channel để caller biết khi nào watcher kết thúc.
func startAutoInputWatcher(ctx context.Context, rules []AutoInputRule, stdinPipe io.Writer, outputSrc io.Reader) {
	if len(rules) == 0 || stdinPipe == nil || outputSrc == nil {
		return
	}
	watcher := newAutoInputWatcher(rules, stdinPipe)
	go func() {
		buf := make([]byte, 4096)
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			n, err := outputSrc.Read(buf)
			if n > 0 {
				watcher.Write(buf[:n]) //nolint:errcheck
			}
			if err != nil {
				return
			}
		}
	}()
}

// makeAutoInputCh tạo (stdinCh, dispatchWriter):
// - dispatchWriter phải được thêm vào MultiWriter pipeline output để nhận output
// - khi dòng output match rule, ghi input vào stdinCh
// - stdinCh được truyền vào ExecuteWithTTY / ExecuteCommandWithTTY
//
// Nếu không có rules, trả về (nil, io.Discard).
func makeAutoInputCh(ctx context.Context, rules []AutoInputRule) (<-chan string, io.Writer) {
	if len(rules) == 0 {
		return nil, io.Discard
	}
	ch := make(chan string, 8) // buffered để tránh block watcher goroutine
	w := pipeAutoInputs(ctx, rules, ch)
	return ch, w
}

// pipeAutoInputs kết nối một io.Writer output source với autoInput watcher.
// Trả về một io.Writer mà caller phải thêm vào MultiWriter pipeline output.
// Khi dòng output match rule → gửi input vào stdinCh.
func pipeAutoInputs(ctx context.Context, rules []AutoInputRule, stdinCh chan<- string) io.Writer {
	if len(rules) == 0 || stdinCh == nil {
		return io.Discard
	}
    
    regexes := make([]*regexp.Regexp, len(rules))
    for i, r := range rules {
        if r.IsRegex && r.Pattern != "" {
            regexes[i], _ = regexp.Compile(r.Pattern)
        }
    }
    
	return &autoInputDispatcher{
        ctx: ctx, 
        rules: rules, 
        regexes: regexes,
        stdinCh: stdinCh,
    }
}

// autoInputDispatcher là io.Writer nhận output, match rules và gửi vào stdinCh.
type autoInputDispatcher struct {
	ctx      context.Context
	rules    []AutoInputRule
    regexes  []*regexp.Regexp
	stdinCh  chan<- string
	mu       sync.Mutex
	lastSent map[int]time.Time
}

func (d *autoInputDispatcher) Write(p []byte) (n int, err error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.lastSent == nil {
		d.lastSent = make(map[int]time.Time)
	}
	now := time.Now()
	chunk := string(p)
	for _, line := range strings.Split(chunk, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		for i, rule := range d.rules {
			if rule.Pattern == "" {
				continue
			}
            
            matched := false
            if rule.IsRegex && d.regexes[i] != nil {
                matched = d.regexes[i].MatchString(line)
            } else {
                matched = strings.Contains(strings.ToLower(line), strings.ToLower(rule.Pattern))
            }
            
			if matched {
				if last, ok := d.lastSent[i]; ok && now.Sub(last) < 500*time.Millisecond {
					continue
				}
				select {
				case d.stdinCh <- rule.Input:
					d.lastSent[i] = now
				case <-d.ctx.Done():
					return len(p), nil
				default:
					// channel full, skip this time
				}
				break
			}
		}
	}
	return len(p), nil
}

