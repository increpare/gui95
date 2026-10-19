NODE ?= node
.DEFAULT_GOAL := help
.PHONY: help desktop serve distro test

help:
	@echo "make / make help   Show commands"
	@echo "make serve         Serve the widget reference and demos on a free port with LAN links"
	@echo "make desktop       Explain desktop availability for this reference repository"
	@echo "make distro        Package the GUI95 reference and build kit for distribution"
	@echo "make test          Check delivery helpers and the source reference"

desktop:
	@echo "GUI95 is a reference and toolkit; this repository has no desktop executable."

serve:
	$(NODE) tools/gui95-serve.mjs demo/dist

distro:
	$(NODE) tools/package-source.mjs

test:
	$(NODE) --test tools/test/*.test.mjs
