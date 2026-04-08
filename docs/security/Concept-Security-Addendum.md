# Security Addendum bij de Verwerkersovereenkomst

Concept ten behoeve van juridische review. Dit Security Addendum is een bijlage bij de Verwerkersovereenkomst tussen **Protest Sportwear B.V.** (Verwerkingsverantwoordelijke) en **Ascentra B.V.** (Verwerker, leverancier van het Astra-platform), hierna: de "Verwerkersovereenkomst", en maakt daarvan integraal onderdeel uit. Waar termen in dit Addendum met een hoofdletter beginnen en niet in dit document worden gedefinieerd, hebben zij de betekenis die daaraan in de Verwerkersovereenkomst is gegeven.

Het doel van dit Addendum is om de door de Verwerker toegezegde technische en organisatorische beveiligingsmaatregelen contractueel bindend vast te leggen, zodanig dat de Verwerkingsverantwoordelijke bij niet-naleving een direct opzeggingsrecht heeft.

---

## Artikel 1 — Verhouding tot de Verwerkersovereenkomst en het Security Document

1.1 Dit Addendum verduidelijkt en concretiseert de verplichtingen van de Verwerker onder artikel 7 van de Verwerkersovereenkomst (Beveiliging — artikel 32 AVG).

1.2 Het **Security Document** — formeel getiteld "Astra — Informatiebeveiliging & AVG-Verwerkingsdocument" — is de feitelijke beschrijving van de technische en organisatorische maatregelen zoals die op de ondertekendatum van kracht zijn. Het Security Document is Bijlage A bij de Verwerkersovereenkomst.

1.3 Bij strijdigheid tussen dit Addendum en het Security Document prevaleert dit Addendum. Bij strijdigheid tussen dit Addendum en de Verwerkersovereenkomst prevaleert de Verwerkersovereenkomst, behoudens voorzover dit Addendum expliciet beoogt daarvan af te wijken.

---

## Artikel 2 — Contractuele beveiligingsverplichtingen

De Verwerker verbindt zich tegenover de Verwerkingsverantwoordelijke tot het gedurende de looptijd van de Verwerkersovereenkomst in productie houden van **elk** van de volgende technische en organisatorische maatregelen. Elke maatregel wordt beschouwd als een kernverplichting in de zin van artikel 6:74 BW.

### 2.1 Tenant-isolatie

De Verwerker hanteert Row-Level Security op database-niveau voor alle tabellen die Persoonsgegevens van de Verwerkingsverantwoordelijke bevatten. Cross-tenant data-toegang via de normale applicatielaag is onmogelijk gemaakt. Deze maatregel wordt versterkt door een tweede, expliciete `organization_id`-filter in de applicatielaag (defense-in-depth).

### 2.2 Data-residentie

Persoonsgegevens van de Verwerkingsverantwoordelijke worden uitsluitend opgeslagen in datacenters binnen de Europese Economische Ruimte, in het bijzonder in Frankfurt (`eu-central-1`) of Amsterdam (`eu-west-1`). De Verwerker verplaatst geen Persoonsgegevens voor opslag buiten de EER zonder voorafgaande schriftelijke toestemming van de Verwerkingsverantwoordelijke.

### 2.3 Versleuteling

Persoonsgegevens worden in rust versleuteld met AES-256 en tijdens transport met TLS 1.3 (minimaal TLS 1.2). Wachtwoorden worden uitsluitend opgeslagen als bcrypt-hashes met salt.

### 2.4 Authenticatie en autorisatie

2.4.1 Sessies worden bij elk verzoek server-side geverifieerd tegen de authenticatie-dienst. Sessiecookies zijn `HttpOnly`, `Secure` en `SameSite=Lax`.

2.4.2 Het wachtwoordbeleid hanteert minimaal 12 tekens, verplichte tekenklassen (hoofdletters, kleine letters, cijfers, speciale tekens) en automatische detectie van gelekte wachtwoorden via HaveIBeenPwned.

2.4.3 Rolgebaseerde toegangscontrole is actief op zowel de applicatielaag (tRPC-procedures) als op de database (RLS-policies).

### 2.5 Audit-logging

2.5.1 Elke mutatie op medewerkergegevens, vaardigheden, planningen, dienstroosters, arbeidsregels en beschikbaarheidsoverschrijvingen wordt vastgelegd in een onveranderbare audit-logtabel. `UPDATE` en `DELETE` op deze tabel zijn op databaseniveau geblokkeerd.

