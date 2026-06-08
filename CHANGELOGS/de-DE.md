# Änderungsverlauf

Diese Datei dokumentiert die wesentlichen Änderungen des Projekts. Das Format folgt Keep a Changelog; verwendet wird das `major.minor.patch`-Versionsschema.

## [2.1.0] - 2026-06-08

### Hinzugefügt

- **Nutzungs-Insights**: Fängt API-Anfragen über einen lokalen HTTPS-Proxy ab, um Token-Nutzung, Cache-Trefferraten, Reasoning-Latenz, Aufruftrends und Sitzungsanalysen automatisch zu erfassen. Alle Daten werden lokal gespeichert und niemals hochgeladen.
- **Konfigurationsversionskontrolle**: Erstellt bei jedem Speichern automatisch Snapshots, mit Filterung nach Dateityp, Diff-Ansicht und Ein-Klick-Rollback.
- **Kostenabschätzungssystem**: Preiskonfiguration pro Modell (Input/Output/Cache-Read/Cache-Creation), mit Echtzeit-Kostenschätzung auf der Insights-Übersichtsseite.
- **Mehrwährungs-Kostenanzeige**: Unterstützt CNY, USD, EUR, JPY, GBP mit benutzerdefinierten Wechselkursen; Insights-Seiten konvertieren und zeigen Kosten automatisch an.
- **Insights-Daten löschen mit Bestätigung**: Zeigt einen Bestätigungsdialog mit Auflistung der zu löschenden Daten (Ereignisdatensätze / Aggregatstatistiken / Log-Fortschritt), bevor alle Insights-Daten gelöscht werden.

### Geändert

- Vollständige Internationalisierung der Insights-Funktion (zh-CN / zh-TW / en-US / ja-JP / de-DE / es-ES), einschließlich Trenddiagramme, Aufschlüsselungsstatistiken, Sitzungsanalysen, Einstellungsseite, Toast-Benachrichtigungen, Erststart-Assistent und Daten-Löschen-Dialog.
- Währungsauswahl verwendet jetzt Flaggensymbole mit kompakten Labels für ein klareres Layout.

### Behoben

- Absturz des Insights-Trenddiagramms durch fehlende `maxVal`-Definition behoben.
- Abgeschnittene Sidebar-Hintergrundfarbe in bestimmten Themes behoben.
- Redundantes `ConfigHistoryState`-Struct und doppelte i18n-Schlüssel entfernt.

## [2.0.1] - 2026-06-06

### Hinzugefügt

- **Profilzentrierte Ansicht**: Der Profiles-Tab wurde zu einer profilzentrierten Ansicht umgestaltet. Jedes Profil zeigt auf einen Blick den gebundenen Anbieter und das Modell; Profile können direkt aus der Liste aktiviert werden.
- **Assistent-Erstellungs-Assistent**: Ein 3-schrittiger Assistent (Anbieter wählen → Verbindung testen → Benennen) erstellt eine vollständige, sofort nutzbare Konfiguration in einem Durchgang, ohne Provider / Model / Profile separat einrichten zu müssen.
- **Kaskaden-Lösch-Hinweis**: Vor dem Löschen eines Providers oder Modells analysiert die App automatisch die Auswirkungen und zeigt in einem Dialog alle betroffenen Modelle und Profile an, mit der Möglichkeit zur Herabstufung oder Bestätigung.
- **Anbieter-Status-Banner**: Ein Echtzeit-Banner erscheint oben auf der Konfigurationsseite, wenn ein nicht erreichbarer Anbieter erkannt wird.

### Geändert

- Integrierte Anbieternamen und -beschreibungen des Assistenten vollständig internationalisiert (zh-CN / zh-TW / en-US / ja-JP / de-DE / es-ES).
- Dropdown-Styling für die Modellauswahl verbessert; Profil-Tab-Schaltflächen verschmälert für ein kompakteres Layout.

### Behoben

- Fehlerhaften Auswahlzustand nach einem Kaskaden-Löschen behoben (React 18 StrictMode ruft Immer-Producer doppelt auf, sodass `setState`-Aufrufe im Callback zweimal ausgeführt wurden).
- Absturz beim Öffnen der Kaskaden-Lösch-Vorschau im leeren Zustand behoben (`getCascadePreview` fehlte eine Null-Prüfung).
- Im letzten Schritt des Assistenten konnte ein bereits vorhandener Profilname erneut verwendet werden; jetzt wird ein Duplikat in Echtzeit erkannt und der Senden-Button deaktiviert.

