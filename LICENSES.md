# Drittanbieter-Lizenzen

Diese Übersicht dient als Orientierung für den im Lockfile dokumentierten Projektstand. Maßgeblich sind die Lizenztexte der jeweiligen Pakete und ihrer transitiven Abhängigkeiten. Ein Release für den Unternehmenseinsatz sollte die tatsächlich installierten Versionen automatisiert inventarisieren und durch die zuständige Stelle freigeben lassen.

## Laufzeitabhängigkeiten

| Paket | Zweck | Lizenz |
| --- | --- | --- |
| React | Benutzeroberfläche | MIT |
| React DOM | Browser-Rendering | MIT |
| `@zip.js/zip.js` | lokales, speicherschonendes Lesen von ZIP-Dateien | BSD-3-Clause |
| `idb` | kleine Promise-basierte IndexedDB-Schnittstelle | ISC |
| `@tanstack/react-virtual` | performante/virtualisierte Ergebnislisten | MIT |
| `lucide-react` | lokal gebündelte Oberflächen-Icons | ISC |

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
- Keine Bibliothek wird zur Laufzeit von einem CDN geladen.

Dieses Repository legt durch diese Datei keine eigene Lizenz für den Anwendungscode fest. Falls das Projekt verteilt oder öffentlich weiterentwickelt werden soll, muss der Rechteinhaber zusätzlich eine geeignete Projektlizenz auswählen und als separate Lizenzdatei beilegen.
