package domain

type Politician struct {
	ID       int
	Name     string
	Party    Party
	Uf       Uf
	PhotoURL string
	Role     Role
}

type Role string

const (
	CityCouncilor Role = "CITY_COUNCILOR"
	Deputy        Role = "DEPUTY"
	Senator       Role = "SENATOR"
)
