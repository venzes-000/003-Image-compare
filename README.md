# Bildabgleich Lokal 1.1

Bildabgleich Lokal 1.1 ist eine statische Webanwendung zur Sichtung doppelter und visuell ähnlicher Baustellenfotos. Eine ZIP-Datei wird direkt im Browser geöffnet, in kleinen Arbeitsschritten analysiert und als überprüfbare Ergebnisgruppen dargestellt. Neben dem Bildinhalt kann die Anwendung lokal vorhandene Aufnahmeinformationen als zusätzlichen Prüfkontext anzeigen. Sie löscht und verändert keine Originaldateien.

Der erste Anwendungsfall sind Fotolieferungen aus dem Glasfaserausbau, die als Grundlage einer Budget- oder Leistungsprüfung dienen. Die Anwendung unterstützt dabei ausschließlich den nachvollziehbaren Bildabgleich. Sie berechnet keine Budgets oder Baumengen und trifft keine finanzielle Entscheidung automatisch.

> **Datenschutz-Kernaussage:** Alle Bilder und aus ihnen gelesenen Metadaten werden ausschließlich lokal in diesem Browser verarbeitet. Es werden keine Bilder, GPS-Koordinaten oder sonstigen Aufnahmeinformationen an einen Server übertragen.

Die Anwendung ist für aktuelle Versionen von Microsoft Edge und Google Chrome unter Windows sowie für einen Einsatz ohne lokale Installation gedacht. Nach der Bereitstellung auf GitHub Pages reicht ein normaler Browser. Der Quellcode ist eine produktionsnahe erste Version, aber kein forensisches Beweismittel und kein Ersatz für die manuelle Freigabe.

## Was die Anwendung leistet

- ZIP-Dateien mit JPEG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP und TIFF lokal einlesen
- bei animierten oder mehrseitigen Bilddateien ausschließlich das erste Bild beziehungsweise den ersten Frame analysieren
- normale Duplikate sowie Varianten mit anderer Kompression, Auflösung oder leichter Helligkeitsänderung finden
- in einem sensitiveren Modus auch schwierigere Zuschnitte und kleine geometrische Änderungen als Kandidaten vorschlagen
- Bilder über aHash, dHash, DCT-basierten pHash, Farbinformationen und Strukturmerkmale vergleichen
- kostengünstige Kandidatensuche von den genaueren Bildvergleichen trennen
- mögliche Duplikate gruppieren und technische Gründe transparent anzeigen
- lokal vorhandene EXIF-Daten wie GPS-Position, Aufnahmezeit sowie Kamera- und Objektivmodell als getrennten Kontext vergleichen
- Metadaten ausschließlich zur Einordnung visueller Treffer verwenden; sie erzeugen niemals allein Kandidaten oder Duplikatgruppen
- Entscheidungen wie „Duplikat“, „kein Duplikat“ oder „später prüfen“ lokal festhalten
- Ergebnisse als Excel-kompatiblen CSV- und als JSON-Bericht herunterladen
- Analyse pausieren oder abbrechen, ohne Dateien zu verändern
- Vorschaubilder und Merkmale nur nach ausdrücklicher Cache-Aktivierung in IndexedDB speichern
- ohne Backend, Analytics, Telemetrie, Cookies, CDN-Skripte, externe KI-API, Karten- oder Geocoding-Dienst laufen

## Wichtige Grenzen vor dem ersten Einsatz

Ein hoher Ähnlichkeitswert ist ein technischer Hinweis, keine mathematische Garantie. Gerade Baustellen enthalten wiederkehrende Motive: Gräben, Kabeltrommeln, Warnbaken, Fahrzeuge oder nahezu gleich aussehende Hausanschlüsse können Fehlalarme erzeugen. Umgekehrt können starke Zuschnitte, größere Drehungen, Perspektivwechsel, Verdeckungen und stark unterschiedliche Belichtung echte Duplikate zu verschieden erscheinen lassen.

Die Anwendung löscht deshalb nie automatisch. Prüfen Sie jede vorgeschlagene Gruppe, bevor außerhalb der Anwendung Dateien gelöscht, verschoben oder archiviert werden. Bewahren Sie bis zum Abschluss eine unveränderte Sicherung der ursprünglichen ZIP-Datei auf.

