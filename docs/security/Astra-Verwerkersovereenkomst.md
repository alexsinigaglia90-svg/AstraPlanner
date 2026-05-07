# Verwerkersovereenkomst & Beveiligingsbeleid

## Partijen

| | |
|---|---|
| **Verwerkingsverantwoordelijke** | Protest Sportwear B.V., Veerpolder 7, 2361 KX Warmond, ingeschreven onder KvK-nummer 28055371. |
| **Verwerker** | Ascentra B.V., Oranjestraat 11, 9401 KE Assen, ingeschreven onder KvK-nummer 98227548, leverancier van het Astra-platform. |

Hierna gezamenlijk te noemen "**partijen**" en ieder afzonderlijk "**partij**".

## Overwegingen

Partijen sluiten een overeenkomst op grond waarvan de Verwerker het Astra-platform ter beschikking stelt voor personeelsplanning. Bij de uitvoering van die overeenkomst worden persoonsgegevens verwerkt waarvan de Verwerkingsverantwoordelijke de verantwoordelijke is en de Verwerker de verwerker in de zin van artikel 4 lid 7 en 8 van de Algemene Verordening Gegevensbescherming (Verordening (EU) 2016/679, hierna "**AVG**"). Op grond van artikel 28 AVG zijn partijen gehouden de verwerking schriftelijk vast te leggen. Dit document strekt tot die vastlegging en geeft daarnaast een geïntegreerd overzicht van de technische en organisatorische beveiligingsmaatregelen die op het Astra-platform van toepassing zijn.

---

# DEEL I — Beveiligingsbeleid

## 1. Kern in één oogopslag

- Data-residentie binnen de Europese Unie. Geen opslag van persoonsgegevens buiten de EU.
- AES-256 versleuteling in rust, TLS 1.3 versleuteling in transport.
- Multi-tenant isolatie via PostgreSQL Row-Level Security, versterkt door een tweede applicatielaag-controle.
- Klantdata wordt niet gebruikt voor het trainen van AI-modellen.
- Onveranderbare audit-log van iedere wijziging op gevoelige gegevens.

## 2. Hosting en data-residentie

De Astra-database en de applicatielaag draaien volledig binnen de Europese Unie, in datacenters in Frankfurt en Amsterdam. Statische assets worden via een wereldwijd CDN geleverd, maar bevatten geen persoonsgegevens. Persoonsgegevens worden voor opslag of verwerking nooit buiten de Europese Unie geplaatst.

## 3. Versleuteling

Data in rust wordt versleuteld met AES-256. Data in transport — tussen browser en applicatie, tussen applicatie en database, en tussen applicatie en eventuele andere systeemcomponenten — wordt versleuteld met TLS 1.3. Wachtwoorden worden uitsluitend bewaard als bcrypt-hashes met salt; leesbare wachtwoorden worden door de Verwerker nooit gezien of verwerkt.

## 4. Multi-tenant isolatie

De gegevens van iedere klant zijn op databaseniveau afgeschermd door middel van PostgreSQL Row-Level Security. Bij iedere query toetst de database eerst aan welke organisatie de aanvragende gebruiker toebehoort, en levert uitsluitend rijen op die bij die organisatie horen. Bovenop deze databasecontrole hanteert de applicatielaag een tweede, expliciete filtering — een defense-in-depth principe waarmee cross-tenant toegang tot data technisch is uitgesloten, ook in het ongunstige scenario dat één van beide lagen door een programmeerfout zou worden gepasseerd.

## 5. Toegang door personeel van de Verwerker

Personeel van de Verwerker heeft geen routinematige toegang tot klantdata. Productie-credentials zijn uitsluitend opgeslagen als versleutelde omgevingsvariabelen binnen de hostingomgeving en zijn nooit aanwezig in broncode of in de versiebeheer-historie. Persoonlijke toegang tot productiedata is uitsluitend toegestaan in incident-context of op uitdrukkelijk verzoek van de Verwerkingsverantwoordelijke. Iedere dergelijke toegang wordt onveranderbaar gelogd en achteraf aan de Verwerkingsverantwoordelijke gerapporteerd.

## 6. AI-functionaliteit

Astra gebruikt kunstmatige intelligentie voor het genereren van planningsadviezen en analyses. Deze AI-verwerking vindt plaats binnen door de Verwerker beheerde infrastructuur. Direct identificerende persoonsgegevens — voor- en achternaam, e-mailadres, telefoonnummer — worden vóór verwerking vervangen door pseudoniemen via een cryptografische functie, zodat het AI-model nooit de werkelijke identiteit van een betrokkene te zien krijgt. Klantdata wordt onder geen enkele omstandigheid gebruikt voor het trainen van AI-modellen.

