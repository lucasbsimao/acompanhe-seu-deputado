package pagination

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"
)

// Generic config for any paginated endpoint that returns pages of T.
type PaginationConfig[T any] struct {
	PageSize int
	Workers  int
	Client   *http.Client

	// Retry settings
	MaxRetries   int
	RetryWaitMin time.Duration
	RetryWaitMax time.Duration

	// How to build the URL for a given page
	BuildURL func(page, pageSize int) (string, error)

	// How to decode a HTTP response into a slice of T
	// IMPORTANT: DecodePage MUST NOT close resp.Body.
	DecodePage func(resp *http.Response) ([]T, error)

	// How to extract the total count from the first response.
	// Example: from "X-Total-Count" header.
	// If nil, we assume a single page.
	ExtractTotalCount func(resp *http.Response) (int, error)
}

type pageResult[T any] struct {
	Page  int
	Items []T
	Err   error
}

// Public entry point.
// ctx is used for cancellation/timeouts.
// This function is generic over T, and orchestrates pagination + parallelism.
func FetchPaginatedParallel[T any](ctx context.Context, cfg PaginationConfig[T]) ([]T, error) {
	cfg, err := normalizePaginationConfig(cfg)
	if err != nil {
		return nil, err
	}

	// 1) Fetch first page (and compute total pages).
	firstItems, totalPages, err := fetchFirstPage(ctx, cfg)
	if err != nil {
		return nil, err
	}

	if totalPages == 1 {
		return firstItems, nil
	}

	// 2) Parallel fetch of remaining pages.
	jobs := make(chan int)
	results := make(chan pageResult[T])

	startWorkers(ctx, cfg, jobs, results)
	enqueuePageJobs(totalPages, jobs)

	// 3) Collect and assemble in order.
	return collectPageResults(ctx, totalPages, firstItems, results)
}

// ----------------- internal helpers -----------------

// Normalize a PaginationConfig to reasonable defaults.
//
// cfg is modified in-place if necessary.
//
// Returns cfg, client, nil if successful.
// Returns cfg, nil, error if cfg is invalid (e.g. missing
// BuildURL or DecodePage).
//
// cfg is modified to fill in missing fields with reasonable
// defaults. If cfg.Client is nil, a default *http.Client is
// created with a 1-second timeout. cfg.Workers is set to 4 if
// it is <= 0. cfg.MaxRetries is set to 0 if it is < 0.
// cfg.RetryWaitMin and cfg.RetryWaitMax are set to 250ms and 2s
// respectively if they are <= 0. cfg.PageSize is set to 100 if
// it is <= 0.
func normalizePaginationConfig[T any](cfg PaginationConfig[T]) (PaginationConfig[T], error) {
	if cfg.BuildURL == nil {
		return cfg, fmt.Errorf("BuildURL is required")
	}
	if cfg.DecodePage == nil {
		return cfg, fmt.Errorf("DecodePage is required")
	}

	if cfg.PageSize <= 0 {
		cfg.PageSize = 100
	}
	if cfg.Workers <= 0 {
		cfg.Workers = 4
	}
	if cfg.MaxRetries < 0 {
		cfg.MaxRetries = 0
	}
	if cfg.RetryWaitMin <= 0 {
		cfg.RetryWaitMin = 250 * time.Millisecond
	}
	if cfg.RetryWaitMax <= 0 {
		cfg.RetryWaitMax = 2 * time.Second
	}

	client := cfg.Client
	if client == nil {
		cfg.Client = &http.Client{
			Timeout: 2 * time.Second,
		}
	}

	return cfg, nil
}

// fetchFirstPage fetches the first page of paginated data.
//
// It fetches the first page using cfg.BuildURL and cfg.PageSize.
// If cfg.ExtractTotalCount is not nil, it extracts the total count from
// the response. If the extraction fails, it returns an error.
// If cfg.DecodePage is not nil, it decodes the response into a slice of
// T. If the decoding fails, it returns an error.
//
// It returns the slice of T, the total number of pages, and an error.
// If there is an error, the total number of pages is 0.
func fetchFirstPage[T any](ctx context.Context, cfg PaginationConfig[T]) ([]T, int, error) {
	firstURL, err := cfg.BuildURL(1, cfg.PageSize)
	if err != nil {
		return nil, 0, err
	}

	resp, err := doGetWithRetry(ctx, firstURL, cfg)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	totalPages := 1
	if cfg.ExtractTotalCount != nil {
		totalCount, err := cfg.ExtractTotalCount(resp)
		if err != nil {
			return nil, 0, err
		}
		totalPages = int(math.Ceil(float64(totalCount) / float64(cfg.PageSize)))
		fmt.Println("Total records:", totalCount)
		fmt.Println("Total pages:", totalPages)
	}

	items, err := cfg.DecodePage(resp)
	if err != nil {
		return nil, 0, err
	}

	return items, totalPages, nil
}

