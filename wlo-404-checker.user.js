// ==UserScript==
// @name         WLO 404 Link Checker 2.0
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Überprüft Links auf edu-sharing Redaktion auf 404-Fehler und typische Fehlerseiten
// @author       Hannes Sander
// @match        https://redaktion.openeduhub.net/edu-sharing/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Styling für die Menüleiste und Markierungen
    GM_addStyle(`
        #wlo-404-toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 15px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        #wlo-404-toolbar h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }

        #wlo-404-toolbar button {
            background: white;
            color: #667eea;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        #wlo-404-toolbar button:hover {
            background: #f0f0f0;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }

        #wlo-404-toolbar button:disabled {
            background: #ccc;
            color: #666;
            cursor: not-allowed;
            transform: none;
        }

        #wlo-404-progress {
            flex-grow: 1;
            text-align: right;
            font-size: 14px;
        }

        .wlo-404-error {
            background-color: #ffebee !important;
            border-left: 4px solid #f44336 !important;
        }

        .wlo-404-error es-node-url a,
        .wlo-404-error a {
            color: #d32f2f !important;
            font-weight: 600 !important;
        }

        .wlo-404-checking {
            opacity: 0.6;
            background-color: #fff9c4 !important;
        }

        .wlo-404-ok {
            background-color: #e8f5e9 !important;
            border-left: 4px solid #4caf50 !important;
        }

        #wlo-404-stats {
            background: white;
            color: #333;
            padding: 4px 12px;
            border-radius: 15px;
            font-size: 13px;
            font-weight: 500;
        }

        .wlo-404-error-badge {
            background: #f44336;
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 12px;
            margin-left: 8px;
        }

        /* Spaltenbreiten-Anpassung */
        .wlo-column-resizable {
            position: relative;
        }

        .wlo-column-resizer {
            position: absolute;
            top: 0;
            right: 0;
            width: 5px;
            height: 100%;
            cursor: col-resize;
            background: rgba(102, 126, 234, 0.3);
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 10;
        }

        .wlo-column-resizer:hover,
        .wlo-column-resizer.resizing {
            opacity: 1;
            background: rgba(102, 126, 234, 0.6);
        }

        mat-header-cell.wlo-column-resizable:hover .wlo-column-resizer {
            opacity: 1;
        }

        /* Quick-Ablehnen-Button */
        .wlo-quick-reject {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: #f44336;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.2s;
            z-index: 5;
        }

        .wlo-quick-reject:hover {
            background: #d32f2f;
            transform: translateY(-50%) scale(1.05);
        }

        .wlo-quick-reject:disabled {
            background: #999;
            cursor: not-allowed;
            transform: translateY(-50%);
        }

        .wlo-quick-reject i {
            font-size: 16px;
        }

        .wlo-404-rejected {
            opacity: 0.5;
            text-decoration: line-through;
        }
    `);

    // Globale Variablen
    let allLinks = [];
    let checkedCount = 0;
    let errorCount = 0;
    let isChecking = false;

    // Toolbar erstellen
    function createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = 'wlo-404-toolbar';
        toolbar.innerHTML = `
            <h3>🔍 WLO Link Checker</h3>
            <button id="wlo-start-check">Links überprüfen</button>
            <button id="wlo-clear-marks">Markierungen löschen</button>
            <button id="wlo-toggle-resize">Spaltenbreite anpassen</button>
            <div id="wlo-404-stats"></div>
            <div id="wlo-404-progress"></div>
        `;
        document.body.insertBefore(toolbar, document.body.firstChild);

        // Event Listener
        document.getElementById('wlo-start-check').addEventListener('click', startCheck);
        document.getElementById('wlo-clear-marks').addEventListener('click', clearMarks);
        document.getElementById('wlo-toggle-resize').addEventListener('click', toggleColumnResize);

        // Body Padding hinzufügen, damit Toolbar nicht überlappt
        document.body.style.paddingTop = '60px';
    }

    // Alle Links aus der Tabelle extrahieren
    function extractLinks() {
        allLinks = [];
        const rows = document.querySelectorAll('mat-row, .mat-row, .mat-mdc-row');

        console.log(`[WLO-404] Gefundene Tabellenzeilen: ${rows.length}`);

        rows.forEach((row, index) => {
            // Suche nach Links in verschiedenen möglichen Strukturen
            const linkElements = row.querySelectorAll('a[href], es-node-url a[href]');

            linkElements.forEach(link => {
                const href = link.getAttribute('href');
                // Nur externe Links prüfen (http/https)
                if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                    // Titel extrahieren (Text des Links oder title-Attribut)
                    let title = link.textContent.trim();
                    if (!title) {
                        title = link.getAttribute('title') || '';
                    }

                    allLinks.push({
                        url: href,
                        title: title,
                        linkElement: link,
                        rowElement: row,
                        index: allLinks.length
                    });
                }
            });
        });

        console.log(`[WLO-404] Extrahierte Links: ${allLinks.length}`);
        return allLinks;
    }

    // Prüft, ob die Seite typische Fehler-Indikatoren enthält
    function detectErrorPage(responseText) {
        if (!responseText) return null;

        const text = responseText.toLowerCase();

        // Typische deutsche Fehlerseiten-Indikatoren
        const germanErrorIndicators = [
            'seite nicht gefunden',
            'seite existiert nicht',
            'diese seite existiert nicht',
            'seite wurde nicht gefunden',
            'fehler 404',
            '404 error',
            'nicht mehr verfügbar',
            'nicht verfügbar',
            'seite nicht mehr vorhanden',
            'diese seite ist nicht verfügbar',
            'seite wurde entfernt',
            'seite konnte nicht gefunden werden',
            'inhalt wurde gelöscht',
            'inhalt nicht gefunden',
            'die angeforderte seite',
            'ungültige seite',
            'seite ist nicht vorhanden',
        ];

        // Englische Fehlerseiten-Indikatoren
        const englishErrorIndicators = [
            'page not found',
            'page doesn\'t exist',
            '404 not found',
            'this page doesn\'t exist',
            'page no longer available',
            'page has been removed',
            'page could not be found',
            'content not found',
            'the page you requested',
            'requested page',
            'invalid page',
            'page is not available',
            'no longer exists',
        ];

        // Kombiniere alle Indikatoren
        const allIndicators = [...germanErrorIndicators, ...englishErrorIndicators];

        // Prüfe auf Indikatoren
        for (let indicator of allIndicators) {
            if (text.includes(indicator)) {
                return indicator;
            }
        }

        // Zusätzliche Heuristiken für Fehlerseiten
        // Title-basierte Erkennung
        const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
        if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            if (title.includes('404') ||
                title.includes('not found') ||
                title.includes('nicht gefunden') ||
                title.includes('fehler') && title.length < 50) {
                return 'Fehlertitel erkannt';
            }
        }

        return null;
    }

    // Einzelnen Link überprüfen
    function checkLink(linkData) {
        return new Promise((resolve) => {
            // Row als "wird geprüft" markieren
            linkData.rowElement.classList.add('wlo-404-checking');

            GM_xmlhttpRequest({
                method: 'HEAD',
                url: linkData.url,
                timeout: 10000,
                onload: function(response) {
                    // 404 oder andere Client-Fehler
                    if (response.status === 404) {
                        linkData.rowElement.classList.remove('wlo-404-checking');
                        console.log(`[WLO-404] 404 Error: ${linkData.url}`);
                        markAsError(linkData, '404 Fehler');
                        resolve({ error: true, reason: '404' });
                        return;
                    }

                    // Für erfolgreiche Responses: Hole vollständigen Inhalt zur Analyse
                    if (response.status >= 200 && response.status < 400) {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: linkData.url,
                            timeout: 10000,
                            onload: function(fullResponse) {
                                linkData.rowElement.classList.remove('wlo-404-checking');

                                // Prüfe auf typische Fehlerseiten-Indikatoren
                                const errorIndicator = detectErrorPage(fullResponse.responseText);

                                if (errorIndicator) {
                                    console.log(`[WLO-404] Fehlerseite erkannt (${errorIndicator}): ${linkData.url}`);
                                    markAsError(linkData, 'Fehlerseite');
                                    resolve({ error: true, reason: 'error-page' });
                                    return;
                                }

                                // Link ist OK
                                linkData.rowElement.classList.add('wlo-404-ok');
                                resolve({ error: false });
                            },
                            onerror: function() {
                                linkData.rowElement.classList.remove('wlo-404-checking');
                                console.log(`[WLO-404] Netzwerk-Fehler: ${linkData.url}`);
                                markAsError(linkData, 'Netzwerk-Fehler');
                                resolve({ error: true, reason: 'network' });
                            },
                            ontimeout: function() {
                                linkData.rowElement.classList.remove('wlo-404-checking');
                                console.log(`[WLO-404] Timeout: ${linkData.url}`);
                                markAsError(linkData, 'Timeout');
                                resolve({ error: true, reason: 'timeout' });
                            }
                        });
                    } else {
                        // Andere HTTP-Fehler (5xx, 3xx mit Problemen, etc.)
                        linkData.rowElement.classList.remove('wlo-404-checking');
                        console.log(`[WLO-404] HTTP Error ${response.status}: ${linkData.url}`);
                        markAsError(linkData, `HTTP ${response.status}`);
                        resolve({ error: true, reason: 'http-error' });
                    }
                },
                onerror: function(response) {
                    linkData.rowElement.classList.remove('wlo-404-checking');
                    console.log(`[WLO-404] Netzwerk-Fehler: ${linkData.url}`);
                    markAsError(linkData, 'Netzwerk-Fehler');
                    resolve({ error: true, reason: 'network' });
                },
                ontimeout: function() {
                    linkData.rowElement.classList.remove('wlo-404-checking');
                    console.log(`[WLO-404] Timeout: ${linkData.url}`);
                    markAsError(linkData, 'Timeout');
                    resolve({ error: true, reason: 'timeout' });
                }
            });
        });
    }

    // Link als fehlerhaft markieren
    function markAsError(linkData, reason) {
        errorCount++;
        linkData.rowElement.classList.add('wlo-404-error');
        linkData.rowElement.setAttribute('data-error-reason', reason);

        // Badge zum Link hinzufügen
        if (!linkData.linkElement.querySelector('.wlo-404-error-badge')) {
            const badge = document.createElement('span');
            badge.className = 'wlo-404-error-badge';
            badge.textContent = reason;
            badge.title = `Fehler: ${reason}`;
            linkData.linkElement.appendChild(badge);
        }

        // Quick-Ablehnen-Button hinzufügen
        addQuickRejectButton(linkData);
    }

    // Quick-Ablehnen-Button zu fehlerhaften Zeilen hinzufügen
    function addQuickRejectButton(linkData) {
        // Prüfe ob Button bereits existiert
        if (linkData.rowElement.querySelector('.wlo-quick-reject')) return;

        const button = document.createElement('button');
        button.className = 'wlo-quick-reject';
        button.innerHTML = '<i class="material-icons">delete</i> Ablehnen';
        button.title = 'Element automatisch ablehnen (404)';

        // Button zur ersten Zelle hinzufügen
        const firstCell = linkData.rowElement.querySelector('mat-cell, .mat-cell, .mat-mdc-cell');
        if (firstCell) {
            firstCell.style.position = 'relative';
            firstCell.appendChild(button);
        }

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            autoRejectElement(linkData);
        });
    }

    // Automatisches Ablehnen eines Elements
    async function autoRejectElement(linkData) {
        const button = linkData.rowElement.querySelector('.wlo-quick-reject');
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="material-icons">hourglass_empty</i> Läuft...';
        }

        try {
            // Schritt 1: Prüfe ob Seitenpanel bereits offen ist, wenn nicht: öffne es
            console.log('[WLO-404] Prüfe Seitenpanel...');

            let panelOpen = document.querySelector('mat-drawer.workflow-panel, .workflow-panel, mat-drawer[position="end"]');

            if (!panelOpen) {
                // Panel ist nicht offen - öffne es automatisch
                console.log('[WLO-404] Seitenpanel geschlossen. Öffne es automatisch...');

                // Suche den Titel-Link in der Zeile
                const titleLink = linkData.rowElement.querySelector('a[href*="/components/"]');

                if (!titleLink) {
                    // Fallback: Suche nach anderen möglichen Titel-Links
                    const allLinks = linkData.rowElement.querySelectorAll('a');
                    const internalLink = Array.from(allLinks).find(link => {
                        const href = link.getAttribute('href');
                        return href && href.includes('/components/');
                    });

                    if (internalLink) {
                        console.log('[WLO-404] Klicke auf internen Link...');
                        internalLink.click();
                    } else {
                        // Kein interner Link gefunden - zeige Fehler
                        linkData.rowElement.style.outline = '3px solid #ff9800';
                        linkData.rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        throw new Error('Konnte keinen klickbaren Titel finden.\n\nBitte klicken Sie manuell auf den TITEL des markierten Elements (orange Rahmen).');
                    }
                } else {
                    console.log('[WLO-404] Klicke auf Titel-Link:', titleLink.textContent.trim());
                    titleLink.click();
                }

                // Warte darauf, dass das Panel sich öffnet
                let panelWaitAttempts = 0;
                while (panelWaitAttempts < 20 && !panelOpen) {
                    await wait(200);
                    panelOpen = document.querySelector('mat-drawer.workflow-panel, .workflow-panel, mat-drawer[position="end"]');
                    panelWaitAttempts++;
                    console.log(`[WLO-404] Warte auf Panel-Öffnung... (${panelWaitAttempts}/20)`);
                }

                if (!panelOpen) {
                    throw new Error('Seitenpanel konnte nicht geöffnet werden.\n\nBitte versuchen Sie es erneut oder öffnen Sie das Panel manuell.');
                }

                console.log('[WLO-404] Seitenpanel erfolgreich geöffnet!');
            } else {
                console.log('[WLO-404] Seitenpanel ist bereits offen');
            }

            // Schritt 2: Status-Panel öffnen
            console.log('[WLO-404] Seitenpanel ist offen. Suche Status-Panel Button...');

            // Warte auf das Workflow-Panel
            let attempts = 0;
            let statusButton = null;

            while (attempts < 15 && !statusButton) {
                // Suche nach allen möglichen Varianten des Status-Panel Buttons
                const allElements = document.querySelectorAll('mat-drawer.workflow-panel *, .workflow-panel *, mat-drawer[position="end"] *');
                statusButton = Array.from(allElements).find(el => {
                    const text = el.textContent.trim();
                    return (text === 'Status-Panel' ||
                            text.includes('Status-Panel') ||
                            (text.includes('Status') && text.includes('Panel'))) &&
                           (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'DIV' && el.getAttribute('role') === 'button');
                });

                if (!statusButton) {
                    console.log(`[WLO-404] Versuch ${attempts + 1}/15: Warte auf Status-Panel Button...`);
                    await wait(300);
                    attempts++;
                }
            }

            if (!statusButton) {
                throw new Error('Status-Panel Button nicht im Seitenpanel gefunden.\n\nBitte prüfen Sie:\n- Ist das Seitenpanel für das RICHTIGE Element geöffnet?\n- Scrollen Sie im Seitenpanel nach unten zu "Status-Panel"');
            }

            console.log('[WLO-404] Status-Panel Button gefunden:', statusButton.textContent);
            statusButton.click();
            await wait(1500); // Mehr Zeit für Panel-Animation

            // Schritt 3: Ablehnen-Button finden und klicken
            console.log('[WLO-404] Suche Ablehnen-Button...');

            attempts = 0;
            let rejectButton = null;

            while (attempts < 20 && !rejectButton) {
                // Suche nach allen Buttons im gesamten Dokument
                const allButtons = document.querySelectorAll('button, [role="button"]');

                rejectButton = Array.from(allButtons).find(btn => {
                    const text = btn.textContent.trim().toLowerCase();
                    const hasWarnColor = btn.getAttribute('color') === 'warn' ||
                                        btn.classList.contains('mat-warn') ||
                                        btn.classList.contains('mat-button-warn');

                    // Suche nach verschiedenen Varianten
                    const isRejectButton = (text.includes('element ablehnen') ||
                                           text.includes('ablehnen') ||
                                           text === 'ablehnen') && hasWarnColor;

                    if (isRejectButton) {
                        console.log('[WLO-404] Gefundener Button:', btn.textContent.trim(), 'Klassen:', btn.className);
                    }

                    return isRejectButton;
                });

                if (!rejectButton) {
                    console.log(`[WLO-404] Versuch ${attempts + 1}/20: Warte auf Ablehnen-Button...`);
                    await wait(400);
                    attempts++;
                }
            }

            if (!rejectButton) {
                // Debug-Ausgabe: Zeige alle Warn-Buttons
                const warnButtons = Array.from(document.querySelectorAll('button[color="warn"], button.mat-warn, button.mat-button-warn'));
                console.log('[WLO-404] Debug: Gefundene Warn-Buttons:', warnButtons.map(b => b.textContent.trim()));
                throw new Error('Ablehnen-Button nicht gefunden.\n\nBitte prüfen Sie:\n- Haben Sie auf "Status-Panel" geklickt?\n- Ist der Ablehnen-Bereich sichtbar?');
            }

            console.log('[WLO-404] Ablehnen-Button gefunden');
            rejectButton.click();
            await wait(500);

            // Schritt 4: Dialog ausfüllen (falls vorhanden)
            console.log('[WLO-404] Prüfe auf Dialog...');

            attempts = 0;
            let textarea = null;

            while (attempts < 10 && !textarea) {
                textarea = document.querySelector('[role="dialog"] textarea, .dialog textarea');
                if (!textarea) {
                    console.log(`[WLO-404] Versuch ${attempts + 1}/10: Warte auf Textarea...`);
                    await wait(200);
                    attempts++;
                }
            }

            // Falls kein Dialog erscheint, wurde das Element möglicherweise schon abgelehnt
            if (!textarea) {
                console.log('[WLO-404] Kein Dialog gefunden - Element wurde möglicherweise bereits abgelehnt');

                // Prüfe ob eine Meldung wie "bereits abgelehnt" sichtbar ist
                const bodyText = document.body.textContent.toLowerCase();
                if (bodyText.includes('bereits abgelehnt') || bodyText.includes('already rejected')) {
                    console.log('[WLO-404] Element war bereits abgelehnt!');
                    if (button) {
                        button.innerHTML = '<i class="material-icons">info</i> Bereits abgelehnt';
                        button.style.background = '#ff9800';
                    }
                    return; // Beende die Funktion erfolgreich
                }

                // Ansonsten: Dialog nicht gefunden, aber kein eindeutiger Hinweis
                console.log('[WLO-404] Ablehnung abgeschlossen (kein Dialog erforderlich)');
                if (button) {
                    button.innerHTML = '<i class="material-icons">check</i> Fertig';
                    button.style.background = '#4caf50';
                }
                return;
            }

            // Grund eingeben
            console.log('[WLO-404] Fülle Ablehnungsgrund aus...');
            textarea.value = '404';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            await wait(300);

            // Schritt 5: Bestätigen
            console.log('[WLO-404] Bestätige Ablehnung...');

            attempts = 0;
            let confirmButton = null;

            while (attempts < 10 && !confirmButton) {
                confirmButton = Array.from(document.querySelectorAll('[role="dialog"] button, .dialog button')).find(btn => {
                    const text = btn.textContent.trim();
                    const hasWarnColor = btn.getAttribute('color') === 'warn' || btn.classList.contains('mat-warn');
                    return text === 'Ablehnen' && hasWarnColor;
                });

                if (!confirmButton) {
                    console.log(`[WLO-404] Versuch ${attempts + 1}/10: Warte auf Bestätigen-Button...`);
                    await wait(200);
                    attempts++;
                }
            }

            if (!confirmButton) {
                throw new Error('Bestätigen-Button im Dialog nicht gefunden');
            }

            console.log('[WLO-404] Klicke Bestätigen...');
            confirmButton.click();
            await wait(1000);

            console.log('[WLO-404] Element erfolgreich abgelehnt!');

            // Markiere Zeile als abgelehnt
            linkData.rowElement.classList.add('wlo-404-rejected');
            if (button) {
                button.innerHTML = '<i class="material-icons">check</i> Abgelehnt';
                button.style.background = '#4caf50';
            }

        } catch (error) {
            console.error('[WLO-404] Fehler beim Ablehnen:', error);
            alert(`Fehler beim automatischen Ablehnen: ${error.message}`);

            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="material-icons">delete</i> Ablehnen';
            }
        }
    }

    // Hilfsfunktion: Warten
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Überprüfung starten
    async function startCheck() {
        if (isChecking) return;

        isChecking = true;
        checkedCount = 0;
        errorCount = 0;

        const startButton = document.getElementById('wlo-start-check');
        startButton.disabled = true;
        startButton.textContent = 'Überprüfung läuft...';

        // Links extrahieren
        extractLinks();

        if (allLinks.length === 0) {
            alert('Keine Links gefunden!');
            resetUI();
            return;
        }

        updateProgress();

        // Links sequenziell überprüfen (mit kleiner Verzögerung)
        for (let i = 0; i < allLinks.length; i++) {
            await checkLink(allLinks[i]);
            checkedCount++;
            updateProgress();

            // Kleine Pause zwischen Requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Fertig
        startButton.textContent = 'Erneut überprüfen';
        startButton.disabled = false;
        isChecking = false;

        alert(`Überprüfung abgeschlossen!\n\nGeprüfte Links: ${checkedCount}\nFehlerhafte Links: ${errorCount}`);
    }

    // Fortschritt aktualisieren
    function updateProgress() {
        const progressDiv = document.getElementById('wlo-404-progress');
        const statsDiv = document.getElementById('wlo-404-stats');

        if (allLinks.length > 0) {
            const percentage = Math.round((checkedCount / allLinks.length) * 100);
            progressDiv.textContent = `${checkedCount} / ${allLinks.length} (${percentage}%)`;
        } else {
            progressDiv.textContent = '';
        }

        statsDiv.innerHTML = `Fehler: <strong>${errorCount}</strong>`;
    }

    // Markierungen löschen
    function clearMarks() {
        document.querySelectorAll('.wlo-404-error, .wlo-404-ok, .wlo-404-checking').forEach(el => {
            el.classList.remove('wlo-404-error', 'wlo-404-ok', 'wlo-404-checking');
            el.removeAttribute('data-error-reason');
        });

        document.querySelectorAll('.wlo-404-error-badge').forEach(badge => badge.remove());

        checkedCount = 0;
        errorCount = 0;
        allLinks = [];
        updateProgress();
    }

    // UI zurücksetzen
    function resetUI() {
        const startButton = document.getElementById('wlo-start-check');
        startButton.disabled = false;
        startButton.textContent = 'Links überprüfen';
        isChecking = false;
    }

    // Spaltenbreite-Anpassung aktivieren/deaktivieren
    let resizeEnabled = false;
    let columnWidths = {}; // Speichert die Spaltenbreiten
    let tableObserver = null; // MutationObserver für Tabellen-Updates

    function toggleColumnResize() {
        resizeEnabled = !resizeEnabled;
        const button = document.getElementById('wlo-toggle-resize');

        if (resizeEnabled) {
            button.textContent = 'Spaltenbreite fixieren';
            button.style.background = '#4caf50';
            button.style.color = 'white';
            enableColumnResize();
        } else {
            button.textContent = 'Spaltenbreite anpassen';
            button.style.background = 'white';
            button.style.color = '#667eea';
            disableColumnResize();
        }
    }

    // Wendet gespeicherte Spaltenbreiten an
    function applyColumnWidths() {
        Object.keys(columnWidths).forEach(columnIndex => {
            const width = columnWidths[columnIndex];

            // Header-Zellen anpassen
            const headerCells = document.querySelectorAll('mat-header-cell, .mat-header-cell, .mat-mdc-header-cell');
            if (headerCells[columnIndex]) {
                headerCells[columnIndex].style.setProperty('width', width + 'px', 'important');
                headerCells[columnIndex].style.setProperty('min-width', width + 'px', 'important');
                headerCells[columnIndex].style.setProperty('max-width', width + 'px', 'important');
                headerCells[columnIndex].style.setProperty('flex', '0 0 ' + width + 'px', 'important');
            }

            // Zeilen-Zellen anpassen
            const rows = document.querySelectorAll('mat-row, .mat-row, .mat-mdc-row');
            rows.forEach(row => {
                const cells = row.querySelectorAll('mat-cell, .mat-cell, .mat-mdc-cell');
                if (cells[columnIndex]) {
                    cells[columnIndex].style.setProperty('width', width + 'px', 'important');
                    cells[columnIndex].style.setProperty('min-width', width + 'px', 'important');
                    cells[columnIndex].style.setProperty('max-width', width + 'px', 'important');
                    cells[columnIndex].style.setProperty('flex', '0 0 ' + width + 'px', 'important');
                }
            });
        });
    }

    function enableColumnResize() {
        const headerCells = document.querySelectorAll('mat-header-cell, .mat-header-cell, .mat-mdc-header-cell');

        headerCells.forEach(cell => {
            if (cell.classList.contains('wlo-column-resizable')) return; // Bereits aktiviert

            cell.classList.add('wlo-column-resizable');

            // Resizer-Handle erstellen
            const resizer = document.createElement('div');
            resizer.className = 'wlo-column-resizer';
            cell.appendChild(resizer);

            // Drag-Event-Handler
            let startX, startWidth, currentCell, columnIndex;

            resizer.addEventListener('mousedown', function(e) {
                e.preventDefault();
                currentCell = cell;
                startX = e.pageX;
                startWidth = currentCell.offsetWidth;
                columnIndex = Array.from(currentCell.parentElement.children).indexOf(currentCell);

                resizer.classList.add('resizing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!currentCell) return;

                const diff = e.pageX - startX;
                const newWidth = startWidth + diff;

                // Mindestbreite: 30px (für schmale Icon-Spalten)
                if (newWidth >= 30) {
                    // Breite speichern
                    columnWidths[columnIndex] = newWidth;

                    // Header-Zelle anpassen - Firefox-kompatibel mit setProperty
                    currentCell.style.setProperty('width', newWidth + 'px', 'important');
                    currentCell.style.setProperty('min-width', newWidth + 'px', 'important');
                    currentCell.style.setProperty('max-width', newWidth + 'px', 'important');
                    currentCell.style.setProperty('flex', '0 0 ' + newWidth + 'px', 'important');

                    // Alle Zellen in dieser Spalte anpassen
                    const rows = document.querySelectorAll('mat-row, .mat-row, .mat-mdc-row');

                    rows.forEach(row => {
                        const cells = row.querySelectorAll('mat-cell, .mat-cell, .mat-mdc-cell');
                        if (cells[columnIndex]) {
                            cells[columnIndex].style.setProperty('width', newWidth + 'px', 'important');
                            cells[columnIndex].style.setProperty('min-width', newWidth + 'px', 'important');
                            cells[columnIndex].style.setProperty('max-width', newWidth + 'px', 'important');
                            cells[columnIndex].style.setProperty('flex', '0 0 ' + newWidth + 'px', 'important');
                        }
                    });
                }
            }

            function onMouseUp() {
                if (resizer) {
                    resizer.classList.remove('resizing');
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                currentCell = null;
            }
        });

        // MutationObserver einrichten für dynamische Tabellen-Updates
        const tableContainer = document.querySelector('mat-table, .mat-table, .mat-mdc-table');
        if (tableContainer && !tableObserver) {
            tableObserver = new MutationObserver((mutations) => {
                // Prüfe ob neue Zeilen hinzugefügt wurden oder Tabelle geändert wurde
                let shouldApply = false;
                mutations.forEach(mutation => {
                    if (mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && (
                                node.matches('mat-row, .mat-row, .mat-mdc-row, mat-header-row, .mat-header-row') ||
                                node.querySelector('mat-row, .mat-row, .mat-mdc-row, mat-header-row, .mat-header-row')
                            )) {
                                shouldApply = true;
                            }
                        });
                    }
                });

                if (shouldApply && resizeEnabled) {
                    // Warte kurz, bis Angular fertig ist
                    setTimeout(() => {
                        applyColumnWidths();

                        // Resizer zu neuen Header-Zellen hinzufügen
                        const newHeaderCells = document.querySelectorAll('mat-header-cell:not(.wlo-column-resizable), .mat-header-cell:not(.wlo-column-resizable), .mat-mdc-header-cell:not(.wlo-column-resizable)');
                        newHeaderCells.forEach(cell => {
                            if (!cell.classList.contains('wlo-column-resizable')) {
                                cell.classList.add('wlo-column-resizable');

                                const resizer = document.createElement('div');
                                resizer.className = 'wlo-column-resizer';
                                cell.appendChild(resizer);

                                // Event-Handler wie oben
                                let startX, startWidth, currentCell, columnIndex;

                                resizer.addEventListener('mousedown', function(e) {
                                    e.preventDefault();
                                    currentCell = cell;
                                    startX = e.pageX;
                                    startWidth = currentCell.offsetWidth;
                                    columnIndex = Array.from(currentCell.parentElement.children).indexOf(currentCell);

                                    resizer.classList.add('resizing');
                                    document.addEventListener('mousemove', onMouseMove);
                                    document.addEventListener('mouseup', onMouseUp);
                                });

                                function onMouseMove(e) {
                                    if (!currentCell) return;

                                    const diff = e.pageX - startX;
                                    const newWidth = startWidth + diff;

                                    if (newWidth >= 30) {
                                        columnWidths[columnIndex] = newWidth;

                                        currentCell.style.setProperty('width', newWidth + 'px', 'important');
                                        currentCell.style.setProperty('min-width', newWidth + 'px', 'important');
                                        currentCell.style.setProperty('max-width', newWidth + 'px', 'important');
                                        currentCell.style.setProperty('flex', '0 0 ' + newWidth + 'px', 'important');

                                        const rows = document.querySelectorAll('mat-row, .mat-row, .mat-mdc-row');
                                        rows.forEach(row => {
                                            const cells = row.querySelectorAll('mat-cell, .mat-cell, .mat-mdc-cell');
                                            if (cells[columnIndex]) {
                                                cells[columnIndex].style.setProperty('width', newWidth + 'px', 'important');
                                                cells[columnIndex].style.setProperty('min-width', newWidth + 'px', 'important');
                                                cells[columnIndex].style.setProperty('max-width', newWidth + 'px', 'important');
                                                cells[columnIndex].style.setProperty('flex', '0 0 ' + newWidth + 'px', 'important');
                                            }
                                        });
                                    }
                                }

                                function onMouseUp() {
                                    if (resizer) {
                                        resizer.classList.remove('resizing');
                                    }
                                    document.removeEventListener('mousemove', onMouseMove);
                                    document.removeEventListener('mouseup', onMouseUp);
                                    currentCell = null;
                                }
                            }
                        });
                    }, 150); // Etwas länger warten für größere Tabellen
                }
            });

            tableObserver.observe(tableContainer, {
                childList: true,
                subtree: true,
                attributes: false
            });
        }

        // Zusätzlicher Observer für den gesamten Body (falls Tabelle komplett neu gerendert wird)
        const bodyObserver = new MutationObserver(() => {
            if (resizeEnabled) {
                const hasTable = document.querySelector('mat-table, .mat-table, .mat-mdc-table');
                if (hasTable) {
                    setTimeout(() => {
                        applyColumnWidths();
                    }, 200);
                }
            }
        });

        bodyObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[WLO-404] Spaltenbreiten-Anpassung aktiviert');
    }

    function disableColumnResize() {
        const headerCells = document.querySelectorAll('mat-header-cell.wlo-column-resizable');

        headerCells.forEach(cell => {
            cell.classList.remove('wlo-column-resizable');

            // Resizer entfernen
            const resizer = cell.querySelector('.wlo-column-resizer');
            if (resizer) {
                resizer.remove();
            }
        });

        // MutationObserver stoppen
        if (tableObserver) {
            tableObserver.disconnect();
            tableObserver = null;
        }

        // WICHTIG: Spaltenbreiten NICHT löschen, damit sie fixiert bleiben!
        // Die gespeicherten Breiten und Styles bleiben erhalten
        console.log('[WLO-404] Spaltenbreiten fixiert - Resizer deaktiviert');
    }

    // Initialisierung
    function init() {
        // Warte, bis die Seite vollständig geladen ist
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Kleine Verzögerung, um sicherzustellen, dass Angular-App geladen ist
        setTimeout(() => {
            createToolbar();
            console.log('[WLO-404] Link Checker initialisiert');
        }, 2000);
    }

    init();
})();
