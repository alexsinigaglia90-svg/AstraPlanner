# Astra — Beveiliging & Privacy

## Inleiding

Astra is een door Ascentra B.V. geleverd SaaS-platform voor personeelsplanning. Dit document beschrijft beknopt hoe persoonsgegevens binnen Astra worden behandeld, welke technische en organisatorische beveiligingsmaatregelen actief zijn, en welke afspraken tussen Ascentra en de verwerkingsverantwoordelijke contractueel worden vastgelegd. Aanvullende technische en juridische documentatie is op verzoek beschikbaar voor de IT-, security- en juridische functies van Protest Sportwear.

---

## Kern in één oogopslag

- Data-residentie binnen de Europese Unie. Geen opslag van persoonsgegevens buiten de EU.
- AES-256 versleuteling in rust, TLS 1.3 versleuteling in transport.
- Multi-tenant isolatie via PostgreSQL Row-Level Security, versterkt door een tweede applicatielaag-controle.
- Klantdata wordt niet gebruikt voor het trainen van AI-modellen.
- Onveranderbare audit-log van iedere wijziging op gevoelige gegevens.

---

## Hosting en data-residentie

De Astra-database en de applicatielaag draaien volledig binnen de Europese Unie, in datacenters in Frankfurt en Amsterdam. Statische assets worden via een wereldwijd CDN geleverd, maar bevatten geen persoonsgegevens. Persoonsgegevens worden voor opslag of verwerking nooit buiten de Europese Unie geplaatst.

---

## Versleuteling

Data in rust wordt versleuteld met AES-256. Data in transport — tussen browser en applicatie, tussen applicatie en database, en tussen applicatie en eventuele andere systeemcomponenten — wordt versleuteld met TLS 1.3. Wachtwoorden worden uitsluitend bewaard als bcrypt-hashes met salt; leesbare wachtwoorden worden door Ascentra nooit gezien of verwerkt.

---

## Multi-tenant isolatie

De gegevens van iedere klant zijn op databaseniveau afgeschermd door middel van PostgreSQL Row-Level Security. Bij iedere query toetst de database eerst aan welke organisatie de aanvragende gebruiker toebehoort, en levert uitsluitend rijen op die bij die organisatie horen. Bovenop deze databasecontrole hanteert de applicatielaag een tweede, expliciete filtering — een defense-in-depth principe waarmee cross-tenant toegang tot data technisch is uitgesloten, ook in het ongunstige scenario dat één van beide lagen door een programmeerfout zou worden gepasseerd.

---

## Toegang door Ascentra-personeel

Ascentra-personeel heeft geen routinematige toegang tot klantdata. Productie-credentials zijn uitsluitend opgeslagen als versleutelde omgevingsvariabelen binnen de hostingomgeving en zijn nooit aanwezig in broncode of in de versiebeheer-historie. Persoonlijke toegang tot productiedata is uitsluitend toegestaan in incident-context of op uitdrukkelijk verzoek van de verwerkingsverantwoordelijke. Iedere dergelijke toegang wordt onveranderbaar gelogd en achteraf aan de betreffende klant gerapporteerd.

---

## AI-functionaliteit

Astra gebruikt kunstmatige intelligentie voor het genereren van planningsadviezen en analyses. Deze AI-verwerking vindt plaats binnen door Ascentra beheerde infrastructuur. Direct identificerende persoonsgegevens — voor- en achternaam, e-mailadres, telefoonnummer — worden vóór verwerking vervangen door pseudoniemen via een cryptografische functie, zodat het AI-model nooit de werkelijke identiteit van een betrokkene te zien krijgt. Klantdata wordt onder geen enkele omstandigheid gebruikt voor het trainen van AI-modellen.

---

## Sub-processors

Astra maakt voor de levering van de dienst gebruik van een beperkt aantal infrastructuurleveranciers. Geen andere derde partijen krijgen toegang tot persoonsgegevens van Protest Sportwear.

| Rol | Functie | Locatie |
|---|---|---|
| Database-platform | PostgreSQL-database, authenticatie, sessieopslag | Europese Unie |
| Applicatie-hosting | Serverless functies en edge-routing | Europese Unie |
| Rate-limiting | Verzoekfrequentie-regulering ter beveiliging | Europese Unie |

Wijzigingen in deze sub-processors worden minimaal dertig kalenderdagen vooraf aan Protest Sportwear schriftelijk gemeld, met een recht tot gemotiveerd bezwaar.

---

## AVG-compliance op hoofdlijnen

Protest Sportwear is verwerkingsverantwoordelijke in de zin van de Algemene Verordening Gegevensbescherming. Ascentra B.V. is verwerker. De AVG-rechten van betrokkenen — recht op inzage, rectificatie, beperking, overdraagbaarheid en het recht op vergetelheid onder artikel 17 — zijn binnen Astra rechtstreeks ondersteund: een geautoriseerde gebruiker kan een medewerker via de gebruikersinterface onomkeerbaar anonimiseren, waarbij direct identificerende persoonsgegevens worden verwijderd terwijl historische planningsgegevens consistent blijven onder een geanonimiseerde verwijzing. Een conceptverwerkersovereenkomst conform artikel 28 AVG is op verzoek per omgaande beschikbaar.

---

## Incident response

Bij een vermoedelijk datalek wordt Protest Sportwear binnen 24 uur na vaststelling schriftelijk geïnformeerd. De melding bevat de aard van het lek, de getroffen categorieën van persoonsgegevens en betrokkenen, een eerste inschatting van de waarschijnlijke gevolgen, en de reeds genomen of voorgestelde maatregelen. Deze informatie is voldoende voor Protest Sportwear om binnen de wettelijke termijn van 72 uur melding te doen aan de Autoriteit Persoonsgegevens overeenkomstig artikel 33 AVG. Het 24-uurs meldpunt is bereikbaar via `incident@ascentra.nl`.

---

## Detaildocumentatie op aanvraag

Dit document is een executive samenvatting. Voor het juridisch team van Protest Sportwear is een conceptverwerkersovereenkomst beschikbaar die de volledige wederzijdse verplichtingen onder artikel 28 AVG vastlegt. Voor de IT- of security-afdeling is een uitgebreid technisch document beschikbaar dat alle hier genoemde beveiligingsmaatregelen onderbouwt op codeniveau en per onderdeel in detail uitwerkt. Beide documenten worden op verzoek per omgaande verstrekt.

---

## Contact

**Ascentra B.V.**
Oranjestraat 11, 9401 KE Assen
Ingeschreven in het handelsregister onder nummer 98227548

Privacy en algemene vragen: `privacy@ascentra.nl`
Meldpunt datalek (24/7): `incident@ascentra.nl`

---

## Ondertekening

**Alex Sinigaglia**
Oprichter, Ascentra B.V.

_Handtekening:_ ____________________________