## [2.0.0] - 2026-06-01

### Hinzugefügt

- Das Rechtsklick-Menü im System-Tray kann Sprache, Thema und Profil nun in Echtzeit umschalten; die Oberfläche aktualisiert sich sofort, ohne Neustart.
- Das Ein- und Ausklappen der Seitenleiste ist jetzt sanft animiert.

### Geändert

- **Architektur-Neufassung: Migration von Electron zu Tauri v2 (Rust + System-WebView).** Setzt auf eine Architektur aus „schlanker Rust-Hülle + Geschäftslogik im Frontend"; die rund 5.300 Zeilen Logik in `src/shared/` werden nahezu unverändert wiederverwendet, während Datei-I/O, Befehlsausführung, HTTP-Anfragen, SQLite und das System-Tray nun über Rust-Befehle bereitgestellt werden.
- Deutlich kleinere Installationspakete: Die mitgelieferte Chromium-Laufzeit entfällt zugunsten der System-WebView, wodurch das macOS-DMG und das Windows-NSIS-Paket erheblich schrumpfen.
- Die Titelleiste nutzt jetzt den nativen macOS-Overlay-Stil; die Ampelknöpfe werden vom System vertikal zentriert gezeichnet.
- Projektbenennung vereinheitlicht: Vite-Konfiguration `vite.config.ts`, Build-Ausgabe `dist/` und Release-Workflow `release.yml` (Trigger-Tag von `tauri-v*` auf `v*` geändert).

### Behoben

- Der WebDAV-Verbindungstest zeigt nun lesbare Meldungen bei Authentifizierungsfehlern (401/403) und Ratenbegrenzung (429).
- Behoben, dass sich die Oberfläche nach dem Umschalten von Sprache/Thema über das System-Tray nicht in Echtzeit aktualisierte.

## [1.1.9] - 2026-05-25

### Hinzugefügt

- Die About-Seite zeigt jetzt einen Abschnitt „Versionshinweise", der den Eintrag der aktuellen Version aus `CHANGELOGS/{locale}.md` passend zur UI-Sprache rendert; rechts in der Überschrift führt „Alle Versionen anzeigen" direkt zu GitHub Releases.
- Der Update-Dialog lädt und rendert jetzt die Versionshinweise der neuen Version (aus dem GitHub-Release-Body), sodass vor dem Upgrade klar ist, was kommt.

### Geändert

- CHANGELOG wird pro Sprache in `CHANGELOGS/{zh-CN,zh-TW,en-US,ja-JP,de-DE,es-ES}.md` aufgeteilt; das `CHANGELOG.md` im Stamm ist jetzt ein Index, und der GitHub-Release-Body wird von CI zweisprachig (zh-CN + en-US) zusammengesetzt.
- Strategie für das In-App-Laden des Changelogs: Beim ersten Start nach Installation/Update werden alle 6 Sprachdateien einmalig von `raw.githubusercontent.com` geladen und unter `~/.kimi/.panel/changelog-cache/` zwischengespeichert; bei Fehlern wird auf die mitgelieferten Dateien zurückgegriffen. Der Cache wird über die aktuelle `app.getVersion()` markiert.
- Der Hauptprozess der Update-Prüfung führt `~/.kimi/.panel/release-cache.json` mit `If-None-Match`-ETag + Fallback auf veraltete Body-Daten ein, um das nicht authentifizierte GitHub-API-Rate-Limit (60 req/h) abzufedern.
- Hardcodierter Block „Versionsverlauf" und seine neun i18n-Strings auf der About-Seite entfernt; die vollständige Historie ist jetzt über den Button „Alle Versionen anzeigen" auf GitHub erreichbar.

### Behoben

- Behoben, dass im „Neuerungen"-Block des Update-Dialogs `MarkdownView` die Versionsnummer doppelt anzeigte: Der innere Panel-Header ist jetzt ausgeblendet, nur der äußere Titel bleibt.

## [1.1.8] - 2026-05-25

### Hinzugefügt

