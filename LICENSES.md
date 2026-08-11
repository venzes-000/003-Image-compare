# Drittanbieter-Lizenzen – Version 1.1

Diese Übersicht dient als Orientierung für den im Lockfile dokumentierten Projektstand. Maßgeblich sind die Lizenztexte der jeweiligen Pakete und ihrer transitiven Abhängigkeiten. Ein Release für den Unternehmenseinsatz sollte die tatsächlich installierten Versionen automatisiert inventarisieren und durch die zuständige Stelle freigeben lassen.

## Laufzeitabhängigkeiten

| Paket | Zweck | Lizenz |
| --- | --- | --- |
| React | Benutzeroberfläche | MIT |
| React DOM | Browser-Rendering | MIT |
| `@zip.js/zip.js` | lokales, speicherschonendes Lesen von ZIP-Dateien | BSD-3-Clause |
| `idb` | kleine Promise-basierte IndexedDB-Schnittstelle | ISC |
| `lucide-react` | lokal gebündelte Oberflächen-Icons | ISC |
| [`exifr`](https://github.com/MikeKovarik/exifr) | lokale EXIF-, GPS-, Zeit- und Kamera-Metadaten | MIT |
| [`utif2`](https://github.com/photopea/UTIF.js) | lokale Dekodierung der ersten Seite von TIFF-Dateien | MIT |
| [`heic-to@1.5.2`](https://github.com/hoppergee/heic-to) | lazy geladene lokale HEIC/HEIF-Dekodierung | LGPL-3.0 |

## Besonderer Hinweis zu HEIC/HEIF

`heic-to@1.5.2` bindet den HEIC/HEIF-Decoder lokal in die Anwendung ein und wird erst beim Verarbeiten einer entsprechenden Datei als optionaler Decoder-Chunk geladen. Bilder werden dafür weder zu einem CDN noch zu einem Konvertierungsdienst übertragen. Der Decoder und die zugehörigen Komponenten stehen unter der GNU Lesser General Public License Version 3.0 (LGPL-3.0).

- Quellcode: [github.com/hoppergee/heic-to](https://github.com/hoppergee/heic-to)
- Lizenz: [GNU LGPL Version 3.0](https://www.gnu.org/licenses/lgpl-3.0.html)
- Paketversion dieses Projektstands: `heic-to@1.5.2`

Beim Verteilen oder betrieblichen Bereitstellen müssen die anwendbaren LGPL-Pflichten, Lizenzhinweise, Quellcodezugang und die Austausch- beziehungsweise Relink-Möglichkeit des Bibliotheksanteils berücksichtigt werden. Diese Übersicht ist keine Rechtsberatung. Vor einem Firmeneinsatz muss die zuständige Rechts-, Compliance- oder Open-Source-Stelle die konkrete Auslieferung prüfen.

`exifr` und `utif2` stehen unter der MIT-Lizenz. Ihre Copyright- und Lizenzhinweise müssen bei einer Weitergabe entsprechend den jeweiligen Lizenztexten erhalten bleiben.

## Entwicklungs- und Testabhängigkeiten

| Paket | Zweck | Lizenz |
| --- | --- | --- |
| Vite und `@vitejs/plugin-react` | Entwicklungsserver und Produktions-Build | MIT |
| TypeScript | statische Typprüfung | Apache-2.0 |
| Vitest | Unit-Tests | MIT |
| Testing Library | Komponententests | MIT |
| Playwright Test | Browser-End-to-End-Tests | Apache-2.0 |
| JSZip | Erzeugung rein synthetischer Test-ZIPs | MIT oder GPL-3.0-or-later, nach Wahl gemäß Paketlizenz |
| PNGJS | Erzeugung synthetischer PNG-Testbilder | MIT |
| Oxlint | Quellcodeprüfung | MIT |

## Nicht enthalten

- Kein OpenCV-/ORB-Paket wird ausgeliefert.
- Kein ONNX-Runtime-Paket oder KI-Modell wird ausgeliefert.
- Keine Tracking-, Analytics- oder Telemetrie-Bibliothek wird ausgeliefert.
- Keine externe Kartenbibliothek und kein externer Geocoding- oder Reverse-Geocoding-Dienst wird verwendet.
- Keine Bibliothek wird zur Laufzeit von einem CDN geladen.

Dieses Repository legt durch diese Datei keine eigene Lizenz für den Anwendungscode fest. Falls das Projekt verteilt oder öffentlich weiterentwickelt werden soll, muss der Rechteinhaber zusätzlich eine geeignete Projektlizenz auswählen und als separate Lizenzdatei beilegen.
