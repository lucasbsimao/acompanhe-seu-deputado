package deputies

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"scripts/pagination"
	"strconv"
	"time"
)

type politicianData struct {
	ID       int    `json:"id"`
	Name     string `json:"nome"`
	Party    string `json:"siglaPartido"`
	Uf       string `json:"siglaUf"`
	PhotoURL string `json:"urlFoto"`
}

type apiResponse struct {
	Data []politicianData `json:"dados"`
}

// Endpoint-specific URL builder.
func buildDeputiesURL(page, pageSize int) (string, error) {
	u, err := url.Parse("https://dadosabertos.camara.leg.br/api/v2/deputados")
	if err != nil {
		return "", err
	}

	q := u.Query()
	q.Set("ordem", "ASC")
	q.Set("ordenarPor", "nome")
	q.Set("pagina", strconv.Itoa(page))
	q.Set("itens", strconv.Itoa(pageSize))

	u.RawQuery = q.Encode()
	return u.String(), nil
}

// Endpoint-specific decoder
func decodeDeputiesPage(resp *http.Response) ([]politicianData, error) {
	var apiResp apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}
	return apiResp.Data, nil
}

// Extract total from X-Total-Count header.
func extractTotalFromHeader(resp *http.Response) (int, error) {
	totalCountHeader := resp.Header.Get("X-Total-Count")
	if totalCountHeader == "" {
		return 0, fmt.Errorf("missing X-Total-Count header")
	}
	return strconv.Atoi(totalCountHeader)
}

func RetrieveAllDeputies(ctx context.Context) error {
	cfg := pagination.PaginationConfig[politicianData]{
		PageSize:          100,
		Workers:           5,
		MaxRetries:        3,
		RetryWaitMin:      250 * time.Millisecond,
		RetryWaitMax:      2 * time.Second,
		Client:            nil, // use default client with timeout from pagination package
		BuildURL:          buildDeputiesURL,
		DecodePage:        decodeDeputiesPage,
		ExtractTotalCount: extractTotalFromHeader,
		FileName:          "deputies.json",
	}

	return pagination.FetchPaginatedParallel(ctx, cfg)
}