## Datenschutz und lokales Verarbeitungsmodell

### Was lokal bleibt

- Die ausgewählte ZIP-Datei und ihre Dateinamen werden nur über die Browser-Dateiauswahl geöffnet.
- ZIP-Einträge werden im Tab gelesen; Bilder werden nicht auf ein Server-Dateisystem extrahiert.
- Dekodierung, Fingerabdrücke, Histogramme, Strukturvergleich, Gruppierung und manuelle Entscheidungen laufen im Browser.
- EXIF-, GPS-, Zeit-, Kamera- und Objektivinformationen werden ausschließlich lokal aus den Bilddateien gelesen und verglichen.
- Die Anwendung ruft weder externe Karten noch Reverse-Geocoding- oder sonstige Standortdienste auf.
- Berichte werden als lokale `Blob`-Downloads erzeugt.
- Es gibt im Anwendungscode keinen Uploadpfad für Bilddaten und keine Trackingbibliothek.
- Vollständige Originalbilder werden nicht dauerhaft in IndexedDB gespeichert.

Beim Aufruf einer GitHub-Pages-Adresse lädt der Browser selbstverständlich die statischen HTML-, CSS-, JavaScript- und Worker-Dateien vom Webhost. Der Webhost kann dabei die üblichen Verbindungsdaten wie IP-Adresse, Zeitpunkt und User-Agent verarbeiten. Die ausgewählte ZIP-Datei, Bildinhalte, Bildmerkmale und Berichtsdaten gehören **nicht** zu diesen Webanfragen.

### Lokaler Cache ist opt-in

Der Analyse-Cache ist standardmäßig ausgeschaltet. Erst nach ausdrücklicher Aktivierung darf die Anwendung kleine Vorschaubilder, Bildmetadaten, berechnete Merkmale, Gruppen und Entscheidungen in der lokalen Browserdatenbank IndexedDB ablegen. Die Vorschaubilder sind begrenzt; Originaldateien werden nicht in den Cache kopiert.

Ohne aktivierten Cache gehen Analysezustand und Vorschaubilder beim Neuladen beziehungsweise Schließen des Tabs verloren. Kleine Bedien- und Empfindlichkeitseinstellungen können unabhängig davon lokal im Browser gespeichert werden. Lokale Daten lassen sich in der Anwendung löschen; alternativ kann die zuständige Stelle in Edge oder Chrome die Websitedaten für die Pages-Domain entfernen.

Ein lokaler Cache ist keine zusätzliche Verschlüsselung. Bei gemeinsam genutzten Windows-Profilen, besonders sensiblen Aufnahmen oder restriktiven Firmenvorgaben sollte er ausgeschaltet bleiben.

### Was „lokal“ nicht automatisch genehmigt

Lokale Verarbeitung ersetzt keine Freigabe durch Arbeitgeber, Auftraggeber, Datenschutz- oder IT-Sicherheitsstelle. Auch das Öffnen einer öffentlich gehosteten Webanwendung, Browser-Downloads, IndexedDB, Web Worker oder WebAssembly können Firmenrichtlinien unterliegen. Laden Sie eine Foto-ZIP niemals in das GitHub-Repository, einen Issue-Anhang oder einen Actions-Artefakt-Upload hoch.

## Unterstützte Browser und Systemfunktionen

Primär getestet und vorgesehen sind:

- Microsoft Edge, aktuelle stabile Version unter Windows
- Google Chrome, aktuelle stabile Version unter Windows

Firefox oder Safari können funktionieren, sind für den betrieblichen Pilotbetrieb aber nicht qualifiziert. JavaScript muss aktiviert sein. Die Grundanalyse benötigt Web Worker, Browser-Bilddekodierung und ausreichend Arbeitsspeicher. IndexedDB wird nur für den optionalen Cache gebraucht. Der HEIC/HEIF-Decoder wird als lokales WebAssembly-/Emscripten-Decodermodul erst bei Bedarf lazy geladen; beim Start und bei Archiven ohne HEIC/HEIF entsteht dafür keine Decoderarbeit. OffscreenCanvas, WebGL und WebGPU sind weitere Beschleunigungs- beziehungsweise Erweiterungsmerkmale; fehlendes WebGPU verhindert die klassische Analyse nicht.

