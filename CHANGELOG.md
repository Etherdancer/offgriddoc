# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-09-29

### Security
- Exporting with a drawn but unconfirmed redaction box no longer produces an unredacted
  file: the box is applied before export.

### Fixed
- Multi-page PDFs: all pages are now editable and exported. Previously only page 1 was
  loaded and exported PDFs silently dropped every other page.
- PDFs failed to open in browsers without `Map.prototype.getOrInsertComputed`
  (Safari, older Chrome, Android WebView); the pdf.js legacy build is now used.
- Auto-redact on photos placed boxes in the wrong spot when the photo had an EXIF rotation;
  OCR now runs on exactly what is shown on screen.
- Auto-redact hung forever when an OCR language model could not be downloaded; it now shows
  an error after 90 s.
- Loading an unsupported or broken file now shows an error instead of an endless spinner.

### Changed
- The OCR engine and the English model are self-hosted, so English OCR works offline from the
  first run and no code is loaded from a CDN.
- PNG/JPEG export uses blobs (faster, no huge data URLs) and names multi-page exports by page.
- README rewritten to describe what the app actually does.

### Added
- Page navigation for PDFs; per-page undo history.
- GitHub Actions CI (lint + build), changelog, security policy.

## [1.0.0] - 2026-09-21

- Initial public release.