## 7. Audit-log en integriteit

Iedere wijziging op gevoelige tabellen — medewerkergegevens, vaardigheden, planningen, dienstroosters, arbeidsregels en beschikbaarheden — wordt vastgelegd in een audit-log die op database-niveau onveranderbaar is gemaakt: `UPDATE`- en `DELETE`-operaties op deze tabel worden geweigerd. Iedere registratie bevat de acterende gebruiker, het tijdstip, het IP-adres, en de volledige snapshot van de waarden vóór en ná de wijziging.

---

# DEEL II — Verwerkersovereenkomst

## 8. Onderwerp en doel van de verwerking

8.1 De Verwerker verwerkt persoonsgegevens uitsluitend ten behoeve van de Verwerkingsverantwoordelijke en alleen op basis van schriftelijke instructies van de Verwerkingsverantwoordelijke, behoudens wettelijke uitzonderingen.

8.2 Het onderwerp van de verwerking betreft het opstellen, optimaliseren en beheren van personeelsplanningen, het registreren van verzuim en beschikbaarheid, het bijhouden van vaardigheden en training, het genereren van rapportages en voorspellingen voor de personeelsbehoefte, en het aanbieden van AI-ondersteunde adviezen voor planningsbeslissingen.

8.3 De Verwerker zal de persoonsgegevens niet voor eigen doeleinden gebruiken. In het bijzonder worden de gegevens niet gebruikt voor profilering ten behoeve van derden, voor het trainen van AI-modellen, voor marketingdoeleinden, of voor verstrekking aan andere partijen dan de in artikel 11 genoemde sub-processors.

## 9. Categorieën persoonsgegevens en betrokkenen

9.1 De volgende categorieën van betrokkenen zijn aan deze overeenkomst onderworpen: medewerkers van de Verwerkingsverantwoordelijke (vast, tijdelijk, uitzendkracht of gedetacheerde), gebruikers van het Astra-platform (planners, supervisors, managers, administratoren) en contactpersonen voor contractuele communicatie.

9.2 De volgende categorieën van persoonsgegevens worden verwerkt: directe identificatoren (voor- en achternaam, e-mailadres, telefoonnummer, personeelsnummer); arbeidsgegevens (aanstellingsdatum, beëindigingsdatum, status, contracttype, contracturen); gevoelige financiële gegevens (uurtarief, salarisschaal); vaardigheids- en certificeringsgegevens; beschikbaarheids- en verzuimgegevens; inzetvoorkeuren; locatie- en rolgegevens; audit-metadata (IP-adres, user-agent, actor-id) en authenticatiegegevens.

9.3 Het Astra-platform is niet ontworpen voor de verwerking van bijzondere categorieën persoonsgegevens in de zin van artikel 9 AVG. Het vrije-tekstveld voor verzuimreden kan afhankelijk van de invulling door de Verwerkingsverantwoordelijke gezondheidsgegevens bevatten; de Verwerkingsverantwoordelijke verklaart zijn gebruikers te instrueren in dit veld uitsluitend neutrale verzuimcategorieën op te nemen en geen medische details.

## 10. Verplichtingen van partijen

10.1 De Verwerker treft passende technische en organisatorische maatregelen overeenkomstig artikel 32 AVG. De van toepassing zijnde maatregelen zijn beschreven in deel I van dit document en vormen integraal onderdeel van deze overeenkomst.

10.2 De Verwerker waarborgt dat aan de persoonsgegevens uitsluitend personen toegang hebben die geheimhouding in acht moeten nemen op grond van wet, arbeidsovereenkomst of een afzonderlijke geheimhoudingsverklaring.

10.3 De Verwerkingsverantwoordelijke is verantwoordelijk voor het bepalen van de rechtsgrondslag voor de verwerking onder artikel 6 AVG, het verstrekken van de informatie aan betrokkenen onder artikel 13 en 14 AVG, het beoordelen van de noodzaak van een gegevensbeschermingseffectbeoordeling onder artikel 35 AVG, en het melden van datalekken aan de Autoriteit Persoonsgegevens en — waar van toepassing — aan betrokkenen.

## 11. Sub-processors