Die Startseite führt eine Systemprüfung aus und zeigt verständliche Fallback-Hinweise. Firmenfilter können GitHub Pages, Worker, IndexedDB, Downloads oder einzelne Browser-APIs blockieren.

## Schnellstart für Anwender

1. Öffnen Sie die freigegebene GitHub-Pages-Adresse in Edge oder Chrome.
2. Lesen Sie Datenschutz- und Systemhinweise.
3. Wählen Sie über „ZIP-Datei auswählen“ eine lokale ZIP-Datei aus. Die Auswahl allein lädt nichts hoch.
4. Prüfen Sie die ZIP-Zusammenfassung und wählen Sie „Streng“, „Ausgeglichen“ oder „Sensitiv“.
5. Aktivieren Sie den lokalen Cache nur, wenn die betriebliche Freigabe das erlaubt.
6. Starten Sie die Analyse und lassen Sie den Tab geöffnet. Andere Arbeiten im Browser sind möglich; das Schließen oder harte Neuladen beendet jedoch eine nicht gespeicherte Analyse.
7. Prüfen Sie Gruppen und Vergleichswerte manuell.
8. Exportieren Sie einen CSV- oder JSON-Bericht. Es werden keine Originalbilder in den Bericht kopiert.

Die Laufzeit hängt stark von Bildanzahl, Auflösung, Kompression, Prozessor, verfügbarem RAM, Browser und Energiesparmodus ab. 3.000 Bilder sind eine Auslegungsgrenze, keine Laufzeitgarantie für jeden Arbeitslaptop.

## Analyseverfahren

Die Pipeline vermeidet teure Vollbildvergleiche aller Paare. Bei 3.000 Bildern gäbe es ungefähr 4,5 Millionen Paare; kleine Hashwerte lassen sich günstig vergleichen, genaue Strukturprüfungen werden dagegen auf plausible Kandidaten begrenzt.

1. **ZIP-Prüfung:** Anzahl, Pfade, Dateigrößen, Kompressionsverhältnisse und Formate werden validiert. Ordner, Systemdateien und nicht unterstützte Einträge werden übersprungen.
2. **Dekodierung:** JPEG, PNG, WebP, AVIF, GIF und BMP nutzen nach Möglichkeit die lokale Browserdekodierung. HEIC/HEIF lädt seinen lokal gebündelten Decoder erst beim ersten entsprechenden Bild nach; TIFF wird lokal über `utif2` dekodiert. Bei Animationen, HEIC-Sequenzen und mehrseitigen TIFF-Dateien wird nur das erste Bild beziehungsweise der erste Frame analysiert.
3. **Lokaler Aufnahmekontext:** Soweit vorhanden, werden EXIF-GPS, Aufnahmezeit, Kamerahersteller, Kameramodell, Objektiv, Software und Orientierung ausgelesen. GPS-Abstände werden lokal berechnet; es gibt keine Karten- oder Geocoding-Anfrage.
4. **Verkleinerung:** Es entstehen kleine Analysebilder, Graustufendaten und Vorschaubilder. Vollständige Originale werden nicht gesammelt im DOM gehalten.
5. **Visuelle Fingerabdrücke:** aHash erfasst grobe Helligkeitsflächen, dHash Kantenänderungen und pHash niederfrequente DCT-Strukturen. Eine Hamming-Distanz vergleicht die 64-Bit-Fingerabdrücke.
6. **Kandidatenauswahl:** Hashabstände, Seitenverhältnis, Auflösung, Helligkeit und Farbinformationen begrenzen die Zahl genauer zu prüfender Paare.
7. **Genauer Vergleich:** Für Kandidaten werden normalisierte Histogramm- und SSIM-ähnliche Strukturwerte kombiniert. Das geschieht nur auf kleinen Analysebildern.
8. **Bewertung:** Ein transparentes Regelwerk erzeugt Kategorie, Konfidenz, technischen Ähnlichkeitswert und Begründungen. Metadaten werden daneben als stützender, neutraler, abweichender oder nicht verfügbarer Kontext ausgewiesen. Sie verändern die visuelle Bewertung nicht und können niemals allein einen Kandidaten oder eine Duplikatgruppe erzeugen. Der Prozentwert ist keine objektive Identitätswahrscheinlichkeit.
9. **Gruppierung:** Starke visuelle Verbindungen bilden Kerngruppen. Schwache Ketten werden nicht ungeprüft als sichere Gesamtgruppe behandelt.
10. **Manuelle Prüfung und Export:** Die endgültige fachliche Entscheidung bleibt beim Nutzer.