- Fünf neue Farbverlauf-Designs: Forest, Sakura, Mint, Cosmos und Amber, jeweils mit abgestimmter Hell-/Dunkelvariante.
- Die Skill-Detailseite rendert SKILL.md standardmäßig als Markdown; neue Symbole `</>` / `Eye` neben dem Kopieren-Button schalten zwischen gerenderter Ansicht und nummerierter Quellansicht um.
- Bei deaktivierter Nutzungs-Insights zeigt das leere Dashboard jetzt einen Button „In den Einstellungen aktivieren", der direkt zu Einstellungen → Nutzungs-Insights springt.

### Geändert

- Das Datenverzeichnis von Nutzungs-Insights wurde nach `~/.kimi/.panel/usage/` verschoben. Beim Start wird das alte `~/.kimi/usage/` automatisch migriert; vorhandene Daten am neuen Ort werden nie überschrieben.
- Aufräumen vor dem Release: Die ungenutzte Abhängigkeit `mockttp` und der zugehörige tote Code wurden entfernt, 159 transitive Pakete eingespart; der Installer schrumpft schätzungsweise um 30–50 MB.
- Paketierung präzisiert: `asarUnpack` deklariert das native Modul `better-sqlite3` explizit, und `postinstall: electron-builder install-app-deps` sorgt dafür, dass CI und neue Checkouts sofort funktionieren.

### Behoben

- Behoben, dass neue Designs lautlos auf den Standardwert zurückfielen: `parseAppearanceTheme` und die Preload-Initialisierungs-Whitelist enthielten die neuen Theme-Keys nicht, sodass die Auswahl normalisiert oder beim Kaltstart kurz auf aurora zurückgesetzt wurde.

## [1.1.7] - 2026-05-16

### Behoben

- Wiederherstellung von `scripts/render_homebrew_cask.py`, das die Release-Pipeline benötigt – behebt die Tap-Aktualisierung, die das Cask nicht mehr rendern konnte.

## [1.1.6] - 2026-05-16

### Hinzugefügt

- Hinzugefügt: Kimi-CLI-Update-Prüfung und Upgrade-Einstieg, Provider-Vorlagenauswahl, Favoriten, eigene Vorlagen, globale Suche, Schnellwechsel, Konfigurations-Import/Export, Profilvergleich und Änderungsverlauf.

### Geändert

- Main-Prozess-IPC und Renderer-Stilmodule aufgeteilt; Erkennung externer Konfigurationsänderungen und Konfliktbehandlung vor dem Speichern verbessert.

### Behoben

- Behoben, dass eine maschinenübergreifende Sicherungswiederherstellung nur das Standardprofil übrig ließ, weil der Profilpfad nicht migriert wurde.
- Behoben, dass das Tray-Symbol-Toggle in der oberen Statusleiste nur die Einstellung speichert, das Tray-Symbol aber nicht sofort erstellt oder entfernt.
- Behoben: Chromium-CoreVideo-Display-Link-Log-Rauschen auf macOS, die Globalsuche in Konfigurationslisten und CI-Fehlschläge durch fehlende Testabhängigkeiten in der ErrorBoundary-Suite.

## [1.1.5] - 2026-05-10

### Behoben

- iTerm2-Startfehler in Homebrew-Builds behoben, die durch `System Events`-Tastatureingaben verursacht wurden; jetzt werden native iTerm2-AppleScript-Schreibvorgänge verwendet.

## [1.1.4] - 2026-05-10

### Hinzugefügt

- Der ausgeklappte/eingeklappte Zustand der Seitenleiste wird in den Paneleinstellungen gespeichert; das Panel stellt den letzten Zustand beim nächsten Start wieder her.

## [1.1.3] - 2026-05-09

### Behoben

- Preload-Absturz in paketierten Builds behoben, bei dem `documentElement` während der initialen Theme-Einrichtung null sein konnte.
- Den daraus folgenden Startfehler `Electron preload API is unavailable` behoben.

## [1.1.2] - 2026-05-09

### Hinzugefügt

- Im aktiven Profilbereich oben in Profiles wurde ein „Kimi im Terminal öffnen"-Eintrag ergänzt, der die CLI mit dem aktuell aktiven Profil startet.
- In jeder Profilzeile gibt es jetzt einen Hover-Terminal-Eintrag, der eine temporäre Konfiguration für dieses Profil erzeugt und Kimi startet, ohne das aktive Profil zu ändern.
- Auf der Einstellungsseite ist die Terminal-Anwendung (System-Terminal oder iTerm2) jetzt konfigurierbar.
- README um mehrseitige Screenshots und ausführlichere Funktionsbeschreibungen ergänzt.