// startWorkers starts a specified number of worker goroutines that consume
// from the jobs channel and produce to the results channel.
//
// Each worker goroutine will fetch a page of data using doGetWithRetry,
// decode the page using cfg.DecodePage, and send the result to the
// results channel. If there is an error, it will send the error to the
// results channel instead.
//
// The function will block until the context is cancelled or the jobs
// channel is closed.
func startWorkers[T any](
	ctx context.Context,
	cfg PaginationConfig[T],
	jobs <-chan int,
	results chan<- pageResult[T],
) {
	for w := 0; w < cfg.Workers; w++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case page, ok := <-jobs:
					if !ok {
						return
					}

					url, err := cfg.BuildURL(page, cfg.PageSize)
					if err != nil {
						select {
						case results <- pageResult[T]{Page: page, Err: err}:
						case <-ctx.Done():
						}
						continue
					}

					resp, err := doGetWithRetry(ctx, url, cfg)
					if err != nil {
						select {
						case results <- pageResult[T]{Page: page, Err: err}:
						case <-ctx.Done():
						}
						continue
					}

					items, decErr := cfg.DecodePage(resp)
					resp.Body.Close()
					if decErr != nil {
						err = decErr
					}

					select {
					case results <- pageResult[T]{Page: page, Items: items, Err: err}:
					case <-ctx.Done():
						return
					}
				}
			}
		}()
	}
}

func enqueuePageJobs(totalPages int, jobs chan<- int) {
	go func() {
		for page := 2; page <= totalPages; page++ {
			jobs <- page
		}
		close(jobs)
	}()
}

// Collects page results from the given channel into a single slice of T.
//
// The function takes in a context, the total number of pages, the first page of items,
// and a channel of page results. It returns a single slice of T containing all the
// items from all pages, and an error. If there is an error fetching any page, it
// returns an error with a message indicating the page that failed.
//
// The function will return immediately if the context is canceled or done.
//
// The function does not close the results channel. It is the caller's responsibility to
// close the channel when it is done.
func collectPageResults[T any](
	ctx context.Context,
	totalPages int,
	firstItems []T,
	results <-chan pageResult[T],
) ([]T, error) {
	pageMap := make(map[int][]T)
	pageMap[1] = firstItems

	for i := 2; i <= totalPages; i++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case res := <-results:
			if res.Err != nil {
				return nil, fmt.Errorf("error fetching page %d: %w", res.Page, res.Err)
			}
			fmt.Println("Fetched page:", res.Page, "records:", len(res.Items))
			pageMap[res.Page] = res.Items
		}
	}

	var all []T
	for page := 1; page <= totalPages; page++ {
		all = append(all, pageMap[page]...)
	}

	return all, nil
}

func doGetWithRetry[T any](
	ctx context.Context,
	url string,
	cfg PaginationConfig[T],
) (*http.Response, error) {
	attempt := 0

	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}

		resp, err := cfg.Client.Do(req)
		if !shouldRetry(ctx, resp, err) || attempt >= cfg.MaxRetries {
			return resp, err
		}

		if resp != nil {
			resp.Body.Close()
		}

		// respect Retry-After if present
		sleep := retryAfterOrBackoff(resp, attempt, cfg.RetryWaitMin, cfg.RetryWaitMax)

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(sleep):
		}

		attempt++
	}
}

func shouldRetry(ctx context.Context, resp *http.Response, err error) bool {
	if err != nil {
		// don't retry on context cancellation/timeouts
		if errors.Is(err, context.Canceled) {
			return false
		}

		if errors.Is(err, context.DeadlineExceeded) && ctx.Err() == context.DeadlineExceeded {
			return false
		}

		return true // network or other transient error
	}

	if resp == nil {
		return true
	}

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
		return true
	}
	if resp.StatusCode >= 500 && resp.StatusCode <= 599 {
		return true
	}

	return false
}

// retryAfterOrBackoff returns the recommended wait time for a retry.
//
// It first checks the Retry-After header (in seconds) and returns that if
// present and positive. If not present, it returns an exponential backoff
// based on the attempt number, with a minimum and maximum bounded by min and
// max respectively.
func retryAfterOrBackoff(resp *http.Response, attempt int, min, max time.Duration) time.Duration {
	// Try Retry-After header (seconds)
	if resp != nil {
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if sec, err := strconv.Atoi(ra); err == nil && sec > 0 {
				return time.Duration(sec) * time.Second
			}
		}
	}

	// Exponential backoff
	backoff := min * time.Duration(1<<attempt)
	if backoff > max {
		return max
	}
	return backoff
}