Der Modus „Sensitiv“ erweitert den Kandidatenraum, kann aber keine robuste lokale Merkmals- und Homographieanalyse wie ORB/RANSAC vollständig ersetzen. Leichte Zuschnitte und Drehungen sind daher Best-Effort-Fälle und müssen besonders sorgfältig kontrolliert werden.

## Technische Architektur

```text
Statische Vite-Seite von GitHub Pages
└─ React-Oberfläche und Zustandssteuerung
   ├─ ZIP-Prüfung und speicherschonendes Lesen (@zip.js/zip.js)
   ├─ Browser-Bilddekodierung sowie lazy HEIC- und lokaler TIFF-Decoder
   ├─ lokale EXIF-/GPS-/Zeit-/Kamera-Kontextprüfung (exifr)
   ├─ kleine Analyse- und Vorschaubilder; bei Sequenzen nur erster Frame
   ├─ Worker-Pool für Bildmerkmale und Hash-Kandidaten
   ├─ Ähnlichkeitsbewertung und geschützte Graph-Gruppierung
   ├─ manuelle Prüfung und lokale Blob-Exporte
   └─ optionaler IndexedDB-Cache (idb, standardmäßig aus)
```

Zwischen Worker und Hauptthread werden strukturierte Nachrichten ausgetauscht. Der Pool verwendet standardmäßig höchstens vier Worker und lässt mindestens einen logischen Kern für das System frei. Bei fehlendem OffscreenCanvas ist ein kompatibler Hauptthreadpfad mit regelmäßigen Unterbrechungen vorgesehen. Ergebnislisten und Vorschaubilder werden nur abschnittsweise beziehungsweise bedarfsgerecht gerendert.

Die Anwendung ist eine Single-Page-Ausgabe ohne komplexes Client-Routing. Vite erzeugt relative Asset-URLs, damit ein Build sowohl unter einer Root-Domain als auch unter `https://BENUTZERNAME.github.io/REPOSITORY-NAME/` funktioniert.

## Sicherheits- und Mengenlimits

Alle zentralen Werte stehen in `src/core/config/limits.ts`:

| Grenze | Standard | Zweck |
| --- | ---: | --- |
| unterstützte Bilder | 3.000 | verhindert unbegrenzte Verarbeitung |
| ZIP-Einträge insgesamt | 10.000 | begrenzt Archive mit sehr vielen Kleindateien |
| einzelnes Bild, unkomprimiert | 75 MiB | begrenzt extreme Einzeldateien |
| Summe unkomprimierter Daten | 20 GiB | frühe Warnung vor sehr großen Archiven |
| maximales Kompressionsverhältnis | 100:1 | Schutz gegen auffällige ZIP-Bomben |
| Analysebild | 64 × 64 Pixel | speichersparende Struktur- und Hashanalyse |
| Hash-Eingabe | bis 32 × 32 Pixel | kleine, vergleichbare DCT-/Hashdaten |
| längste Vorschaukante | 360 Pixel | begrenzt DOM- und IndexedDB-Speicher |
| ZIP-Fingerprint-Bereich | 64 KiB am Anfang/Ende | Wiedererkennung ohne Vollhash |
| Worker | 1 bis 4 | vermeidet Überlastung schwacher Laptops |

Diese Werte sind auf normale Baustellenfotos ausgerichtete Schutzgrenzen, keine Zusage, dass jedes Archiv knapp unterhalb der Grenzen verarbeitet werden kann. Ein 20-GiB-Archiv wird nicht komplett in den Arbeitsspeicher geladen; Dekodierung großer Einzelbilder kann trotzdem kurzzeitig viel RAM benötigen. Browser, Betriebssystem oder Firmenrichtlinien können niedrigere praktische Grenzen setzen.

Zusätzliche Prüfungen behandeln unsichere `../`-Pfade, doppelte Pfade, verschachtelte ZIP-Dateien, verschlüsselte oder beschädigte Einträge, widersprüchliche Dateiendungen und Bildsignaturen sowie macOS- und versteckte Systemdateien. Das gilt auch für die neu unterstützten HEIC/HEIF-, AVIF-, GIF-, BMP- und TIFF-Signaturen. Fehler einzelner Bilder oder Metadaten sollen die übrige Analyse nicht abbrechen.

