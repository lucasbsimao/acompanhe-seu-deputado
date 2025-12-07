package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
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

func buildDeputadosURL(page, pageSize int) (string, error) {
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

func retrieveAllDeputados() ([]politicianData, error) {
	const pageSize = 100

	var all []politicianData
	page := 1
	totalPages := 1

	for page <= totalPages {
		url, err := buildDeputadosURL(page, pageSize)
		if err != nil {
			fmt.Println("Error building URL:", err)
			return nil, err
		}

		resp, err := http.Get(url)
		if err != nil {
			fmt.Printf("Error fetching page %d: %v\n", page, err)
			return nil, err
		}
		defer resp.Body.Close()

		if page == 1 {
			totalCountHeader := resp.Header.Get("X-Total-Count")
			totalCount, err := strconv.Atoi(totalCountHeader)
			if err != nil {
				return nil, fmt.Errorf("Invalid X-Total-Count header: %v", err)
			}

			totalPages = int(math.Ceil(float64(totalCount) / float64(pageSize)))
			fmt.Println("Total records:", totalCount)
			fmt.Println("Total pages:", totalPages)
		}

		var apiResp apiResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			fmt.Printf("Error decoding response for page %d: %v\n", page, err)
			return nil, err
		}

		all = append(all, apiResp.Data...)

		fmt.Println("Fetched page:", page, "records:", len(apiResp.Data))
		page++
	}

	return all, nil
}

func main() {
	data, err := retrieveAllDeputados()
	if err != nil {
		panic(err)
	}

	fmt.Println("TOTAL DEPUTADOS:", len(data))

	for i, p := range data {
		fmt.Println(i, p.ID, p.Name, p.Party, p.Uf, p.PhotoURL)
	}
}
