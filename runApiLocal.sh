#!/bin/bash

cd goapi

go build -o runLocal ./cmd/local/runLocal.go && ./runLocal