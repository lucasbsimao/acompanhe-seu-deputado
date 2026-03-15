package pagination

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

type jsonArrayStreamWriter[T any] struct {
	f        *os.File
	w        *bufio.Writer
	wroteAny bool
	closed   bool
}

func newJSONArrayStreamWriter[T any](path string) (*jsonArrayStreamWriter[T], error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}

	w := bufio.NewWriterSize(f, 1024*1024)

	if _, err := w.WriteString("["); err != nil {
		_ = w.Flush()
		_ = f.Close()
		return nil, err
	}

	return &jsonArrayStreamWriter[T]{f: f, w: w}, nil
}

func (sw *jsonArrayStreamWriter[T]) WriteItems(items []T) error {
	if sw.closed {
		return fmt.Errorf("stream writer is closed")
	}

	for _, it := range items {
		// comma between elements (even across pages)
		if sw.wroteAny {
			if _, err := sw.w.WriteString(","); err != nil {
				return err
			}
		} else {
			sw.wroteAny = true
		}

		b, err := json.Marshal(it)
		if err != nil {
			return err
		}
		if _, err := sw.w.Write(b); err != nil {
			return err
		}
	}

	return nil
}

func (sw *jsonArrayStreamWriter[T]) Close() error {
	if sw.closed {
		return nil
	}
	sw.closed = true

	var closeErr error

	if _, err := sw.w.WriteString("]"); err != nil {
		closeErr = err
	}
	if err := sw.w.Flush(); closeErr == nil && err != nil {
		closeErr = err
	}
	if err := sw.f.Close(); closeErr == nil && err != nil {
		closeErr = err
	}

	return closeErr
}