2.5.2 Elke audit-log-entry bevat de acterende gebruiker, het tijdstip, het IP-adres, de actie, de volledige voor- en na-staat van de gewijzigde rij, en (in voorkomende gevallen) aanvullende metadata.

### 2.6 Invoervalidatie en injectie-bescherming

Alle server-side API-procedures valideren hun invoer met strikte typed schema's. Alle databasequeries worden uitgevoerd via geparametriseerde query-builders; dynamische SQL-constructie met gebruikersinvoer is verboden.

### 2.7 Beveiligingsheaders

De Verwerker levert bij elke HTTP-response in ieder geval de volgende headers: Content-Security-Policy, Strict-Transport-Security (minimaal 2 jaar, `includeSubDomains`), X-Frame-Options: `DENY`, X-Content-Type-Options: `nosniff`, Referrer-Policy: `strict-origin-when-cross-origin`, Permissions-Policy, en Cross-Origin-Opener-Policy.

### 2.8 Rate limiting

Rate limiting is geactiveerd op alle AI-endpoints, publieke endpoints en tRPC-mutaties, met aparte limieten per bucket. Het mechanisme voorkomt zowel brute-force aanvallen op authenticatie als kostenamplificatie-aanvallen op AI-functionaliteit.

### 2.9 Pseudonimisering richting AI-dienstverleners

Direct identificerende Persoonsgegevens van medewerkers (voor- en achternaam, e-mailadres, telefoonnummer) worden vóór verzending naar externe AI-dienstverleners vervangen door stabiele pseudoniemen op basis van een HMAC-SHA-256 berekening met een per-organisatie geheime sleutel. De pseudoniemen zijn niet omkeerbaar zonder toegang tot zowel de database als de organisatie-specifieke sleutel.

### 2.10 Dependency monitoring

De Verwerker draait bij elke code-wijziging een geautomatiseerde afhankelijkheidsscan (`npm audit`) op productie-dependencies en blokkeert een wijziging bij de introductie van nieuwe HIGH- of CRITICAL-severity kwetsbaarheden. Bekende dev-only moderates worden expliciet bijgehouden in het Security Document.

### 2.11 Recht op vergetelheid (AVG art. 17)

De Verwerker biedt de Verwerkingsverantwoordelijke via de gebruikersinterface een directe procedure om een medewerker onomkeerbaar te anonimiseren onder art. 17 AVG. De procedure vereist een reden (ten minste DSAR-referentie) en bevestigt elke erasure in de onveranderbare audit-log.

### 2.12 Incident response

De Verwerker volgt het incident-response protocol zoals beschreven in §13 van het Security Document. In ieder geval geldt dat de Verwerker de Verwerkingsverantwoordelijke **binnen 24 uur** na vaststelling van een Datalek schriftelijk informeert en **binnen 72 uur** alle informatie levert die de Verwerkingsverantwoordelijke nodig heeft om aan zijn meldplicht aan de Autoriteit Persoonsgegevens te voldoen.

### 2.13 Integratie-credentials (voorwaarde)

De Verwerker realiseert de encryptie van integratie-credentials met AES-256-GCM en per-organisatie sleutels **vóór** de eerste activering van enige koppeling met een extern systeem (WMS, OMS, HRIS, payroll) voor de Verwerkingsverantwoordelijke. Zolang deze maatregel niet is geïmplementeerd, mag geen dergelijke koppeling worden geactiveerd.

---

## Artikel 3 — Wijzigingen in het beveiligingsniveau

3.1 De Verwerker mag het beveiligingsniveau gedurende de looptijd van de Verwerkersovereenkomst niet verlagen. Materiële verbeteringen zijn toegestaan zonder voorafgaande toestemming.

3.2 De Verwerker informeert de Verwerkingsverantwoordelijke binnen 14 dagen over elke materiële wijziging in de in artikel 2 genoemde maatregelen, onder vermelding van het effect op het beveiligingsniveau.

3.3 Indien een wijziging in wet- of regelgeving, een nieuwe bedreigingsanalyse of een richtlijn van de Autoriteit Persoonsgegevens daartoe aanleiding geeft, zullen Partijen te goeder trouw overleggen over aanvullende maatregelen. De kosten van dergelijke aanvullende maatregelen zijn voor rekening van de Verwerker tenzij Partijen anders overeenkomen.

---

## Artikel 4 — Pen-test en externe review

4.1 De Verwerker verbindt zich ertoe om vóór de productie-uitrol voor de Verwerkingsverantwoordelijke een externe penetratietest te laten uitvoeren door een gekwalificeerde, onafhankelijke partij (zoals Computest, Fox-IT, Zerocopter of een partij met vergelijkbare reputatie).