### Geändert

- Terminal-Starts verwenden jetzt einheitlich `kimi --config-file <pfad>`; pro Profil werden temporäre Konfigurationen unter `~/.kimi/.panel/tmp/terminal/` geschrieben.
- Terminal.app und iTerm2 öffnen jetzt in einem neuen Tab und nutzen Einfügen + Enter für stabilere Befehlsausführung.

## [1.1.1] - 2026-05-07

### Hinzugefügt

- Die Einstellungsseite unterstützt jetzt Shortcut-Verwaltung: Aufnahme, Aktivieren/Deaktivieren, Zurücksetzen und Konfliktwarnungen für globale und Fenster-Shortcuts.
- Sicherungs-Snapshots enthalten jetzt `shortcuts.json`; Shortcut-Einstellungen werden bei der Wiederherstellung mit übernommen.
- README um Abschnitte zu Shortcuts, Skills, Update-Prüfung und Sicherungswiederherstellung ergänzt.

### Geändert

- Renderer-`App.tsx` weiter aufgeteilt: Statusableitung, Konfigurationspersistenz, Shortcut-Bindung, Sicherungsaktionen, Vorschau-Aktualisierung, Abfangen ungespeicherter Änderungen und Tab-Panels jeweils in eigene Module.
- Module des Main-Prozesses aufgeteilt: Dateizugriff, CLI-Umgebung, WebDAV, Shortcuts und Update-Prüfung – die Entry-Datei wird übersichtlicher.
- Status des Update-Dialogs und der GitHub-Release-Fallback-Flow verfeinert.

### Behoben

- Texte und Versionsanzeige des Update-Dialogs in bestimmten Zuständen korrigiert.
- Mögliche Regressionen bei Seitennavigation, Konfigurationsladen und Leerzustand-Rändern, die durch die Modulteilung entstanden waren, behoben.

## [1.1.0] - 2026-04-26

### Hinzugefügt

- Die About-Seite hat jetzt eine GitHub-Release-Update-Prüfung mit Hinweisen je nach Installationsquelle (Homebrew, manuell, Entwicklungsbuild).
- Sobald eine neue Version erkannt wird, zeigt die Versionsnummer auf der About-Seite eine Update-Markierung, bis der Nutzer das Upgrade abgeschlossen hat.
- Der Update-Dialog erlaubt jetzt das Kopieren des Homebrew-Upgrade-Befehls, das Springen zum GitHub Release und gibt GitHub-Rate-Limit-Hinweise.

### Geändert

- Große Renderer-Dateien aufgeteilt: About-Seite, Dialoge, Codeanzeige, Übersichtspanel, Skills-Arbeitsbereich, obere Schnellbedienungen, gemeinsames Layout und Formular-Widgets liegen jetzt jeweils in eigenen Modulen.
- Sicherheitsrichtlinie für externe Links verschärft: explizite Whitelist für `https:` / `mailto:`.

### Behoben

- Renderfehler einzelner Seiten durch fehlende Icon-Importe nach der Aufteilung behoben.
- Typgrenzen-Probleme rund um `AppState | null` in den Abläufen Speichern, Vorschau-Aktualisierung, Skills-Aktualisierung und Abfangen ungespeicherter Änderungen behoben.
- Behoben, dass die allgemeine Einstellungsgruppe konditional gerenderte `null`-Kinder nicht akzeptiert.

## [1.0.4] - 2026-04-24

### Hinzugefügt

- Das Tray-Menü bietet jetzt Schnellwechsel für Sprache und Design: Chinesisch / Englisch und Auto / Hell / Dunkel direkt aus dem Tray.
- Das Sicherungsmodul unterstützt jetzt die Wiederherstellung aus einem lokalen Verzeichnis oder einer WebDAV-Gegenstelle.

### Geändert

- Skills-Arbeitsbereich überarbeitet: Paginierung, Layout der Detail-Dialog-Zusammenfassung und Skill-Kartengröße angepasst – fokussierteres Browsen und Lesen.
- Skills-Frontmatter-Parsing verbessert: bessere Kompatibilität mit mehrzeiligen Beschreibungen und Blockskalaren.

## [1.0.3] - 2026-04-23

### Geändert