11.1 De Verwerkingsverantwoordelijke verleent algemene schriftelijke toestemming voor het inschakelen van de hieronder genoemde sub-processors. Geen andere derde partijen krijgen toegang tot persoonsgegevens van de Verwerkingsverantwoordelijke.

| Rol | Functie | Locatie |
|---|---|---|
| Database-platform | PostgreSQL-database, authenticatie, sessieopslag | Europese Unie |
| Applicatie-hosting | Serverless functies en edge-routing | Europese Unie |
| Rate-limiting | Verzoekfrequentie-regulering ter beveiliging | Europese Unie |

11.2 Wijzigingen in deze sub-processorslijst worden minimaal dertig kalenderdagen vooraf schriftelijk aan de Verwerkingsverantwoordelijke gemeld. De Verwerkingsverantwoordelijke heeft het recht binnen die termijn gemotiveerd bezwaar te maken; bij gebreke van overeenstemming over een alternatief heeft hij het recht de overeenkomst kosteloos op te zeggen voor het door de wijziging geraakte deel.

11.3 Voor zover voor een sub-processor sprake zou zijn van doorgifte naar een derde land buiten de Europese Economische Ruimte zonder adequaatheidsbesluit, treft de Verwerker passende waarborgen in de zin van artikel 46 AVG, waaronder Standard Contractual Clauses, en treft hij aanvullende maatregelen zoals pseudonimisering vóór doorgifte.

## 12. Datalekken

12.1 Bij een vermoedelijk datalek wordt de Verwerkingsverantwoordelijke binnen vierentwintig uur na vaststelling schriftelijk geïnformeerd. De melding bevat de aard van het lek, de getroffen categorieën persoonsgegevens en betrokkenen, een eerste inschatting van de waarschijnlijke gevolgen, en de reeds genomen of voorgestelde maatregelen. Deze informatie is voldoende om binnen de wettelijke termijn van tweeënzeventig uur melding te doen aan de Autoriteit Persoonsgegevens overeenkomstig artikel 33 AVG.

12.2 Het 24-uurs meldpunt van de Verwerker is bereikbaar via `incident@ascentra.nl`.

12.3 De Verwerker documenteert iedere datalek-gebeurtenis, met inbegrip van de feiten, de gevolgen en de genomen corrigerende maatregelen, ten behoeve van de verantwoordingsplicht van de Verwerkingsverantwoordelijke onder artikel 33 lid 5 AVG.

## 13. Bijstand bij rechten van betrokkenen

13.1 De Verwerker verleent de Verwerkingsverantwoordelijke redelijke bijstand bij het voldoen aan diens verplichting om verzoeken van betrokkenen onder hoofdstuk III AVG te beantwoorden.

13.2 Het Astra-platform ondersteunt rechtstreeks het recht op inzage, het recht op rectificatie, het recht op beperking van de verwerking, en het recht op vergetelheid onder artikel 17 AVG. Voor het recht op vergetelheid biedt het platform een procedure waarmee een geautoriseerde gebruiker een medewerker onomkeerbaar anonimiseert: direct identificerende persoonsgegevens worden permanent verwijderd, terwijl historische planningsgegevens consistent blijven onder een geanonimiseerde verwijzing.

13.3 Voor formele data subject access requests levert de Verwerker op verzoek van de Verwerkingsverantwoordelijke binnen vijf werkdagen een gestructureerde export van alle aanwezige persoonsgegevens van een betrokkene.

## 14. Audit

14.1 De Verwerkingsverantwoordelijke heeft het recht om eenmaal per kalenderjaar op eigen kosten een audit te laten uitvoeren naar de naleving van deze overeenkomst, dan wel vaker indien daartoe naar aanleiding van een datalek of een gerechtvaardigd vermoeden van niet-naleving aanleiding bestaat.

14.2 De audit wordt uitgevoerd door een onafhankelijke derde partij die gebonden is aan een geheimhoudingsplicht jegens de Verwerker. De audit wordt minimaal twintig werkdagen vooraf schriftelijk aangekondigd en vindt plaats tijdens reguliere kantooruren.

14.3 De Verwerker mag alternatieve bewijsvoering aanbieden in de vorm van recente certificeringsrapporten of een penetratietestrapport, met dien verstande dat de Verwerkingsverantwoordelijke het recht behoudt een fysieke audit te verlangen wanneer dergelijke documenten niet aan zijn redelijke informatiebehoefte voldoen.

## 15. Duur en beëindiging