## Empfindlichkeit und Pilotkalibrierung

Die drei Modi sind bewusst keine universellen Wahrheitsstufen:

| Modus | Ziel | Typischer Einsatz | Erwartbarer Nachteil |
| --- | --- | --- | --- |
| Streng | sehr wenige Fehlalarme | Neu-Kompression, andere Auflösung, kleine Farbänderung | übersieht eher Zuschnitte und Perspektivänderungen |
| Ausgeglichen | alltagstauglicher Mittelweg | erster Pilotlauf und normale Serien | einzelne ähnliche Motive müssen manuell aussortiert werden |
| Sensitiv | mehr potenzielle Treffer | Zuschnitte, leichte Drehung, ähnliche Ausschnitte | mehr Fehlalarme und längere Prüfung |

Vor einer breiten Nutzung sollte jede Firma mit repräsentativen eigenen Bildern kalibrieren:

1. Stellen Sie einen freigegebenen Pilotbestand zusammen, idealerweise 500 bis 1.000 Bilder aus mehreren typischen Baustellen, Teams und Kameras.
2. Markieren Sie vorab bekannte Paare: echte Duplikate, bearbeitete Varianten, schwierige Grenzfälle und eindeutig verschiedene, aber ähnlich aussehende Motive.
3. Starten Sie mit „Ausgeglichen“. Prüfen Sie **alle** bekannten Duplikate auf Wiederfindung und eine ausreichend große Stichprobe der übrigen Treffer auf Fehlalarme.
4. Dokumentieren Sie getrennt falsch positive Treffer und übersehene Duplikate. Dateinamen allein zählen nicht als Nachweis.
5. Wechseln Sie nur bei einer klaren fachlichen Begründung zu „Streng“ oder „Sensitiv“ beziehungsweise passen Sie erweiterte Grenzwerte an.
6. Definieren Sie intern akzeptable Prüfschritte und Freigabekriterien. Weil nichts automatisch gelöscht wird, sollte die menschliche Zweitprüfung Teil des Verfahrens bleiben.
7. Halten Sie Anwendungsversion, Browser, Modus, geänderte Grenzwerte und Pilotdatum im Abnahmeprotokoll fest.
8. Wiederholen Sie die Stichprobe nach größeren Versions-, Browser- oder Schwellenwertänderungen.

Eine gute Pilotbewertung misst nicht nur, wie viele Gruppen entstehen. Entscheidend sind die Kosten eines übersehenen Duplikats, die Folgen einer fälschlichen Markierung und der manuelle Prüfaufwand im konkreten Prozess.

## Checkliste für Firmenfreigabe

- Sind GitHub Pages und die konkrete Domain laut IT-Richtlinie zulässig?
- Darf die Anwendung inhaltlich mit den betroffenen Baustellenfotos arbeiten?
- Enthalten Aufnahmen Personen, Kennzeichen, GPS-/EXIF-Daten oder vertrauliche Bauinformationen?
- Sind JavaScript, Web Worker, IndexedDB und lokale Downloads erlaubt?
- Soll der opt-in Cache ausgeschaltet bleiben oder darf er im Windows-Browserprofil gespeichert werden?
- Ist klar, wer Treffer fachlich bestätigt und wer anschließend Dateien außerhalb der Anwendung bearbeitet?
- Gibt es eine unveränderte Sicherung sowie ein Vier-Augen-Prinzip für Löschentscheidungen?
- Wurde der Pilot auf den vorgesehenen Laptopmodellen, Browserrichtlinien und realistischen ZIP-Größen durchgeführt?
- Ist dokumentiert, dass die Pages-Seite statisch ist und Foto-ZIPs nie in GitHub abgelegt werden?

Für besonders sensible Daten kann die gleiche `dist/`-Ausgabe auf einem firmenintern freigegebenen statischen Webserver betrieben werden. Auch dort bleibt die Bildanalyse clientseitig.

## Lokale Entwicklung

Für Anwender der veröffentlichten Seite ist keine Installation nötig. Nur Entwickler benötigen Node.js `^20.19.0` oder `>=22.12.0`; Node.js 24 und pnpm 11 sind für reproduzierbare Builds empfohlen.

