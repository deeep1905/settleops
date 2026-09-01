.PHONY: setup test run console dev report verify clean

PY := .venv/bin/python
PIP := .venv/bin/pip

setup:
	python3 -m venv .venv
	$(PIP) install -r requirements.txt

test: setup
	$(PY) -m pytest tests/ -q

run:
	$(PY) -m uvicorn settleops.api:app --reload --port 8000

console:
	cd web && bun install && bun run dev

dev:
	make run &
	make console

report:
	$(PY) -m settleops

# the full local gate: tests + regeneration-only proof (what CI runs)
verify: test report
	@if ! git diff --quiet results data; then \
		echo "FAIL: results/ or data/ changed after regeneration — numbers must enter the repo only through regeneration"; \
		git diff --stat results data; exit 1; \
	else echo "OK: results regenerate bit-for-bit"; fi

clean:
	rm -rf .venv web/node_modules web/dist __pycache__ **/__pycache__