4.2 Het samenvattend rapport van deze pen-test wordt onder geheimhoudingsplicht aan de Verwerkingsverantwoordelijke beschikbaar gesteld uiterlijk 10 werkdagen na oplevering door de pen-tester.

4.3 Bevindingen met classificatie "HIGH" of "CRITICAL" worden door de Verwerker binnen 30 kalenderdagen na oplevering verholpen. Bevindingen met classificatie "MEDIUM" worden binnen 90 kalenderdagen verholpen. Van iedere niet-verhelp-actie wordt door de Verwerker een risico-acceptatie met onderbouwing aan de Verwerkingsverantwoordelijke verstrekt.

4.4 De Verwerker herhaalt de pen-test minimaal **jaarlijks** of direct na elke materiële architectuur-wijziging.

---

## Artikel 5 — Meetbaarheid en naleving

5.1 De Verwerker levert op verzoek van de Verwerkingsverantwoordelijke binnen 10 werkdagen een schriftelijke verklaring die per in artikel 2 genoemde maatregel aantoont dat deze daadwerkelijk in productie actief is, inclusief verwijzingen naar de relevante broncode of configuratie.

5.2 De Verwerker stelt op verzoek geanonimiseerde uittreksels uit de audit-log ter beschikking ter controle van de werking van specifieke maatregelen (bijvoorbeeld: "toon alle rollen-wijzigingen in de afgelopen 90 dagen").

5.3 De Verwerker levert op verzoek `npm audit`-rapporten van de laatste drie productie-deployments, zodat de Verwerkingsverantwoordelijke kan vaststellen dat artikel 2.10 wordt nageleefd.

---

## Artikel 6 — Opschorting en opzegging

6.1 **Opschortingsrecht.** Indien de Verwerkingsverantwoordelijke redelijke gronden heeft om aan te nemen dat een of meer van de in artikel 2 genoemde maatregelen structureel niet (meer) worden nageleefd, kan hij de uitvoering van de Verwerkersovereenkomst schriftelijk opschorten met onmiddellijke ingang, zonder ingebrekestelling.

6.2 **Herstelrecht.** De Verwerker heeft vervolgens **14 kalenderdagen** om de overtreding te herstellen en schriftelijk te bewijzen dat de naleving is hervat.

6.3 **Opzeggingsrecht.** Indien de Verwerker niet binnen de in artikel 6.2 genoemde termijn tot herstel komt, heeft de Verwerkingsverantwoordelijke het recht de Verwerkersovereenkomst met directe ingang en **zonder vergoeding** op te zeggen, onverminderd zijn overige rechten onder de Verwerkersovereenkomst en het Burgerlijk Wetboek.

6.4 Dit artikel is nadrukkelijk een aanvulling op — en geen beperking van — de bevoegdheden van de Verwerkingsverantwoordelijke onder de Verwerkersovereenkomst en de AVG.

---

## Artikel 7 — Duur en slotbepalingen

7.1 Dit Addendum treedt in werking op dezelfde datum als de Verwerkersovereenkomst en eindigt gelijktijdig met die overeenkomst.

7.2 Wijzigingen in dit Addendum zijn uitsluitend geldig indien schriftelijk overeengekomen door beide Partijen.

7.3 Op dit Addendum is Nederlands recht van toepassing. Geschillen worden beslecht door de bevoegde rechter van de **Rechtbank Noord-Nederland, locatie Assen**, in lijn met artikel 16.2 van de Verwerkersovereenkomst.

---

## Ondertekening

**Aldus overeengekomen en ondertekend in tweevoud op `[INVULLEN op moment van ondertekening: datum]`.**

| Verwerkingsverantwoordelijke | Verwerker |
|---|---|
| Protest Sportwear B.V. | Ascentra B.V. |
| `[INVULLEN door Protest Sportwear: naam tekenbevoegd vertegenwoordiger]` | Alex Sinigaglia |
| `[INVULLEN door Protest Sportwear: functie]` | Oprichter |
| Handtekening: ____________________________ | Handtekening: ____________________________ |

---

**Einde concept Security Addendum.**

> Dit document is een concept ten behoeve van juridische review. Het is niet gecontroleerd door een bevoegd juridisch adviseur en vormt geen juridisch advies. Beide partijen wordt geadviseerd dit concept door hun juridisch adviseur te laten beoordelen voorafgaand aan ondertekening.