### Mit pnpm (empfohlen)

```bash
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Vite zeigt anschließend die lokale Adresse an, normalerweise `http://localhost:5173/`.

### Mit npm

```bash
npm install
npm run dev
```

`pnpm-lock.yaml` ist die maßgebliche Lockdatei für CI und Releases. Ein lokales `npm install` kann zusätzlich eine `package-lock.json` anlegen; diese sollte nicht versehentlich zusammen mit dem pnpm-Lockfile als zweite Releasequelle eingeführt werden.

## Build, Vorschau und Qualitätsprüfungen

| Aufgabe | pnpm | npm |
| --- | --- | --- |
| Entwicklungsserver | `pnpm dev` | `npm run dev` |
| TypeScript + Produktions-Build | `pnpm build` | `npm run build` |
| Produktions-Build ansehen | `pnpm preview` | `npm run preview` |
| Linter | `pnpm lint` | `npm run lint` |
| Unit-Tests einmalig | `pnpm test` | `npm test` |
| Unit-Tests beobachten | `pnpm test:watch` | `npm run test:watch` |
| Test-ZIP erzeugen | `pnpm generate:test-zip` | `npm run generate:test-zip` |
| E2E-Smoke-Test | `pnpm test:e2e` | `npm run test:e2e` |

Der Produktions-Build liegt in `dist/` und benötigt zur Laufzeit nur einen statischen Webserver. `file://` ist kein unterstützter Produktionsmodus, da Browser Worker und Module dort einschränken können.

Vor dem ersten E2E-Lauf muss der lokale Chromium-Testbrowser einmal installiert werden:

```bash
pnpm exec playwright install chromium
# oder
npx playwright install chromium
```

Der Smoke-Test öffnet die Startseite, prüft den Datenschutzhinweis, wählt die künstliche ZIP, startet die Analyse, erwartet eine Duplikatgruppe und verifiziert einen echten CSV-Download.

## Künstliche Testdaten

`scripts/generate-test-zip.mjs` erzeugt ohne externe Bilder die Datei `e2e/fixtures/baustellenfotos-test.zip`. Sie enthält:

- zwei byte-identische PNG-Dateien mit verschiedenen Namen,
- dasselbe synthetische Baustellenmotiv in anderer Auflösung,
- eine hellere Variante,
- eine farbquantisierte Variante mit JPEG-artigen Block- und Kompressionsartefakten,
- einen leichten Zuschnitt,
- eine um drei Grad gedrehte Variante,
- zwei deutlich verschiedene Motive,
- eine nicht unterstützte Textdatei und
- einen absichtlich beschädigten `.jpg`-Eintrag.

Ein abweichender Zielpfad ist möglich:

```bash
pnpm generate:test-zip -- --output work/mein-test.zip
```

Die Fixtures enthalten keine echten Personen, Orte, Firmen- oder Projektdaten.

## GitHub-Pages-Deployment

Der Workflow `.github/workflows/deploy.yml` prüft bei jedem Push auf `main` den Linter und die Unit-Tests, baut mit dem eingefrorenen pnpm-Lockfile und veröffentlicht exakt den Inhalt von `dist/` über den offiziellen Pages-Artefaktweg.

Einmalige Repository-Einrichtung:

1. Repository nach GitHub pushen. Keine Foto-ZIPs oder realen Testdaten committen.
2. Unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** auswählen.
3. Prüfen, dass der Standardbranch `main` heißt. Bei einem anderen Releasebranch den Trigger in `deploy.yml` anpassen.
4. Unter **Actions** den Workflow „Auf GitHub Pages bereitstellen“ abwarten oder über „Run workflow“ manuell starten.
5. Die ausgegebene Pages-Adresse in einem nicht privilegierten Edge-/Chrome-Profil testen.

Erforderliche Workflow-Berechtigungen sind minimal gesetzt: Repository-Inhalte lesen, Pages schreiben und ein OIDC-Token für das Pages-Deployment ausstellen. Der Build selbst erhält keine Foto-ZIP. Die relative Vite-Basis unterstützt Projektpfade, daher ist keine feste Repository-URL im Quellcode nötig.