- Skills-Seite als fokussierter Zwei-Spalten-Arbeitsbereich neu gestaltet: Grid-/Listenwechsel, Detail-Dialog für Skills und adaptive Höhe der rechten Spalte.
- Einstellungsseite um eine UI-Schriftgröße-Option erweitert; Lesen, Normalisieren und Persistieren der neuen Schriftgrößeneinstellung sind durchgängig implementiert.
- Skills-Scan-Quellen vereinfacht: Zusatzverzeichnis- und Projektverzeichnis-Custom-Einträge entfernt – einheitliche Auto-Discovery.

### Behoben

- Laufzeitabstürze auf mehreren Seiten behoben, die durch fehlende Icon-Importe in der Dropdown-Komponente verursacht wurden.
- Behoben, dass der Hauptinhaltsbereich der Skills-Seite den verfügbaren Viewport nicht voll ausfüllte.

## [1.0.2] - 2026-04-22

### Hinzugefügt

- Auf der Einstellungsseite können Sicherungseinträge jetzt aus lokalen Verzeichnissen und von WebDAV-Gegenstellen angezeigt werden.
- Die Sicherungsliste hat eine Löschaktion erhalten – ein einheitlicher Einstieg für den kommenden Wiederherstellungs-Flow.

### Behoben

- Behoben, dass MCP-Konfigurationen in `config.panel.toml` nach mehrfachem Aktivieren/Deaktivieren `extra.extra` rekursiv verschachteln und `enabled` an die falsche Stelle schreiben.
- Behoben, dass beim Schreiben der Panelkonfiguration MCP-Untertabellen-Header in der Einrückung abdrifteten – `headers` und Co. blieben jetzt in ihrer Sektion.
- Behoben, dass der MCP-Import-Dialog beim Drücken von `Esc` den vorgegebenen Beispielinhalt fälschlich als geändert behandelte.

### Dokumentation

- README-Projektvorstellung neu geschrieben: `mcp.json`, Sicherungen, Statusleisten-Schnellaktionen und Konfigurationsansicht jetzt erklärt.

## [1.0.1] - 2026-04-21

### Geändert

- Stile für Einstellungsgruppen, obere Statistik-Karten, Übersichtsliste und benutzerdefinierte Dropdowns überarbeitet.
- MCP-Verwaltung verbessert: JSON-Import, persistentes Aktivieren/Deaktivieren, Panelerhalt und Konfigurationsdatei-Filter.
- App-, Tray- und Frontend-Markenlogos durch neue transparente Hell-/Dunkelvarianten ersetzt; macOS-`icon.icns` neu gebaut.
- Homebrew-Cask-Render-Skript warnt jetzt vor Startproblemen durch macOS-Quarantäneattribute.

## [1.0.0] - 2026-04-20

### Behoben

- Fehler im GitHub-Actions-Release-Workflow behoben, bei dem `electron-builder` durch Tag-Builds einen impliziten Publish auslöste und die macOS-/Windows-Installer-Jobs scheitern ließ.
- GitHub-Release-Authentifizierung und Repository-Lookup im Release-Workflow angepasst, damit `gh release` nicht vom lokalen `.git`-Kontext abhängt.

### Hinzugefügt

- Erstes Electron-Desktop-Release zur Verwaltung von `kimi-code-cli`-Konfigurationen.
- Visuelle Bearbeitung und Verwaltung von Providern, Modellen und Profilen.
- Beim Aktivieren eines Profils werden die Standardwerte automatisch nach `config.toml` zurückgeschrieben.
- Vorschau für `config.toml`, `config.profiles.toml` und `config.panel.toml`.
- Diff-Ansicht für Konfigurationsänderungen vor dem Speichern.
- Zweisprachige Oberfläche (Chinesisch und Englisch).
- Statusleisten-/Tray-Integration mit direktem Profilwechsel.
- Strategien zum Öffnen des Fensters: gemerkter Bildschirm, aktuell aktiver Bildschirm oder zufälliger Bildschirm.
- About-Seite mit Links zu Repository, Issues und Autor.
- Electron-Builder-Installer-Builds für macOS und Windows.
- Über `v*`-Tags ausgelöste GitHub-Actions-Release-Pipeline.

### Tests

- Vitest-Abdeckung für die Logik des gemeinsamen Konfigurationsspeichers ergänzt.
