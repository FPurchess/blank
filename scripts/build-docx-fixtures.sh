#!/usr/bin/env bash
# Builds the Word documents the import tests read, from fixture.md, with the
# two other common writers of .docx files: pandoc and LibreOffice.
# Needs pandoc and soffice (LibreOffice) on the PATH.
set -euo pipefail

cd "$(dirname "$0")/../src/importers/docx/__fixtures__"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pandoc fixture.md -o pandoc.docx
pandoc fixture.md -o "$work/libreoffice.odt"
# English style names, whatever the language of the installed LibreOffice
soffice -env:UserInstallation="file://$work/profile" --headless --language=en-US \
  --convert-to docx --outdir "$work" "$work/libreoffice.odt" >/dev/null
cp "$work/libreoffice.docx" libreoffice.docx
ls -l pandoc.docx libreoffice.docx