Für geschützte Branches sollten Lint, Unit-Tests und Build als Pflichtprüfungen eingerichtet werden. Der Playwright-Smoke-Test ist absichtlich nicht Teil des schlanken Pages-Deployments; er kann in einem separaten CI-Workflow nach `pnpm exec playwright install --with-deps chromium` ausgeführt werden.

## Konfiguration

Mengen- und Speichergrenzen werden zentral in `src/core/config/limits.ts` gepflegt. Standardwerte für „Streng“, „Ausgeglichen“ und „Sensitiv“ stehen dort ebenfalls. Änderungen sollten nicht isoliert nach Gefühl erfolgen:

1. Schwellenwert ändern.
2. Unit-Tests ergänzen oder anpassen.
3. künstliche Fixtures ausführen.
4. repräsentativen Firmen-Pilotbestand erneut bewerten.
5. Änderung und Anwendungsversion dokumentieren.

Niedrigere Hash-Distanzen und höhere SSIM-/Histogrammgrenzen machen die Erkennung im Allgemeinen strenger. Mehr Kandidaten pro Bild erhöhen Prüfaufwand und potenziell Laufzeit. Eine höhere Workerzahl ist auf schwachen oder thermisch begrenzten Laptops nicht automatisch schneller.

## Optionale lokale KI und erweiterte Merkmalsanalyse

In dieser Version ist **kein** ONNX-Modell und kein OpenCV-Paket gebündelt. Die Kernfunktion verwendet klassische, lokal implementierte Bildmerkmale und funktioniert ohne KI, WebGPU und externe Dienste. Es gibt keine versteckte Modelldatei, keinen Download bei Bedarf und keinen API-Fallback.

Eine spätere KI-Erweiterung wäre nur vertretbar, wenn ein echtes, klein genuges Modell mit nachvollziehbarer Quelle und permissiver Lizenz lokal als statisches Asset ausgeliefert wird. Sie müsste standardmäßig aus sein, ausdrücklich aktiviert werden und ausschließlich unsichere Kandidaten lokal nachprüfen. Ein externer Modell- oder Bild-Upload ist mit dem Datenschutzkonzept unvereinbar.

Ebenso wäre OpenCV/ORB nur als lokales, optional geladenes Asset zulässig. Ohne eine solche Erweiterung bleiben größere Drehungen, Perspektivänderungen und starke Zuschnitte bekannte Grenzen.

## Bekannte Einschränkungen

- Unterstützt werden JPEG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP und TIFF. Kamera-RAW, JPEG XL, SVG und andere Formate sind nicht Teil des zugesicherten Formatsatzes.
- Bei animierten GIF-/AVIF-Dateien, HEIC-Sequenzen und mehrseitigen TIFF-Dateien wird nur das erste Bild beziehungsweise der erste Frame verglichen.
- EXIF- und GPS-Daten können fehlen, ungenau, falsch oder durch Bearbeitung entfernt worden sein. Standort-, Zeit- und Kameradaten sind deshalb nur Kontext und kein alleiniger Duplikatnachweis.
- Verschlüsselte ZIP-Dateien und verschachtelte ZIP-Archive werden nicht analysiert.
- Beschädigte Bilder werden übersprungen und gemeldet; eine Reparatur findet nicht statt.
- Browserdekodierung und EXIF-Orientierungsunterstützung unterscheiden sich in Randfällen zwischen Browserständen.
- Große, einfarbige oder sehr kontrastarme Bilder liefern weniger charakteristische Hashes.
- Ähnliche Serienaufnahmen können hohe technische Werte erreichen, obwohl sie fachlich verschiedene Zeitpunkte zeigen.
- Größere Perspektivwechsel, Überdeckungen, Wasserzeichen, Collagen und starke Zuschnitte sind schwierig.
- Der Cache kann durch Browserrichtlinien, Privatmodus, Speicherbereinigung oder Quotenbegrenzung verloren gehen.
- Pause und Cache ersetzen keine dauerhaft laufende Hintergrundanwendung; der Tab muss geöffnet bleiben.
- Ein heruntergeladener Bericht enthält Pfade und Dateinamen und kann damit selbst vertraulich sein.

## Fehlerbehebung

### Die Seite bleibt leer oder Assets liefern 404

