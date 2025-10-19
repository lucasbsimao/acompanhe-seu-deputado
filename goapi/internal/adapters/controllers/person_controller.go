package controllers

import (
	"encoding/json"
	"errors"

	"net/http"
	"strconv"

	"github.com/acompahe-seu-deputado/internal/domain"
	"github.com/acompahe-seu-deputado/internal/ports/services"
	"github.com/go-chi/chi/v5"
)

type PersonController struct {
	personService services.PersonService
}

func NewPersonController(s services.PersonService) *PersonController {
	return &PersonController{personService: s}
}

type personResp struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Party string `json:"party"`
}

type createReq struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Party string `json:"party"`
}

func (h *PersonController) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/{id}", h.get)
	r.Get("/", h.list)
	r.Post("/", h.create)
	return r
}

func (h *PersonController) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := h.personService.Get(r.Context(), id)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	h.writeJSON(w, http.StatusOK, personResp{ID: p.ID, Name: p.Name, Party: p.Party})
}

func (h *PersonController) list(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit == 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	ps, err := h.personService.List(r.Context(), limit, offset)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	out := make([]personResp, 0, len(ps))
	for _, p := range ps {
		out = append(out, personResp{ID: p.ID, Name: p.Name, Party: p.Party})
	}
	h.writeJSON(w, http.StatusOK, out)
}

func (h *PersonController) create(w http.ResponseWriter, r *http.Request) {
	var in createReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	p, err := h.personService.Create(r.Context(), domain.Person{ID: in.ID, Name: in.Name, Party: in.Party})
	if err != nil {
		h.writeErr(w, err)
		return
	}
	h.writeJSON(w, http.StatusCreated, personResp{ID: p.ID, Name: p.Name, Party: p.Party})
}

func (h *PersonController) writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrValidation):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, domain.ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, domain.ErrConflict):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, "internal error:"+err.Error(), http.StatusInternalServerError)
	}
}

func (h *PersonController) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