15.1 Deze overeenkomst geldt voor de duur van de hoofdovereenkomst tussen partijen. Bij beëindiging van de hoofdovereenkomst eindigt deze overeenkomst van rechtswege, met uitzondering van de bepalingen die naar hun aard na beëindiging blijven gelden.

15.2 Tot uiterlijk dertig kalenderdagen na beëindiging stelt de Verwerker een volledige export van de persoonsgegevens van de Verwerkingsverantwoordelijke in een gestructureerd, gangbaar en machineleesbaar formaat ter beschikking.

15.3 Uiterlijk dertig kalenderdagen na het einde van de in artikel 15.2 genoemde export-termijn — dan wel eerder bij schriftelijke bevestiging dat geen export gewenst is — verwijdert de Verwerker alle persoonsgegevens van de Verwerkingsverantwoordelijke uit zijn productiesystemen. Back-ups die op het moment van verwijdering nog bestaan worden door het natuurlijk verloop van de back-up-retentie binnen zeven dagen automatisch overschreven. Van de definitieve verwijdering wordt schriftelijke bevestiging verstrekt.

## 16. Aansprakelijkheid

16.1 De aansprakelijkheid van partijen onder deze overeenkomst wordt beheerst door de aansprakelijkheidsregeling van de hoofdovereenkomst, met dien verstande dat aansprakelijkheid voor schade die het gevolg is van opzet of bewuste roekeloosheid van een partij of haar leidinggevend personeel niet wordt beperkt.

16.2 Eventuele administratieve boetes opgelegd onder artikel 83 AVG worden gedragen door de partij aan wie de inbreuk daadwerkelijk toerekenbaar is.

## 17. Toepasselijk recht en geschilbeslechting

17.1 Op deze overeenkomst is Nederlands recht van toepassing.

17.2 Geschillen die voortvloeien uit of samenhangen met deze overeenkomst worden uitsluitend voorgelegd aan de Rechtbank Noord-Nederland, locatie Assen.

---

# DEEL III — Aanvullende documentatie

De volgende documenten zijn op verzoek per omgaande beschikbaar voor de juridische, IT- of security-functies van de Verwerkingsverantwoordelijke. Zij vormen een verdere uitwerking van het in deel I beschreven beveiligingsbeleid en het in deel II vastgelegde verwerkingskader.

| Document | Doel | Doelgroep |
|---|---|---|
| **Uitgebreid technisch beveiligingsdocument** | Volledige onderbouwing op codeniveau van iedere maatregel uit deel I, inclusief verwijzingen naar specifieke broncode-bestanden, database-migraties en configuratie. | IT- en security-afdeling van de Verwerkingsverantwoordelijke. |
| **Uitgebreide verwerkersovereenkomst** | Volledige juridische tekst van de verwerkersovereenkomst, met afzonderlijke artikelen over definities, doel, sub-processors, audit, geheimhouding, aansprakelijkheid en doorgifte. | Juridisch adviseurs van de Verwerkingsverantwoordelijke. |
| **DPIA-template voor Astra** | Hergebruikbaar template waarmee de Verwerkingsverantwoordelijke zijn eigen verplichting onder artikel 35 AVG kan invullen, voorzien van vooringevulde risicoscores en mitigerende maatregelen. | Privacy-officer of Functionaris Gegevensbescherming van de Verwerkingsverantwoordelijke. |

Een afzonderlijk Security Addendum, waarin de in deel I beschreven beveiligingsmaatregelen contractueel bindend worden vastgelegd met opschortings- en opzeggingsrechten bij structurele niet-naleving, is eveneens op verzoek beschikbaar.

---

## Contact

**Ascentra B.V.**
Oranjestraat 11, 9401 KE Assen
Ingeschreven in het handelsregister onder nummer 98227548

Privacy en algemene vragen: `privacy@ascentra.nl`
Meldpunt datalek (24/7): `incident@ascentra.nl`

---

## Ondertekening

Aldus overeengekomen en ondertekend in tweevoud.

| Verwerkingsverantwoordelijke | Verwerker |
|---|---|
| Protest Sportwear B.V. | Ascentra B.V. |
| `[INVULLEN: naam tekenbevoegd vertegenwoordiger]` | Alex Sinigaglia |
| `[INVULLEN: functie]` | General Manager |
| Datum: `[INVULLEN: datum]` | Datum: `[INVULLEN: datum]` |
| Handtekening: ____________________________ | Handtekening: ____________________________ |