Prüfen Sie, ob GitHub Pages als „GitHub Actions“ konfiguriert ist und ob der Workflow erfolgreich war. Veröffentlichen Sie den gesamten `dist/`-Ordner, nicht das Quellverzeichnis. Bei eigener Hostingkonfiguration müssen relative Assetpfade unverändert ausgeliefert werden.

### „ZIP-Datei ungültig“ oder „Grenze überschritten“

Öffnen Sie das Archiv testweise mit dem betrieblich freigegebenen ZIP-Programm. Entfernen Sie verschachtelte Archive, verschlüsselte Einträge und nicht benötigte große Dateien. Teilen Sie den Bestand in mehrere ZIP-Dateien, statt Schutzgrenzen im Browser unkontrolliert anzuheben.

### Die Analyse ist langsam oder der Tab benötigt viel Speicher

Schließen Sie speicherintensive Tabs, verbinden Sie den Laptop mit Strom und vermeiden Sie Energiesparmodus. Verwenden Sie weniger Worker oder kleinere ZIP-Teile. Ein Neustart des Browsers kann belegten Speicher freigeben. Laden Sie die Seite während einer ungespeicherten Analyse nicht neu.

### Es werden keine Gruppen gefunden

Prüfen Sie zuerst, ob unterstützte Bilder erkannt und beschädigte Dateien gemeldet wurden. Testen Sie „Ausgeglichen“ und anschließend „Sensitiv“. Stark veränderte Perspektiven oder Zuschnitte können außerhalb der klassischen Erkennung liegen. Senken Sie Grenzwerte nicht ohne Pilotkontrolle.

### Zu viele ähnliche Baustellenmotive werden vorgeschlagen

Wechseln Sie zu „Streng“, prüfen Sie die technischen Details und markieren Sie fachlich verschiedene Aufnahmen als „kein Duplikat“. Das verbessert nicht automatisch den Algorithmus, hält aber die Entscheidung im lokalen Bericht fest.

### Cache oder Downloads funktionieren nicht

Firmenrichtlinien, Privatmodus oder Browser-Speicherregeln können IndexedDB beziehungsweise Downloads sperren. Lassen Sie die Domain durch die IT freigeben. Die Grundanalyse kann ohne Cache funktionieren; Berichte benötigen eine erlaubte lokale Downloadaktion.

### `pnpm` oder `node` wird bei der Entwicklung nicht gefunden

Installieren Sie eine unterstützte Node.js-Version und aktivieren Sie Corepack. Prüfen Sie `node --version` und `pnpm --version`. Diese Schritte betreffen nur Entwickler, nicht Nutzer der veröffentlichten Seite.

## Verwendete Bibliotheken und Lizenzen

Zur Laufzeit werden insbesondere React, React DOM, `@zip.js/zip.js`, `idb`, Lucide React, `exifr`, `utif2` und der lazy geladene HEIC/HEIF-Decoder `heic-to` lokal mit dem Build gebündelt. Entwicklung und Tests verwenden unter anderem Vite, TypeScript, Vitest, Testing Library, Playwright, JSZip und PNGJS. Es werden keine Bibliotheken zur Laufzeit von einem CDN nachgeladen.

Eine kompakte Lizenzübersicht steht in [LICENSES.md](./LICENSES.md). `heic-to@1.5.2` und der darin enthaltene HEIC/HEIF-Decoder stehen unter LGPL-3.0; `exifr` und `utif2` stehen unter MIT. Die jeweiligen Paket-Lizenzdateien in `node_modules` beziehungsweise die Upstream-Repositories sind maßgeblich. Gerade vor einem Firmeneinsatz müssen Lizenzpflichten und mögliche weitere rechtliche Anforderungen durch die zuständige Stelle geprüft werden. Für ein formales Freigabeverfahren sollte zusätzlich ein automatisierter Software-Bill-of-Materials- und Lizenzscan des konkreten Lockfiles erfolgen.

## Verantwortungsvolle Nutzung

Die Software unterstützt eine Sichtungsentscheidung; sie trifft keine rechtsverbindliche, datenschutzrechtliche oder beweissichere Aussage über Bildidentität. Nutzen Sie Exporte als Arbeitsbericht, nicht als alleinige Löschanweisung. Die Verantwortung für Aufbewahrungsfristen, Datenschutz, Beweissicherung und Änderungen an den Originaldateien bleibt bei der einsetzenden Organisation.
