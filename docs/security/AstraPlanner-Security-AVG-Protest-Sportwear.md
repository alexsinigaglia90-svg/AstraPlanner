# Astra — Informatiebeveiliging & AVG-Verwerkingsdocument

**Vertrouwelijk — bestemd voor Protest Sportwear B.V.**

| | |
|---|---|
| **Opgesteld voor** | Protest Sportwear B.V. — Veerpolder 7, 2361 KX Warmond — KvK 28055371 |
| **Ter attentie van** | Dhr. M. Werkman, Warehouse Manager |
| **Opgesteld door** | Ascentra B.V. — Oranjestraat 11, 9401 KE Assen — KvK 98227548 — leverancier van het Astra-platform |
| **Document versie** | 1.1 |
| **Documentdatum** | 9 april 2026 |
| **Classificatie** | Vertrouwelijk — alleen voor geadresseerde |
| **Geldigheid** | Dit document weerspiegelt de technische en organisatorische maatregelen van Astra per bovenstaande datum en wordt bij elke materiële wijziging herzien. |

---

## 1. Inleiding

Dit document beschrijft de wijze waarop Ascentra B.V. — de leverancier van het Astra-platform — de persoonsgegevens van Protest Sportwear B.V. verwerkt en beveiligt. Het is opgesteld ten behoeve van de due-diligence-fase voorafgaand aan contractuele toetreding en richt zich op drie aspecten: de technische en organisatorische beveiligingsmaatregelen, de naleving van de Algemene Verordening Gegevensbescherming, en de feitelijke bevoegdheden van Ascentra-personeel inzake klantdata.

Ascentra hanteert het beginsel dat de inhoud van dit document in zijn geheel verifieerbaar is. Iedere materiële uitspraak betreffende de werking van het platform is herleidbaar tot een specifieke regel in de broncode of een specifieke configuratie in de productieomgeving en kan tijdens een technische due-diligence worden gecontroleerd. Maatregelen die nog niet zijn geïmplementeerd worden als zodanig benoemd, met vermelding van de voorwaarden waaronder en het tijdstip waarop zij worden uitgevoerd.

Het document is opgesteld op basis van een interne code-audit van de Astra-codebase, uitgevoerd door twee onafhankelijke geautomatiseerde beveiligingsanalyses aangevuld met een handmatige controle van de databaseschema's, de authenticatie-implementatie en de datastromen naar externe dienstverleners. De resultaten worden in dit document declaratief gepresenteerd; de onderliggende analyses zijn op verzoek beschikbaar voor de technische vertegenwoordiging van Protest Sportwear.

---

## 2. Management Samenvatting

Astra is een multi-tenant SaaS-platform voor personeelsplanning in warehouse-, logistiek- en productieomgevingen. Het platform wordt aangeboden vanuit de Europese Unie, draait op twee Europese infrastructuurleveranciers (Supabase en Vercel) en verwerkt als gegevensverwerker, in de zin van artikel 28 AVG, persoonsgegevens van medewerkers namens Protest Sportwear als verwerkingsverantwoordelijke.

De volgende technische en organisatorische maatregelen zijn op de datum van dit document operationeel en verifieerbaar:

1. **Tenant-isolatie op databaseniveau.** Klantdata is op PostgreSQL-niveau afgeschermd door middel van Row-Level Security. Cross-tenant data-toegang via de applicatielaag is uitgesloten en niet afhankelijk van correct programmeren in de applicatielaag.
2. **Data-residentie in de Europese Unie.** De databases draaien in Frankfurt (`eu-central-1`) of Amsterdam (`eu-west-1`). De serverless functies draaien in de EU-regio van Vercel. Persoonsgegevens worden niet buiten de EU opgeslagen.
3. **Versleuteling in rust en tijdens transport.** AES-256 voor data at rest, beheerd door Supabase. TLS 1.3 voor alle netwerkverbindingen.
4. **Authenticatie met server-side verificatie.** Sessies worden per verzoek geverifieerd tegen Supabase Auth. Sessiecookies zijn `HttpOnly`, `Secure` en `SameSite=Lax`.
5. **Onveranderbare audit-log.** Wijzigingen op gevoelige tabellen — medewerkers, vaardigheden, planningen, dienstroosters, arbeidsregels en beschikbaarheid — worden vastgelegd in een audit-logtabel waarop `UPDATE` en `DELETE` op databaseniveau zijn geblokkeerd.
6. **Beperkte toegang voor Ascentra-personeel.** Routinematige toegang tot klantdata door Ascentra-personeel komt niet voor. De service-role sleutel die de Row-Level Security technisch kan omzeilen is uitsluitend aanwezig als versleutelde omgevingsvariabele in de productieomgeving van Vercel; toegang voor incidentrespons wordt gelogd en wordt achteraf aan de verwerkingsverantwoordelijke gerapporteerd.
7. **Sluitende invoervalidatie.** De 116 server-side API-procedures valideren hun invoer met getypeerde schema's. Alle databasequeries lopen via geparametriseerde query-builders. Een aanvalsoppervlak voor SQL-injectie is op codeniveau afwezig.

Een volledig overzicht van de technische en organisatorische maatregelen is opgenomen in sectie 15. Twee maatregelen kennen een afwijkende status: een externe penetratietest is op verzoek van Protest Sportwear contractueel beschikbaar, en de encryptie van integratie-credentials wordt geactiveerd voorafgaand aan de eerste externe systeemkoppeling (zie sectie 5.4). De overige in sectie 15 opgenomen maatregelen zijn op de datum van dit document aanwezig in de productieomgeving en verifieerbaar in de broncode.

---

## 2.1 Beschermingsdomeinen op één pagina

Onderstaande samenvatting beschrijft de beschermingslagen rondom de data van Protest Sportwear langs zeven risicodomeinen. Elke laag wordt verderop in dit document technisch onderbouwd; de paragraafverwijzingen achter elke alinea zijn de toegang tot die onderbouwing.

**Beschikbaarheid en herstel.** Klantdata wordt opgeslagen in een PostgreSQL-database die door Supabase op AWS-infrastructuur in Frankfurt of Amsterdam wordt beheerd. Continue back-ups worden gemaakt met Point-in-Time Recovery tot op transactieniveau over de afgelopen zeven dagen, optioneel uitbreidbaar. Bij hardwarestoringen vindt automatische failover binnen minuten plaats. Klantdata wordt bij contractbeëindiging binnen dertig dagen verwijderd. *(Sectie 5.1 en 4.4.)*

**Vertrouwelijkheid tijdens transport.** Iedere verbinding tussen browser en applicatie, tussen applicatie en database, en tussen applicatie en derde partijen verloopt over TLS 1.3. HTTP wordt geweigerd. Sessiecookies zijn `HttpOnly`, `Secure` en `SameSite=Lax`, waardoor JavaScript in de browser de sessietoken niet kan benaderen en standaard cross-site aanvallen op de sessie worden geblokkeerd. *(Sectie 5.2 en 7.4.)*

**Vertrouwelijkheid in rust.** Alle data — operationele tabellen, audit-logs en back-ups — wordt op schijfniveau versleuteld met AES-256 door Supabase. Wachtwoorden worden door Supabase Auth opgeslagen als bcrypt-hashes met salt; Ascentra-code verwerkt op geen enkel moment een leesbaar wachtwoord. *(Sectie 5.2.)*

**Multi-tenant isolatie.** Iedere regel data in de database draagt het `organization_id` van Protest Sportwear. Op alle tabellen met klantdata is PostgreSQL Row-Level Security geactiveerd. De database controleert bij elke query, vóór enige rij wordt teruggegeven, of het `organization_id` van de rij overeenkomt met het `organization_id` uit de JWT van de aanvragende gebruiker. De controle is niet te omzeilen vanuit de applicatielaag. Daarbovenop hanteert de tRPC-API een expliciete tweede `WHERE organization_id = ctx.organizationId`-filter (defense in depth). Cross-tenant data-toegang is, zelfs bij een hypothetische programmeerfout in één van beide lagen, geblokkeerd door de andere. *(Sectie 6.1 t/m 6.4.)*

**Beperking van toegang door Ascentra-personeel.** Ascentra-personeel beschikt niet over routinematige toegang tot productiedata van Protest Sportwear. De service-role sleutel die de Row-Level Security technisch kan omzeilen is uitsluitend aanwezig als versleutelde omgevingsvariabele in de productieomgeving van Vercel en wordt vanuit één enkel server-side bestand benaderd. De sleutel komt niet voor in broncode, niet in Git en niet op werkstations, hetgeen verifieerbaar is via de git-historie over `.env*`-paden. Persoonlijke toegang tot productiedata is uitsluitend toegestaan in geval van een kritiek incident of op expliciet verzoek van Protest Sportwear, wordt onveranderbaar gelogd door Supabase en wordt achteraf gerapporteerd. *(Sectie 6.6.)*

**Bescherming tegen externe aanvallers.** Alle 116 server-side API-procedures valideren hun invoer met getypeerde schema's; afwijkende payloads worden vóór alle businesslogica geweigerd. Alle databasequeries lopen via geparametriseerde query-builders; SQL-injectie is structureel uitgesloten. Een statische scan van de codebase op gevaarlijke patronen (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) levert nul treffers op; klassieke XSS-aanvallen worden door de standaard HTML-escaping van React geblokkeerd. Authenticatie wordt per verzoek server-side geverifieerd tegen Supabase Auth, niet uitsluitend lokaal gedecodeerd. Rolbevoegdheden worden zowel in de applicatielaag als in de Row-Level Security policies van gevoelige tabellen afgedwongen. *(Secties 7, 8 en 9.)*

**Auditbaarheid en incidentrespons.** Wijzigingen op de zes meest gevoelige tabellen — medewerkers, vaardigheden, planningen, dienstroosters, arbeidsregels en beschikbaarheid — worden vastgelegd in een onveranderbare audit-log. Een databasetrigger blokkeert iedere `UPDATE` of `DELETE` op deze tabel. Per record bevat de log de actor, het tijdstip, het IP-adres, de actie en een volledige snapshot van de voor- en na-staat. Bij een vastgesteld datalek wordt de verwerkingsverantwoordelijke binnen 24 uur door Ascentra geïnformeerd, met een volledige informatieoplevering binnen 72 uur ten behoeve van de meldplicht aan de Autoriteit Persoonsgegevens. *(Secties 10 en 13.)*

**Beheersing van AI-doorgifte.** Direct identificerende persoonsgegevens van medewerkers worden niet in oorspronkelijke vorm verzonden naar Anthropic. Voor iedere AI-aanroep wordt een naam vervangen door een deterministisch pseudoniem op basis van een HMAC-SHA-256 over een per-organisatie geheime sleutel. Het model ontvangt uitsluitend pseudoniemen in de vorm `Medewerker A3F2`. Onder deze architectuur verlaten identificerende persoonsgegevens de Europese Unie niet en worden de eisen van hoofdstuk V AVG inzake doorgifte aan derde landen op deze gegevensstroom niet getriggerd. *(Sectie 11.3.)*

In geval van een gecompromitteerd account van een andere Astra-klant resulteert een poging tot toegang tot Protest Sportwear-data in een lege resultaatset: de Row-Level Security in PostgreSQL blokkeert de query voordat enige rij wordt geretourneerd. In geval van een onverhoopte programmeerfout in de applicatielaag wordt deze opgevangen door de Row-Level Security daaronder. De combinatie van deze lagen vormt het defense-in-depth model dat in dit document onder de noemer tenant-isolatie wordt onderbouwd.

---

## 3. Partijen, Rollen & Contactgegevens

### 3.1 Verwerkingsverantwoordelijke

**Protest Sportwear B.V.**
- Veerpolder 7
- 2361 KX Warmond, Nederland
- KvK: 28055371
- Aanspreekpunt voor dit document: Dhr. M. Werkman, Warehouse Manager

Protest Sportwear is in de zin van de AVG de **verwerkingsverantwoordelijke** voor alle persoonsgegevens die in Astra worden vastgelegd. Dit betekent dat Protest Sportwear bepaalt welk doel en met welke middelen er gegevens verwerkt worden.

### 3.2 Verwerker

**Ascentra B.V.** — leverancier van het Astra-platform
- Oranjestraat 11, 9401 KE Assen
- KvK: 98227548
- *Operational excellence, engineered with intelligence*
- Contact beveiliging en privacy: `privacy@ascentra.nl`
- Meldpunt datalek (24/7): `incident@ascentra.nl`

Astra is de **verwerker** in de zin van artikel 28 AVG. Wij verwerken persoonsgegevens uitsluitend op basis van schriftelijke instructies van Protest Sportwear, zoals vastgelegd in de tussen partijen te sluiten **Verwerkersovereenkomst**.

### 3.3 Functionaris Gegevensbescherming

Ascentra heeft geen wettelijk verplichte Functionaris Gegevensbescherming aangesteld. De rol van eerste aanspreekpunt voor privacy- en beveiligingsvraagstukken wordt vervuld door **Alex Sinigaglia, oprichter van Ascentra B.V.**, bereikbaar via `privacy@ascentra.nl`.

### 3.4 Subverwerkers

Astra maakt gebruik van de volgende subverwerkers. Geen andere derde partijen krijgen toegang tot persoonsgegevens van Protest Sportwear.

| Subverwerker | Rol | Locatie data | Certificeringen | Juridische grondslag transfer |
|---|---|---|---|---|
| **Supabase Inc.** | Database (PostgreSQL) + authenticatie + opslag sessiecookies | EU (Frankfurt `eu-central-1` of Amsterdam `eu-west-1`) | SOC 2 Type II; HIPAA-capable (Enterprise); ISO 27001 via AWS-onderliggend | EU-hosting, geen transfer |
| **Vercel Inc.** | Applicatie-hosting (Next.js), serverless functies, CDN-edge | EU-regio (`fra1` / `cdg1`) voor serverless functies; globaal CDN voor statische assets zonder persoonsgegevens | SOC 2 Type II; ISO 27001; DPF gecertificeerd | Standard Contractual Clauses + aanvullende maatregelen voor eventuele supportdata |
| **Anthropic PBC** | AI-inferentie voor planningsadviezen en analyse (Claude) | VS (us-east) | SOC 2 Type II; GDPR-DPA beschikbaar | Standard Contractual Clauses (Module 2); zie §11 voor beperking persoonsgegevens in prompts |

**Wijzigingen in subverwerkers** worden minimaal 30 dagen van tevoren aan Protest Sportwear gemeld, met recht tot gemotiveerd bezwaar.

---

## 4. Omvang van de Verwerking

### 4.1 Doel van de verwerking

Astra verwerkt persoonsgegevens uitsluitend ten behoeve van:
1. Het opstellen, optimaliseren en beheren van dienstroosters en inzetplanningen;
2. Het registreren van verzuim, verlof en beschikbaarheidswijzigingen;
3. Het bijhouden van vaardigheden, certificeringen en training voor inzetbaarheid;
4. Het genereren van rapportages en voorspellingen voor de personeelsbehoefte;
5. Het aanbieden van AI-ondersteunde adviezen voor planningsbeslissingen (zie §11).

De gegevens worden **niet** gebruikt voor: marketing, profilering voor derden, training van AI-modellen, doorverkoop aan derden, of enig ander doel dat niet expliciet door Protest Sportwear is geïnstrueerd.

### 4.2 Categorieën persoonsgegevens

Op basis van het databaseschema verwerken wij de volgende categorieën. Deze lijst is uitputtend voor de huidige versie van het platform.

| Categorie | Veld(en) | Tabel | Bijzondere gegevens? |
|---|---|---|---|
| **Directe identificatoren** | `first_name`, `last_name`, `email`, `phone`, `employee_number` | `employee` | Nee |
| **Arbeidsverhouding** | `hire_date`, `termination_date`, `status`, `contract_type`, `weekly_hours_contracted` | `employee` | Nee |
| **Financieel (gevoelig)** | `hourly_rate`, `pay_grade` | `employee` | Nee, maar wél gevoelig |
| **Voorkeur en inzetbaarheid** | `preferences_json`, `is_multi_site_eligible`, `seniority_date` | `employee` | Nee |
| **Vaardigheden en certificering** | `proficiency_level`, `certification_date`, `expiry_date`, `training_hours_completed`, `assessment_notes` | `employee_skill` | Nee |
| **Verzuim en verlof** | `start_date`, `end_date`, `override_type`, `reason`, `status` | `employee_availability_override` | **Mogelijk** — zie hieronder |
| **Toegang (contactpersonen)** | `primary_contact_name`, `primary_contact_phone`, `billing_email` | `organization` | Nee |
| **Audit-metadata** | `actor_id`, `actor_ip_address`, `before_state`, `after_state` | `audit_log` | IP-adres = persoonsgegeven |
| **Sessie en authenticatie** | e-mail, gehashed wachtwoord, sessietokens | beheerd door Supabase Auth | Nee |

**Bijzondere categorieën (art. 9 AVG).** Het veld `reason` in de tabel `employee_availability_override` is een vrije-tekstveld. Afhankelijk van hoe Protest Sportwear dit invult, kán het gezondheidsgegevens bevatten (bijvoorbeeld "ziekteverlof wegens operatie"). Astra beveelt met klem aan om in dit veld uitsluitend neutrale verzuimcategorieën op te nemen (bijvoorbeeld "ziekte", "verlof", "bijzonder verlof") en géén medische details. Wij bieden Protest Sportwear ondersteuning bij het opstellen van een interne invulinstructie.

### 4.3 Betrokkenen

De betrokkenen wiens gegevens in Astra worden verwerkt zijn:
- Medewerkers van Protest Sportwear (inclusief uitzendkrachten en gedetacheerden, indien geregistreerd);
- Interne gebruikers (planners, supervisors, managers) van het platform;
- Contactpersonen bij Protest Sportwear voor contractuele communicatie.

### 4.4 Bewaartermijnen en retentie

| Datacategorie | Standaard bewaartermijn | Door klant configureerbaar |
|---|---|---|
| Actieve medewerkergegevens | Gedurende de looptijd van de overeenkomst | — |
| Medewerkers met status `terminated` | **30 dagen** na markering als beëindigd (standaard), daarna anonimisering of verwijdering | Ja, configureerbaar per organisatie |
| Audit-log | Gedurende de looptijd van de overeenkomst, onveranderbaar | Nee, wettelijk aanbevolen minimum |
| Planningshistorie en dienstroosters | Gedurende de looptijd van de overeenkomst | Ja, per categorie instelbaar |
| Accountgegevens na beëindiging contract | Volledig verwijderd binnen **30 kalenderdagen** na beëindiging, tenzij anders schriftelijk afgesproken | Ja, contractueel |
| Back-ups | Rollende 7 dagen Point-in-Time Recovery bij Supabase | Configureerbaar naar langere periode |

---

## 5. Infrastructuur en Hosting

### 5.1 Hostingomgeving

Astra draait **volledig in de Europese Unie**. Onze infrastructuur bestaat uit twee gescheiden lagen:

**Database-laag — Supabase (PostgreSQL 15+, tier: Pro)**
- Fysieke locatie: Frankfurt, Duitsland (`eu-central-1`) of Amsterdam, Nederland (`eu-west-1`) — afhankelijk van het voor Protest Sportwear in te richten project.
- Onderliggende infrastructuur: AWS EU-regio (Supabase is een managed PostgreSQL-laag bovenop AWS).
- Abonnementsniveau: **Supabase Pro**, zodat HaveIBeenPwned-integratie voor leaked-password detectie, 7 dagen Point-in-Time Recovery, en prioritaire ondersteuning bij incidenten beschikbaar zijn.
- Versleuteling at rest: AES-256 met door Supabase beheerde sleutels.
- Back-ups: dagelijkse back-ups met Point-in-Time Recovery tot op transactieniveau over de laatste 7 dagen (uit te breiden via Supabase PITR add-on op verzoek).
- Netwerkisolatie: de database is niet direct benaderbaar vanaf het publieke internet voor applicaties; verbindingen lopen via Supabase's gecontroleerde API-laag, behalve vanaf expliciet toegelaten beheer-IP-adressen.

**Applicatie-laag — Vercel (Next.js 16 op Node.js 20+)**
- Serverless functies: EU-regio (`fra1` voor Frankfurt).
- Statische assets: globaal CDN (bevat géén persoonsgegevens — alleen gecompileerde JavaScript en afbeeldingen).
- TLS: TLS 1.3 afgedwongen, HTTPS verplicht, automatische certificaatverlenging via Let's Encrypt.

**Wat dit concreet betekent voor Protest Sportwear:** geen persoonsgegevens van uw medewerkers worden opgeslagen op servers buiten de Europese Unie. De doorgifte aan Anthropic (zie §11) is een afzonderlijke verwerking die separaat is afgebakend en waarvoor specifieke beperkingen gelden.

### 5.2 Encryptie — volledige inventarisatie

| Laag | Algoritme / Standaard | Beheerd door |
|---|---|---|
| Data in rust — database | AES-256 | Supabase (AWS KMS-onderliggend) |
| Data in rust — back-ups | AES-256 | Supabase |
| Integratie-credentials (WMS/HRIS) — *toekomstige functionaliteit* | AES-256-GCM met per-organisatie sleutels via Supabase Vault (zie §5.4) | Astra, te implementeren vóór eerste koppeling |
| Data in rust — logs en audit-log | AES-256 | Supabase (dezelfde schijf-encryptie) |
| Data in transport — client → server | TLS 1.3 (minimaal TLS 1.2) | Vercel |
| Data in transport — server → database | TLS 1.3 | Supabase |
| Data in transport — server → Anthropic | TLS 1.3 met certificate pinning door Anthropic SDK | Anthropic |
| Wachtwoorden gebruikers | bcrypt met salt (beheerd door Supabase Auth, geen toegang voor Astra) | Supabase Auth |
| Sessiecookies | AES-GCM signed + versleuteld door `@supabase/ssr`, verzonden als `HttpOnly` `Secure` `SameSite=Lax` | Supabase SSR-bibliotheek |

### 5.3 Netwerk en firewallbeleid

- Het platform is uitsluitend bereikbaar via HTTPS. HTTP-verzoeken worden geweigerd dan wel geforceerd doorverwezen.
- De tRPC API (`/api/trpc/**`) weigert cross-origin verzoeken buiten de toegelaten domeinen op basis van Next.js' standaard same-origin beleid.
- Alle administratieve endpoints (bijvoorbeeld het toekennen van gebruikers aan een organisatie) vereisen zowel authenticatie als een minimum-rol van `tenant_admin`, en zijn niet bereikbaar voor gebruikers buiten de eigen organisatie.
- **Supabase Realtime** wordt door Astra minimaal gebruikt — uitsluitend voor één publicatie (`join_request`) die live statusupdates toont aan een gebruiker die in de onboarding-wachtrij zit. Deze tabel is RLS-beveiligd (zie migratie 00021): een gebruiker ziet uitsluitend zijn eigen rij, en tenant-admins van de doelorganisatie zien alleen pending requests voor hún organisatie. Er is geen andere realtime-publicatie actief. Toekomstige realtime features zullen dezelfde RLS-first aanpak volgen.

### 5.4 Integratie-credentials — huidige staat en te nemen maatregel vóór eerste koppeling

Het databaseschema bevat een tabel `integration_config` met een kolom `connection_params_encrypted BYTEA` die bedoeld is voor het opslaan van credentials van externe systemen (WMS, OMS, HRIS). Op de datum van dit document wordt deze kolom niet beschreven door applicatiecode. De tabel is een schemavoorziening die wordt geactiveerd op het moment dat de eerste externe systeemkoppeling wordt voorbereid.

**Wat dit betekent voor de huidige dreiging:**
Er bestaat op dit moment **geen risico** rondom lekken van integratie-credentials, omdat er simpelweg geen credentials in het systeem staan. Protest Sportwear en eventuele andere tenants hebben op dit moment geen externe integraties geconfigureerd.

**Wat dit betekent voor de toekomst:**
Voorafgaand aan de eerste externe systeemkoppeling bij Protest Sportwear wordt het schrijven naar `integration_config.connection_params_encrypted` geïmplementeerd met AES-256-GCM en met per-organisatie sleutels via Supabase Vault. Geen productie-koppeling met een extern systeem wordt geactiveerd zolang deze maatregel niet operationeel is. Deze voorwaarde is contractueel opgenomen in het Security Addendum.

**Waarom wij dit eerlijk benoemen in plaats van stilzwijgend verder te gaan:**
Het commentaar in de databasemigratie vermeldt *"AES-256-GCM encrypted. Per-tenant encryption keys"*. Dit commentaar is een aanduiding van de beoogde implementatie, niet van de feitelijke implementatie. Ascentra vermeldt deze nuance expliciet, omdat een claim die niet door applicatiecode wordt onderbouwd niet thuishoort in een verwerkingsdocument.

---

## 6. Multi-tenancy en tenant-isolatie

Deze sectie beschrijft de wijze waarop het Astra-platform de gegevens van Protest Sportwear afschermt van die van andere tenants en de wijze waarop persoonlijke toegang van Ascentra-personeel tot productiedata is beperkt en gedocumenteerd. De onderbouwing is technisch van aard en is in zijn geheel verifieerbaar in de broncode.

### 6.1 Tenant-model

Elke klantorganisatie (tenant) wordt gerepresenteerd door één record in de tabel `organization`, met een uniek `organization_id` (UUID). **Elke andere tabel** die persoonsgegevens of operationele data bevat, heeft een verplichte `organization_id`-kolom die verwijst naar de eigenaarsorganisatie. Dit zijn onder meer: `site`, `department`, `process`, `employee`, `employee_skill`, `employee_availability_override`, `shift_assignment`, `plan_version`, `audit_log`, `notification`, `integration_config`, en nog 10+ andere.

### 6.2 Row-Level Security — de technisch harde afscherming

Alle 20+ tabellen die klantdata bevatten zijn voorzien van **PostgreSQL Row-Level Security (RLS)**. RLS is een databasemechanisme dat op rij-niveau afdwingt welke records een gebruiker mag zien of wijzigen, ongeacht welke query de applicatie probeert uit te voeren.

De RLS-policies controleren bij elke database-operatie of het `organization_id` van de rij overeenkomt met het `organization_id` uit de JWT van de ingelogde gebruiker. Deze controle wordt uitgevoerd door een databasefunctie (`public.get_organization_id()`) die het `organization_id` uit de JWT-claims haalt. De functie is `STABLE` en kan niet worden omzeild door een aanvaller die de applicatielaag manipuleert.

**Concreet voorbeeld uit de codebase:**
```sql
CREATE POLICY emp_select ON employee
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY emp_modify ON employee
    FOR ALL USING (
        organization_id = public.get_organization_id()
        AND public.get_user_role() IN ('admin', 'owner')
    );
```

Dit betekent: ook al zou een kwaadwillende een query kunnen injecteren die probeert alle medewerkers uit de database te halen, de database geeft alleen de rijen terug die bij zijn eigen `organization_id` horen. Alle andere rijen zijn, vanuit het perspectief van die gebruiker, onzichtbaar.

### 6.3 Dubbele beveiliging in de applicatielaag

Bovenop RLS hanteert Astra een tweede beveiligingslaag in de tRPC-API. Elke API-procedure (en dat zijn er op dit moment 116) verifieert het `organization_id` van de aanvragende gebruiker en voegt dit handmatig toe aan elke query als `WHERE organization_id = ctx.organizationId`. Dit is een *defense in depth*-principe: ook als een ontwikkelaar per ongeluk een RLS-policy te ruim zou definiëren, vangt de applicatielaag die fout op.

### 6.4 Rollenhiërarchie binnen een tenant

Binnen één organisatie hanteren wij zeven rollen, met oplopende bevoegdheden:

| Rol | Niveau | Typische bevoegdheden |
|---|---|---|
| `super_admin` | 100 | Astra platform-beheer (zie §6.6) |
| `tenant_admin` | 90 | Volledige beheerrechten binnen de eigen organisatie |
| `site_manager` | 70 | Beheer van één of meer sites |
| `planner` | 50 | Opstellen en wijzigen van dienstroosters |
| `supervisor` | 40 | Dagelijkse sturing op toegewezen shift |
| `employee` | 20 | Inzage in eigen rooster |
| `viewer` | 10 | Alleen-lezen toegang |

Elke API-procedure specificeert expliciet welk minimum-rolniveau vereist is. De rolcontrole wordt zowel in de applicatielaag als in de RLS-policies van gevoelige tabellen (bijvoorbeeld `employee`, `integration_config`, `labor_rule`) afgedwongen.

### 6.5 Toegang tussen organisaties is technisch onmogelijk gemaakt

Het enige HTTP-endpoint dat in theorie een gebruiker aan een andere organisatie kan koppelen (`/api/admin/assign-org`) heeft drie cumulatieve controles:
1. De aanvrager moet minimaal `tenant_admin` zijn;
2. Het doel-`organization_id` moet overeenkomen met het eigen `organization_id`;
3. Alleen `super_admin` (Astra-platformbeheer) mag hiervan afwijken.

### 6.6 Toegang door Ascentra-personeel

Ascentra beschikt, zoals iedere SaaS-leverancier, over een `super_admin`-rol en een service-role sleutel waarmee de Row-Level Security technisch kan worden omzeild. Deze bevoegdheden zijn nodig voor het herstellen van back-ups, het onderzoeken van incidenten en het uitvoeren van schema-migraties; volledige eliminatie ervan is bij een beheerde SaaS-dienst niet realiseerbaar. De feitelijke werking en beheersing van deze bevoegdheden is als volgt geregeld.

**Opslag van de service-role sleutel.** De sleutel is uitsluitend aanwezig als versleutelde omgevingsvariabele binnen de productieomgeving van Vercel en wordt vanuit één enkel server-side bestand benaderd. De sleutel komt niet voor in broncode, niet in Git en niet op werkstations. Dit is verifieerbaar door een `git log` over `.env*`-paden, die uitsluitend het bestand `.env.example` retourneert.

**Routinematige toegang.** Ascentra-personeel beschikt in de reguliere werkzaamheden niet over toegang tot productiedata. Ontwikkelwerk vindt plaats tegen synthetische ontwikkeldatabases en tegen demo-tenants.

**Incident-toegang.** Persoonlijke toegang tot productiedata is uitsluitend toegestaan in geval van een kritiek incident of op expliciet verzoek van Protest Sportwear. Dergelijke toegang wordt gelogd in het Supabase-dashboard, dat voor Ascentra zelf onveranderbaar is, en wordt achteraf aan Protest Sportwear gerapporteerd.

**Contractuele beperking.** Ieder gebruik van Protest Sportwear-data anders dan strikt noodzakelijk voor het leveren van de dienst is op grond van de Verwerkersovereenkomst verboden en levert een direct opzegrecht voor Protest Sportwear op.

**Geheimhouding.** Personeel met productie-toegang is gebonden aan een geheimhoudingsverplichting die is opgenomen in de arbeidsovereenkomst dan wel in een afzonderlijke NDA. Op de datum van dit document is de oprichter de enige persoon binnen Ascentra met productie-toegang. Bij uitbreiding van het personeelsbestand wordt deze verplichting bij elke nieuwe arbeidsovereenkomst contractueel vastgelegd.

Ascentra spreekt zich niet uit over de absolute onmogelijkheid van toegang door een medewerker met kwade opzet — een dergelijke uitspraak zou bij geen enkele SaaS-leverancier juist zijn. Ascentra borgt vier punten: (i) dergelijke toegang maakt geen deel uit van enig regulier bedrijfsproces, (ii) elke toegang levert een onveranderbare audit-trail op, (iii) de autorisatie is contractueel beperkt, en (iv) Ascentra rapporteert hierover transparant aan de verwerkingsverantwoordelijke.

---

## 7. Authenticatie en Sessiebeheer

### 7.1 Inlogproces

Astra gebruikt **Supabase Auth** voor gebruikersauthenticatie. Dit betekent dat wachtwoorden nooit door Astra-code worden gezien of verwerkt. Het proces verloopt als volgt:

1. De gebruiker voert zijn e-mailadres en wachtwoord in op de inlogpagina.
2. Deze gegevens worden via TLS 1.3 rechtstreeks naar Supabase Auth gestuurd (via de officiële `@supabase/ssr` bibliotheek).
3. Supabase verifieert het wachtwoord tegen de met bcrypt versleutelde hash. Het platte wachtwoord wordt nergens opgeslagen.
4. Bij succes geeft Supabase een **JSON Web Token (JWT)** terug, dat wordt opgeslagen in een `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
5. Het JWT bevat onder meer `organization_id`, `role` en `site_ids`, en is ondertekend door Supabase.

### 7.2 Verificatie per verzoek

Bij elke API-aanroep voert Astra een server-side validatie uit door Supabase Auth's `auth.getUser()` aan te roepen. Dit is een volledige cryptografische verificatie tegen de Supabase-service, geen alleen-lokale decodering. Verlopen of ongeldige sessies worden onmiddellijk geweigerd.

### 7.3 Wachtwoordbeleid

Het wachtwoordbeleid is ingesteld in de productie-omgeving van Supabase Auth (tier: **Pro**) en omvat vijf onafhankelijke beschermingsmaatregelen:

- **Minimaal 12 tekens.** Kortere wachtwoorden worden bij registratie of wachtwoordwijziging geweigerd.
- **Verplichte tekenklassen.** Elk wachtwoord moet minstens één kleine letter, één hoofdletter, één cijfer en één speciaal teken bevatten. Wachtwoorden die niet aan deze eis voldoen worden geweigerd.
- **Automatische detectie van gelekte wachtwoorden via HaveIBeenPwned.** Bij elke registratie en wachtwoordwijziging controleert Supabase Auth het opgegeven wachtwoord tegen de Pwned Passwords database van HaveIBeenPwned. Deze controle gebruikt het **k-anonimiteit-protocol**: alleen de eerste vijf tekens van de SHA-1 hash van het wachtwoord worden aan HaveIBeenPwned verstuurd, nooit het wachtwoord zelf en nooit de volledige hash (zie [haveibeenpwned.com/API/v3#PwnedPasswords](https://haveibeenpwned.com/API/v3#PwnedPasswords)). Wachtwoorden die bekend zijn uit publieke datalekken worden geweigerd.
- **Secure password change.** Een gebruiker moet recent (binnen 24 uur) zijn ingelogd om zijn eigen wachtwoord te mogen wijzigen. Dit voorkomt dat een aanvaller die een slapende sessie bemachtigt het wachtwoord kan wijzigen en de rechtmatige gebruiker buitensluit.
- **Verplichte opgave van het huidige wachtwoord bij wijziging.** Ook binnen een geldige sessie moet de gebruiker zijn huidige wachtwoord invoeren om een nieuw wachtwoord in te stellen.

**Hash-algoritme.** Wachtwoorden worden door Supabase Auth opgeslagen als bcrypt-hash met salt. Astra heeft geen toegang tot het leesbare wachtwoord op enig moment, zelfs niet tijdens het inlogproces.

**Multi-factor authenticatie.** Beschikbaar via Supabase Auth en op verzoek per gebruiker te activeren. Wij adviseren Protest Sportwear om MFA verplicht te stellen voor alle rollen vanaf `planner` (rang 50) en hoger.

**Secure email change.** Wijzigingen van het e-mailadres van een gebruiker worden geverifieerd op zowel het oude als het nieuwe adres, waarmee een aanvaller die tijdelijk toegang heeft tot één van beide mailboxen geen onomkeerbare account-takeover kan uitvoeren.

### 7.3.1 Overgangsregeling voor bestaande wachtwoorden

De hierboven beschreven regels voor minimum-lengte, verplichte tekenklassen en controle tegen HaveIBeenPwned worden door Supabase Auth afgedwongen op het moment dat een wachtwoord wordt **gezet of gewijzigd**. Bestaande wachtwoorden die vóór de aanscherping van het beleid zijn aangemaakt (en die mogelijk korter of eenvoudiger waren) blijven tot hun eerstvolgende wijziging geldig. Dit is standaardgedrag van Supabase Auth en van vrijwel alle authenticatieplatforms: het tegenovergestelde zou neerkomen op een collectieve account-lockout, wat vanuit een AVG-perspectief (beschikbaarheid, art. 32) ongewenst is.

**Hoe Astra hiermee omgaat richting Protest Sportwear:**

1. **Bij go-live** sturen wij aan alle Protest Sportwear-gebruikers een verplichte "first login password reset" per e-mail. Tijdens deze reset wordt het nieuwe, strengere wachtwoordbeleid volledig afgedwongen. Na voltooiing hiervan voldoet het volledige gebruikersbestand aan de regels in §7.3.
2. **Voor de interne Astra-accounts** die reeds vóór deze aanscherping bestonden wordt dezelfde reset-cyclus uitgevoerd als onderdeel van de pre-go-live checklist.
3. **Periodieke heraanscherping.** Als in de toekomst het beleid verder wordt aangescherpt (bijvoorbeeld naar 14 tekens, of met een verplichte passphrase-structuur) voeren wij dezelfde verplichte-reset procedure uit.

### 7.4 Sessiebeveiliging — concreet

- **HttpOnly-cookies:** JavaScript in de browser kan de sessie-token niet benaderen, waarmee XSS-aanvallen de sessie niet kunnen stelen.
- **Secure-vlag:** cookies worden uitsluitend over HTTPS verzonden.
- **SameSite=Lax:** cookies worden niet meegestuurd bij cross-site POST-verzoeken, waarmee standaard-CSRF wordt voorkomen.
- **JSON content-type:** alle tRPC-verzoeken zijn `application/json`, wat een CORS-preflight triggert voor cross-origin verzoeken — een additionele CSRF-bescherming.

### 7.5 Wat wij **niet** claimen

Wij passen **geen** expliciete CSRF-tokenregistratie per verzoek toe. Onze CSRF-bescherming leunt op de combinatie van SameSite-cookies en het `application/json` content-type, wat een algemeen geaccepteerd patroon is voor tRPC-gebaseerde applicaties. Wij noemen dit expliciet om misverstand te voorkomen.

---

## 8. Autorisatie en Toegangscontrole

Toegangscontrole wordt in Astra op drie lagen afgedwongen:

**Laag 1 — Authenticatie-middleware (proxy).** Niet-geauthenticeerde verzoeken naar beschermde paden (`/dashboard`, `/plan`, etc.) worden doorverwezen naar de inlogpagina. Dit gebeurt in onze Next.js proxy op elk inkomend HTTP-verzoek.

**Laag 2 — API-procedure gates.** Elke tRPC-procedure verklaart expliciet welk type gebruiker hem mag aanroepen: `protectedProcedure` (elke ingelogde gebruiker), `plannerProcedure` (minimaal planner-rol), `adminProcedure` (minimaal tenant_admin), enzovoort. Aanvragen die niet aan de rolvereiste voldoen worden geweigerd met een `FORBIDDEN`-fout, zonder dat de onderliggende data wordt aangeraakt.

**Laag 3 — Row-Level Security op de database.** Zelfs als lagen 1 en 2 onverhoopt gepasseerd zouden worden, blokkeert de database de query op rijenniveau. Voor gevoelige tabellen (`employee`, `integration_config`, `labor_rule`) is ook de rolcontrole in de RLS-policy opgenomen: niet-admins kunnen niet schrijven, ongeacht welke API-aanroep wordt gedaan.

---

## 9. Invoervalidatie en Bescherming tegen Injectie

**Invoervalidatie (strong).** Alle 116 tRPC-API-procedures valideren hun input met **Zod** — een TypeScript-first schemavalidator. Dit betekent dat bijvoorbeeld een verzoek dat een tekst probeert door te geven waar een UUID wordt verwacht, of een negatief getal waar een positief getal wordt verwacht, vóór elke businesslogica wordt geweigerd. De validatie gebeurt server-side; client-side validatie wordt als pure UX-ondersteuning beschouwd en is nooit vertrouwd.

**SQL-injectie (strong).** Astra construeert nooit SQL-strings met string-concatenatie. Alle databasetoegang loopt via Supabase's geparametriseerde query-builder (`.eq()`, `.insert()`, `.select()`, etc.). Een SQL-injectievector bestaat niet in de huidige codebase.

**XSS (strong).** React voert standaard HTML-escaping uit op alle gerenderde waarden. Een volledige scan van de codebase op gevaarlijke patronen (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) geeft **nul treffers**. Daarmee is de applicatie intrinsiek beschermd tegen klassieke XSS-aanvallen.

**Bestandsupload (CSV — adequate).** CSV-import verloopt via de `papaparse`-bibliotheek met strikte instellingen (`header: true`, `skipEmptyLines: true`). Papaparse interpreteert geen formules en voert geen shellopdrachten uit; het retourneert uitsluitend plain strings. Geen padmanipulaties worden uitgevoerd op door de gebruiker opgegeven bestandsnamen.

**Excel-bestandsverwerking.** De voorheen gebruikte `xlsx`-bibliotheek (SheetJS), met twee niet door upstream verholpen HIGH-severity kwetsbaarheden (GHSA-4r6h-8v6p-xvw6, prototype pollution; GHSA-5pgg-2g8v-p4x9, ReDoS), is volledig vervangen door `exceljs`. De vervanging is uitgevoerd op alle zes call sites waar Excel-bestanden worden gelezen of gegenereerd: de AI demand-analyzer (`src/lib/demand/xray.ts`), de twee client-side uploadcomponenten (demand-upload-wizard en drag-and-drop zone), de employees-importwizard, en de bijbehorende unit-test suite. De elf unit-tests slagen na migratie. `npm audit` rapporteert nul HIGH-severity kwetsbaarheden in productie-dependencies; de vier resterende moderate-severity meldingen betreffen uitsluitend `vitest`, `vite` en `esbuild` als devDependencies, zonder runtime-impact.

---

## 10. Audit Logging

### 10.1 Wat wordt gelogd

Astra onderhoudt een **onveranderbare audit-logtabel** (`audit_log`) die wijzigingen registreert op zes categorieën gevoelige gegevens:

1. `employee` — alle mutaties op medewerkersgegevens
2. `employee_skill` — toekenning en wijziging van vaardigheden
3. `employee_availability_override` — verzuim en verlof
4. `plan_version` — versies van planningen
5. `shift_assignment` — toewijzing van medewerkers aan diensten
6. `labor_rule` — arbeidsregels en wettelijke beperkingen

Voor elke wijziging legt het systeem vast: wie (`actor_id`), vanaf welk IP (`actor_ip_address`), wanneer, welke actie (`INSERT` / `UPDATE` / `DELETE`), op welke entiteit, en een complete snapshot van de waarden vóór en na de wijziging (`before_state`, `after_state` in JSONB).

### 10.2 Onveranderbaarheid

De audit-logtabel is technisch onveranderbaar gemaakt: een databasetrigger (`trg_audit_log_immutable`) werpt een fatale exceptie bij elke poging tot `UPDATE` of `DELETE`. Zelfs een kwaadwillende met directe databasetoegang kan zijn sporen niet wissen zonder de trigger zelf te verwijderen, wat op zijn beurt een `DDL`-operatie is die door Supabase wordt gelogd.

### 10.3 Attributie van service-role mutaties

Mutaties die de Astra-serverlaag uitvoert via een service-role verbinding (de AI-chat tool-functies, de tRPC-routers die om prestatieredenen de Row-Level Security overslaan, en de administratieve HTTP-endpoints) worden gegarandeerd toegerekend aan de oorspronkelijke gebruiker in de audit-log. Deze attributie wordt bewerkstelligd door drie gekoppelde maatregelen.

**Triggerfunctie met actor-header.** De triggerfunctie `fn_audit_trigger()` bepaalt het veld `actor_id` in de volgende volgorde (zie migratie [`00018_audit_actor_fix.sql`](../../supabase/migrations/00018_audit_actor_fix.sql)):

1. `request.headers ->> 'x-actor-id'` — een HTTP-header die de applicatie meezendt bij iedere service-role databaseverbinding namens de oorspronkelijke eindgebruiker;
2. `request.jwt.claims ->> 'sub'` — de JWT-claim die PostgREST doorgeeft langs het reguliere tRPC-pad;
3. `NULL` — uitsluitend voor systeem- of cron-processen zonder gebruikerscontext.

**Helper in de applicatielaag.** De functie `createAdminClientForUser(userId)` in [`src/lib/supabase/admin.ts`](../../src/lib/supabase/admin.ts) instantieert een service-role Supabase-client die bij iedere HTTP-request naar PostgREST automatisch de header `x-actor-id: <uuid>` meezendt. De helper is uitgerold op alle code-paden die namens een eindgebruiker muteren: de AI-chat (`src/app/api/ai/chat/route.ts`) en de vijf tRPC-routers (`workforce`, `absence`, `planning`, `scenario`, `admin`) die schrijven naar één van de zes audit-gekoppelde tabellen. De ongewijzigde functie `createAdminClient()` blijft beschikbaar voor cron- en systeemprocessen zonder gebruikerscontext.

**Expliciete audit-log voor administratieve endpoints.** Het endpoint `/api/admin/assign-org`, dat een gebruiker aan een organisatie toewijst, opereert op de tabel `auth.users` die buiten de scope van `fn_audit_trigger` valt. Dit endpoint schrijft expliciet een rij naar `audit_log` met `entity_type = 'auth.user'` en `action = 'ASSIGN_ORG'`, voorzien van de volledige voor- en na-staat van de metadata, inclusief het e-mailadres van het doel-account en de rol van de aanroeper.

**Verifieerbaarheid.** Na een wijziging via de AI-chat of via een tRPC-mutatie bevat de corresponderende rij in `audit_log` de `actor_id` van de uitvoerende gebruiker. De controle is reproduceerbaar door een gebruiker met de rol `tenant_admin` een kleine wijziging te laten uitvoeren en vervolgens de query `SELECT actor_id, entity_type, action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 1` uit te voeren.

---

## 11. AI-verwerking en gegevensminimalisatie

Het Astra-platform maakt op drie plaatsen gebruik van het taalmodel Claude van Anthropic PBC. De volgende paragrafen beschrijven welke gegevens per endpoint daadwerkelijk worden verzonden, welke beheersmaatregelen op die gegevensstroom van toepassing zijn, en op welke wijze de naleving van de AVG wordt gewaarborgd.

### 11.1 Overzicht van AI-integraties

| Endpoint | Model | Verzonden gegevens | Persoonsgegevens |
|---|---|---|---|
| `/api/ai/demand-analyze` | `claude-haiku-4-5` | Structuur van een geüpload Excel- of CSV-bestand: kolomnamen en enkele voorbeeldrijen | Nee — alleen bestandsmetadata |
| `/api/ai/insights-analyze` | `claude-sonnet-4` | Aggregaten: aantallen actieve verzuimmeldingen, totaal aantal medewerkers, afdelingsnamen, weerdata | Nee — uitsluitend aggregaten |
| `/api/ai/chat` | Claude (SDK-standaard) | Door de gebruiker getypte berichten en tool-resultaten | Beperkt; zie sectie 11.3 |

### 11.2 Aggregaat-only verwerkingen

De endpoint `/api/ai/insights-analyze`, die de adviezen in het dashboard genereert, verzendt uitsluitend aggregaten en tellingen naar Claude (bijvoorbeeld het aantal actieve verzuimmeldingen, het totaal aantal medewerkers en de afdelingsnaam). Individuele namen, individuele verzuimredenen of medische gegevens worden niet meegezonden. Deze verwerking voldoet aan het beginsel van dataminimalisatie zoals vervat in artikel 5 lid 1 onderdeel c AVG.

De endpoint `/api/ai/demand-analyze` verzendt uitsluitend bestandsstructuur-metadata en een beperkt aantal voorbeeldrijen ten behoeve van kolomherkenning. Demand-forecasts bestaan in de praktijk uit volumes en uren en bevatten geen persoonsgegevens; de prompt bevat dientengevolge geen persoonsgegevens.

### 11.3 Pseudonimisering van persoonsgegevens richting Anthropic

Voor de onboarding-chatassistent (`/api/ai/chat`) hanteert Ascentra een pseudonimiseringsarchitectuur die voorkomt dat tool-functies die door het Claude-model worden aangeroepen ooit een directe identificator (voornaam, achternaam, e-mailadres of telefoonnummer) van een medewerker te zien krijgen.

**Werking.** Voordat het resultaat van een databasequery door de AI-laag wordt doorgegeven, passeert het de centrale anonimiseringsmodule (`src/lib/ai/anonymizer.ts`). Deze module verwijdert alle direct identificerende velden — `first_name`, `last_name`, `full_name`, `email`, `phone` — en vervangt ze door een stabiel, leesbaar pseudoniem in de vorm `Medewerker A3F2`. Het pseudoniem wordt gegenereerd via HMAC-SHA-256 over het employee-id, met als sleutel een per-organisatie geheime salt. Het taalmodel ontvangt uitsluitend dit pseudoniem; de werkelijke naam blijft in de PostgreSQL-database in Frankfurt of Amsterdam.

**Eigenschappen van de pseudonimisering.**

1. *Stabiel binnen een organisatie.* Eenzelfde medewerker krijgt altijd hetzelfde pseudoniem, zodat het taalmodel consistent kan redeneren binnen één conversatie.
2. *Tenant-gescheiden.* Pseudoniemen verschillen tussen organisaties; zelfs identieke interne employee-id's leveren niet-correlerende pseudoniemen op tussen tenants.
3. *Niet-omkeerbaar.* Het pseudoniem kan niet worden herleid tot een naam zonder gelijktijdige toegang tot zowel de database als de organisatie-specifieke HMAC-sleutel.
4. *Direct leesbaar.* Pseudoniemen zijn ergonomisch genoeg om zonder reverse-mapping in de gebruikersinterface te worden getoond.

De vier tool-functies die met medewerkergegevens werken (`listEmployees`, `addEmployee`, `bulkAddEmployees`, `crossTrainSuggestion`) maken uitsluitend gebruik van deze module en retourneren uitsluitend pseudoniemen. De functie `crossTrainSuggestion` haalt zelfs geen `first_name`- of `last_name`-velden meer op uit de database; uitsluitend het employee-id wordt opgehaald en vervolgens omgezet naar een pseudoniem.

**Door de gebruiker zelf ingevoerde namen.** Wanneer een gebruiker tijdens een onboarding-sessie in de chat zelf een naam intypt (bijvoorbeeld *"voeg Jan Jansen toe als full-time picker"*), bevat dat gebruikersbericht de letterlijke naam. Deze gegevensverstrekking wordt geïnitieerd door de verwerkingsverantwoordelijke binnen de uitvoering van zijn taak en is vergelijkbaar met de invoer in een willekeurige andere applicatie. De respons van de tool-functie bevat na de pseudonimisering geen namen meer, zodat de naam in vervolgstappen van dezelfde conversatie niet opnieuw door het taalmodel wordt verwerkt.

**Gevolgen onder de AVG.**

- Persoonsgegevens worden vanuit de databaselaag niet in identificerende vorm verzonden naar Anthropic. De doorgifte naar derde land beperkt zich tot pseudoniemen en operationele metadata.
- Voor door de gebruiker zelf ingevoerde namen geldt dat de doorgifte plaatsvindt op grond van de Standard Contractual Clauses (Module 2) in de Verwerkersovereenkomst met Anthropic en op grond van de instructie van de verwerkingsverantwoordelijke.
- Voor de bescherming van naam- en contactgegevens uit de databaselaag is een Zero Data Retention-overeenkomst met Anthropic niet noodzakelijk gezien de gehanteerde architectuur. Ascentra kan een dergelijke overeenkomst desgewenst nog als aanvullende beheersmaatregel afsluiten.

**Verifieerbaarheid.** De implementatie is geconcentreerd in twee bestanden en kan tijdens een technische due-diligence worden gecontroleerd:

- `src/lib/ai/anonymizer.ts` — de pseudonimiseringsmodule;
- `src/app/api/ai/chat/route.ts` — de tool-handlers, met inline-commentaar `// PII redaction` op de plekken waar de module wordt aangeroepen.

### 11.4 Uitsluiting van modeltraining

Het standaardbeleid van de Anthropic API en het toepasselijke verwerkingscontract bepalen dat data die via de API wordt verzonden niet wordt gebruikt voor het trainen van Anthropic's modellen. Dit onderscheid is fundamenteel ten opzichte van consumentendiensten als ChatGPT en is voor de in dit document beschreven verwerking van toepassing.

### 11.5 Uitsluiting van geautomatiseerde besluitvorming (artikel 22 AVG)

De AI-laag van het Astra-platform adviseert; zij neemt geen bindende beslissingen met rechtsgevolgen of vergelijkbaar aanzienlijke gevolgen voor medewerkers. Iedere wijziging in dienstroosters, planningen of medewerkergegevens vereist een handmatige bevestiging door een gebruiker met de rol `planner` of `tenant_admin`. Artikel 22 AVG inzake geautomatiseerde individuele besluitvorming is dientengevolge op de in dit document beschreven verwerkingen niet van toepassing.

---

## 12. AVG/GDPR — Naleving per Artikel

### 12.1 Grondslag voor verwerking (art. 6)

Astra verwerkt persoonsgegevens namens Protest Sportwear. De rechtsgrondslag voor de verwerking is primair:
- **Art. 6 lid 1 sub b AVG** — noodzakelijk voor de uitvoering van de arbeidsovereenkomst;
- **Art. 6 lid 1 sub c AVG** — voor zover de verwerking nodig is voor wettelijke verplichtingen van Protest Sportwear als werkgever (bijvoorbeeld arbeidstijdenregistratie);
- **Art. 6 lid 1 sub f AVG** — gerechtvaardigd belang van Protest Sportwear bij een efficiënte personeelsplanning, getoetst aan de belangen en rechten van betrokkenen.

De afweging van deze grondslagen is de verantwoordelijkheid van Protest Sportwear als verwerkingsverantwoordelijke. Astra ondersteunt Protest Sportwear desgewenst bij het opstellen van een register van verwerkingsactiviteiten (art. 30 AVG).

### 12.2 Rechten van betrokkenen (art. 15-22)

Astra ondersteunt Protest Sportwear in het faciliteren van de volgende rechten. In de meeste gevallen is de verantwoordelijkheid contractueel bij Protest Sportwear belegd, met technische ondersteuning door Astra.

| Recht | Ondersteuning |
|---|---|
| **Recht op inzage** (art. 15) | Een `tenant_admin` kan van elke medewerker een volledig overzicht uit het systeem genereren. Een data subject access request-export (JSON/CSV) op verzoek van Protest Sportwear wordt door Astra binnen 5 werkdagen geleverd. |
| **Recht op rectificatie** (art. 16) | Alle medewerkervelden kunnen door bevoegde gebruikers worden gewijzigd via de standaard-UI. Wijzigingen worden in de audit-log vastgelegd. |
| **Recht op vergetelheid** (art. 17) | **Gerealiseerd.** De `eraseEmployee` tRPC-procedure (toegankelijk voor `tenant_admin` en hoger) voert een anonimisering uit die direct identificerende velden verwijdert (`first_name` → `'VERWIJDERD'`, `last_name` → `'VERWIJDERD'`, `email`/`phone` → `NULL`, `preferences_json`/`metadata_json` → `{}`) terwijl niet-identificerende gegevens (employee_number, contract_type, hourly_rate, werktijden) behouden blijven voor historische planning en loonkosten. De getroffen rij krijgt `deleted_at` + `deleted_by` (migratie 00020) zodat DSAR-uitvoeringen audit-baar zijn. Elke erasure wordt dubbel gelogd: via de bestaande `fn_audit_trigger` (onveranderbaar, met volledige voor/na-snapshot) én via een expliciete `audit_log`-rij met `action = 'ERASE'`, de reden van de erasure, en de oorspronkelijke naam in `metadata_json`. |
| **Recht op beperking van verwerking** (art. 18) | Via status `suspended` kan een medewerker worden uitgesloten van planning zonder verwijdering. |
| **Recht op overdraagbaarheid** (art. 20) | Astra levert op verzoek van Protest Sportwear een gestructureerde export (CSV of JSON) van alle data van een betrokkene binnen 5 werkdagen. |
| **Recht van bezwaar** (art. 21) | Zie §11.5 — er is geen geautomatiseerde besluitvorming met rechtsgevolgen; hiermee is het recht van bezwaar in praktijk beperkt tot uitzondering op verwerkingsdoelen, te regelen door Protest Sportwear als werkgever. |
| **Art. 22 — geautomatiseerde besluitvorming** | Niet van toepassing, zie §11.5. |

### 12.3 Dataminimalisatie (art. 5 lid 1 sub c)

Astra verzamelt uitsluitend velden die noodzakelijk zijn voor personeelsplanning. Optionele velden (bijvoorbeeld `phone`, `email`) zijn niet verplicht; Protest Sportwear kan zelf bepalen welke velden worden ingevuld. Wij adviseren om het vrije-tekstveld `reason` (verzuimreden) **niet** te gebruiken voor medische details (zie §4.2).

### 12.4 Opslagbeperking (art. 5 lid 1 sub e)

Zie §4.4 voor de bewaartermijnen.

### 12.5 Integriteit en vertrouwelijkheid (art. 5 lid 1 sub f)

Zie §5 (encryptie), §6 (tenant-isolatie), §10 (audit logging).

### 12.6 Verantwoordingsplicht (art. 5 lid 2)

Dit document is onderdeel van de verantwoording die Astra aan Protest Sportwear aflegt. Wij leveren op verzoek aanvullende documentatie zoals:
- Register van verwerkingsactiviteiten (art. 30);
- Data Protection Impact Assessment (DPIA) template;
- Sub-verwerkerslijst met DPA's;
- Certificaten en SOC 2-rapporten van subverwerkers;
- Rapportage van beveiligingsincidenten (indien van toepassing).

---

## 13. Incident Response en Datalekken

### 13.0 Logging en log-retentie voor incident-reconstructie

**Structured server-side logging.** Astra gebruikt een centrale `logger`-module (`src/lib/logger.ts`) die alle significante server-side events als gestructureerde JSON-records uitschrijft in plaats van vrije console-strings. Elk event heeft minimaal een `level`, `event`-naam, `timestamp`, `service`-identifier, en structured context. Dit maakt logs direct doorzoekbaar in elk downstream systeem.

**Automatische PII-redactie.** De logger past vóór het schrijven een redactor toe op bekende gevoelige veldnamen (`password`, `token`, `email`, `first_name`, `last_name`, `phone`, `authorization`, etc.) en vervangt de waarden door `[REDACTED]`. Dit is een defense-in-depth maatregel bovenop de basisregel "geen PII in logs". De redactor werkt recursief op nested objects.

**Externe log-shipping (optioneel).** Wanneer de omgevingsvariabelen `LOG_INGEST_URL` en `LOG_INGEST_TOKEN` zijn geconfigureerd, worden events parallel gestuurd naar een externe log-ingestion endpoint (Betterstack, Axiom, Datadog, of een vergelijkbare dienst — het formaat is provider-agnostisch JSON met Bearer-authenticatie). De call is **fire-and-forget** met een timeout van 2 seconden, zodat een falende externe dienst nooit invloed heeft op de request-latency.

**Retentie.** Zonder externe shipping worden logs bewaard voor de standaard Vercel-retentie (afhankelijk van abonnement, doorgaans 1-7 dagen). Met externe shipping wordt retentie bepaald door de provider; Betterstack Free biedt 3 dagen, betaalde tiers tot 30 dagen of langer. Dit maakt reconstructie van incidenten tot de vastgestelde retentieperiode mogelijk.

**Events die minimaal worden gelogd:**
- `rate_limit_backend_error` — Upstash rate-limiter uitval (fail-open)
- `contact_submission_stored` / `contact_persistence_failed` / `contact_unexpected_error`
- `assign_org_completed` / `assign_org_audit_write_failed`
- `erasure_completed` / `erasure_audit_write_failed`

Additionele events kunnen door de applicatiecode worden toegevoegd zonder de logger-architectuur te wijzigen.

---

### 13.1 Procedure

Astra hanteert de volgende standaardprocedure bij een vermoedelijk beveiligingsincident of datalek:

| Fase | Termijn | Actie |
|---|---|---|
| **Detectie** | Onmiddellijk | Monitoring, logboeken, melding door gebruiker, of melding door subverwerker |
| **Triage** | Binnen 2 uur | Beoordeling ernst, afbakening scope, vastleggen indicatoren |
| **Containment** | Binnen 4 uur | Isoleren getroffen systemen, revoken credentials, blokkeren accounts indien nodig |
| **Notificatie aan verwerkingsverantwoordelijke** | **Binnen 24 uur na vaststelling** | Schriftelijke melding aan Protest Sportwear aan het door u aangewezen contactpunt |
| **Forensisch onderzoek** | Binnen 72 uur | Reconstructie op basis van audit-log, database-logs en infrastructuurlogs |
| **Rapportage betrokken categorieën** | Binnen 72 uur na vaststelling | Wij leveren u de informatie die u nodig heeft voor uw eigen melding aan de Autoriteit Persoonsgegevens (art. 33 AVG) |
| **Eradication & recovery** | Afhankelijk van ernst | Herstel uit back-up, patchen, hardenen |
| **Post-mortem** | Binnen 14 dagen | Schriftelijk incidentrapport, root cause, en maatregelen |

### 13.2 Meldtermijn aan de Autoriteit Persoonsgegevens

Het is in de AVG (art. 33) een verantwoordelijkheid van de **verwerkingsverantwoordelijke** — Protest Sportwear — om een datalek binnen 72 uur aan de Autoriteit Persoonsgegevens te melden. Astra ondersteunt Protest Sportwear hierin door binnen 24 uur na vaststelling van een incident de vereiste informatie te leveren, zodat Protest Sportwear ruim binnen de 72-uurstermijn aan zijn meldplicht kan voldoen.

### 13.3 Contactpunt datalek

**Ascentra meldpunt datalek:** `incident@ascentra.nl` — bij urgentie ook `privacy@ascentra.nl`. Wij streven naar bevestiging van ontvangst binnen één uur tijdens kantooruren en uiterlijk binnen drie uur daarbuiten.
**Protest Sportwear contactpunt:** Dhr. M. Werkman, Warehouse Manager — `[INVULLEN door Protest Sportwear: e-mailadres, telefoonnummer]`

---

## 14. Secure Development Lifecycle

### 14.1 Processen

- **Verplichte code-review.** Wijzigingen worden niet in productie gebracht zonder review door een tweede persoon.
- **Type-veilige code.** De gehele codebase is in TypeScript geschreven onder `strict mode`, waarmee een breed scala aan runtime-fouten in een vroegtijdig stadium wordt afgevangen.
- **Continue afhankelijkheidsscanning.** `npm audit` wordt geautomatiseerd uitgevoerd via de CI-pipeline; pull requests die een nieuwe HIGH- of CRITICAL-severity introduceren worden geblokkeerd. De actuele status is opgenomen in sectie 9.
- **Secrets management.** Credentials voor de database, voor Anthropic en voor Vercel worden uitsluitend beheerd als versleutelde omgevingsvariabelen binnen Vercel. Credentials zijn niet aanwezig in broncode of in de Git-historie.
- **Synthetische ontwikkel- en testdata.** Ontwikkelwerk vindt plaats tegen synthetische datasets en demo-tenants; productiedata wordt niet voor ontwikkeldoeleinden geraadpleegd.
- **Minimale rechten voor CI/CD.** De deployment-pipeline beschikt niet over leesrechten op productiedata.

### 14.2 Penetratietesten

Op de datum van dit document is geen externe penetratietest op het Astra-platform uitgevoerd. Op verzoek van Protest Sportwear wordt voorafgaand aan de productie-uitrol een externe penetratietest uitgevoerd door een gekwalificeerde partij (Computest, Fox-IT, Zerocopter of vergelijkbaar). Het rapport wordt onder geheimhouding aan Protest Sportwear ter beschikking gesteld. De voorwaarden zijn opgenomen in artikel 4 van het Security Addendum.

---

## 15. Beveiligingsmaatregelen — overzicht

Onderstaand overzicht beschrijft de technische en organisatorische beveiligingsmaatregelen die op de datum van dit document deel uitmaken van het Astra-platform. Iedere maatregel is herleidbaar tot een specifiek bestand of een specifieke configuratie en kan tijdens een technische due-diligence worden gecontroleerd. Twee posten — een externe penetratietest en de encryptie van integratie-credentials — kennen een afwijkende status die in de tabel is aangegeven en in de bijbehorende sectie nader is toegelicht.

| Domein | Maatregel | Onderbouwing |
|---|---|---|
| Multi-tenant isolatie | PostgreSQL Row-Level Security op alle tabellen met klantdata, in combinatie met een tweede expliciet `organization_id`-filter in de tRPC-laag (defense in depth). | Sectie 6 |
| Data-residentie | Verwerking en opslag binnen de Europese Unie (Frankfurt of Amsterdam), zowel op database- als op applicatieniveau. | Sectie 5.1 |
| Versleuteling in rust | AES-256 voor databaseopslag, audit-logs en back-ups. | Sectie 5.2 |
| Versleuteling in transport | TLS 1.3 voor alle netwerkverbindingen, met afdwinging via `Strict-Transport-Security`. | Sectie 5.2 |
| Authenticatie | Server-side JWT-verificatie per verzoek, met `HttpOnly`, `Secure` en `SameSite=Lax` sessiecookies beheerd door `@supabase/ssr`. | Sectie 7 |
| Wachtwoordbeleid | Minimaal twaalf tekens, verplichte tekenklassen, geautomatiseerde detectie van gelekte wachtwoorden via HaveIBeenPwned, secure password change en verplicht huidig wachtwoord bij wijziging. | Sectie 7.3 |
| Autorisatie | Rolgebaseerde toegangscontrole met zeven rollen, afgedwongen op zowel applicatielaag als in Row-Level Security policies van gevoelige tabellen. | Sectie 8 |
| Invoervalidatie | Getypeerde Zod-schema's op alle 116 server-side API-procedures; geparametriseerde query-builders voor alle databasequeries. | Sectie 9 |
| Bescherming tegen XSS | React-escaping op alle gerenderde waarden; afwezigheid van `dangerouslySetInnerHTML`, `innerHTML`, `eval` en `new Function` in de codebase. | Sectie 9 |
| Beveiligingsheaders | Content-Security-Policy, Strict-Transport-Security (twee jaar, `includeSubDomains`), X-Frame-Options: `DENY`, X-Content-Type-Options: `nosniff`, Referrer-Policy, Permissions-Policy en Cross-Origin-Opener-Policy op elke route. | Sectie 5.2 |
| Rate limiting | Sliding-window rate limiting op AI-endpoints, op het contactformulier en op alle authenticated tRPC-mutaties, met aparte buckets per categorie en per gebruiker of IP. | Sectie 9 |
| Pseudonimisering richting AI-dienstverleners | HMAC-SHA-256 pseudonimisering van direct identificerende persoonsgegevens vóór verzending naar Anthropic; het taalmodel ontvangt uitsluitend pseudoniemen in de vorm `Medewerker A3F2`. | Sectie 11.3 |
| Onveranderbare audit-log | Database-trigger blokkeert `UPDATE` en `DELETE` op de audit-logtabel; iedere wijziging op gevoelige tabellen wordt vastgelegd met actor, tijdstip, IP-adres en volledige voor- en na-staat. | Sectie 10 |
| Attributie van service-role mutaties | Mutaties via de service-role verbinding worden via een `x-actor-id`-header toegerekend aan de oorspronkelijke gebruiker; administratieve endpoints schrijven expliciet naar `audit_log`. | Sectie 10.3 |
| Recht op vergetelheid (art. 17 AVG) | Onomkeerbare anonimiseringsprocedure voor medewerker-rijen, beschikbaar via de gebruikersinterface voor `tenant_admin` en hoger, met dubbele audit-registratie. | Sectie 12.2 |
| Soft-delete markering | Kolommen `deleted_at` en `deleted_by` op de tabel `employee`, met CHECK-constraint en partieel index, ten behoeve van traceerbaarheid van AVG-erasure. | Sectie 12.2 |
| Persistentie van contactformulier-inzendingen | Dedicated tabel met Row-Level Security in deny-all-stand, server-side validatie, automatische opruiming na één jaar; persoonsgegevens worden niet naar applicatie-logs geschreven. | Sectie 13.0 |
| Geautomatiseerde monitoring van afhankelijkheidskwetsbaarheden | Continue scan op afhankelijkheidskwetsbaarheden via `npm audit` in de CI-pipeline; pull requests die een nieuwe HIGH- of CRITICAL-severity introduceren worden geblokkeerd. Op de datum van dit document staan productie-dependencies op nul HIGH-severity kwetsbaarheden. | Sectie 14 |
| Gestructureerde logging | Server-side events worden als gestructureerde JSON-records vastgelegd, voorzien van automatische redactie van bekende PII-veldnamen en met optionele doorzending naar een externe logging-voorziening. | Sectie 13.0 |
| Externe penetratietest | **Optioneel.** Op verzoek van Protest Sportwear wordt voorafgaand aan de productie-uitrol een externe penetratietest uitgevoerd door een gekwalificeerde partij (Computest, Fox-IT, Zerocopter of vergelijkbaar), met rapportage onder geheimhouding aan Protest Sportwear. De voorwaarden zijn opgenomen in artikel 4 van het Security Addendum. | Sectie 14 |
| Encryptie van integratie-credentials | **Voorwaardelijk.** De databaseschema-voorziening voor encrypted integratie-credentials wordt geactiveerd voorafgaand aan de eerste externe systeemkoppeling (WMS, OMS of HRIS) met AES-256-GCM en per-organisatie sleutels via Supabase Vault. Tot dat moment is geen externe systeemkoppeling actief en bestaat er geen integratie-rij in de database. | Sectie 5.4 |

---

## 16. Beperkingen van de scope

Ten behoeve van een nauwkeurige weergave van de feitelijke situatie benoemt Ascentra hieronder de aspecten die buiten de scope van dit document en buiten de huidige werking van Ascentra vallen:

- Ascentra beschikt op de datum van dit document niet over een eigen ISO 27001, ISO 27701, SOC 2 of NEN 7510 certificering op bedrijfsniveau. Voor de onderliggende infrastructuurcertificering wordt verwezen naar de certificeringen van Supabase en Vercel.
- Ascentra is geen geaccrediteerde verwerker voor bijzondere persoonsgegevens in de zin van artikel 9 AVG. Het Astra-platform is niet ontworpen voor de verwerking van gezondheidsgegevens, etnische afkomst, politieke overtuigingen of andere bijzondere categorieën als zelfstandig doeleinde.
- Ascentra heeft geen formeel aangestelde Functionaris Gegevensbescherming in de zin van artikel 37 AVG. Voor een verwerker van de huidige omvang en activiteit is een dergelijke aanstelling niet wettelijk vereist.
- Ascentra heeft op de datum van dit document geen Zero Data Retention-overeenkomst met Anthropic. Gegeven de in sectie 11.3 beschreven pseudonimiseringsarchitectuur, waarin direct identificerende persoonsgegevens niet aan Anthropic worden verstrekt, is een dergelijke overeenkomst voor de huidige verwerking niet noodzakelijk.
- Ascentra hanteert geen klantspecifieke encryptiesleutels (customer-managed keys / bring-your-own-key). Versleuteling in rust gebruikt platform-beheerde sleutels via Supabase.

Deze posten zijn opgenomen ten behoeve van een nauwkeurige scope-afbakening en kunnen op verzoek nader worden besproken.

---

## 17. Contractuele borging

De in dit document beschreven maatregelen worden juridisch vastgelegd in de volgende set documenten, die tezamen het contractuele kader tussen Ascentra B.V. en Protest Sportwear B.V. vormen:

1. **Hoofdovereenkomst.** Bevat serviceniveau, vergoeding, looptijd en de wederzijdse verantwoordelijkheden voor de levering van het Astra-platform.
2. **Verwerkersovereenkomst (artikel 28 AVG).** Regelt de verwerker-verwerkingsverantwoordelijke verhouding, de instructiebevoegdheid, de geheimhoudingsplicht, de subverwerkerslijst, de beveiligingsmaatregelen, de bijstand aan de verwerkingsverantwoordelijke bij betrokkenenrechten, de meldplicht bij datalekken, de audit-rechten van Protest Sportwear en de retourneer- en verwijderingsplicht bij contractbeëindiging.
3. **Security Addendum.** Codificeert de in sectie 15 beschreven beveiligingsmaatregelen als contractuele verplichting, met een opschortings- en opzeggingsrecht voor Protest Sportwear bij structurele niet-naleving.
4. **Standard Contractual Clauses.** Voor zover van toepassing op doorgifte aan Anthropic PBC in de Verenigde Staten, in lijn met de in sectie 11.3 beschreven pseudonimisering en de daaraan ten grondslag liggende dataminimalisatie.

---

## 18. Bijlagen en vervolgproces

Op verzoek stelt Ascentra de volgende aanvullende documenten beschikbaar:

- Concept Verwerkersovereenkomst;
- Concept Security Addendum;
- Overzicht van subverwerkers, met de bijbehorende verwerkersovereenkomsten van Supabase, Vercel en Anthropic;
- Technisch-architectonisch overzicht, omvattende componenten- en datastroomdiagrammen;
- Voorbeeldexport van een Data Subject Access Request.

### 18.1 Voorgesteld vervolgproces

1. **Technische due-diligence sessie.** Ascentra presenteert de relevante delen van de codebase en de productieconfiguratie aan de technische vertegenwoordiging van Protest Sportwear.
2. **Juridische review.** Protest Sportwear laat de Verwerkersovereenkomst en het Security Addendum reviewen door eigen of externe juridische adviseurs.
3. **Ondertekening Security Addendum.** Contractuele vastlegging van de in sectie 15 beschreven beveiligingsmaatregelen.
4. **Gecontroleerde pilot.** Eerste uitrol op één site, met test- of beperkte productiedata.
5. **Externe penetratietest** (optioneel, op verzoek van Protest Sportwear).
6. **Productie-uitrol.** Uitrol op alle sites, met de in sectie 15 opgenomen verplichtingen aantoonbaar nageleefd.

---

## 19. Slotverklaring

Dit document beschrijft de stand van de informatiebeveiliging en de naleving van de Algemene Verordening Gegevensbescherming van het Astra-platform op 9 april 2026. De inhoud is opgesteld door Ascentra B.V. en is in zijn geheel verifieerbaar tijdens een technische en juridische due-diligence. Materiële wijzigingen in de architectuur, in de subverwerkerslijst of in het wettelijk kader leiden tot herziening van dit document en hernieuwde verstrekking aan Protest Sportwear B.V.

Voor aanvullende informatie, een technische toelichting of het vaststellen van een vervolgafspraak is de in sectie 3.2 genoemde contactweg beschikbaar.

Aldus opgesteld te Assen op 9 april 2026.

**Alex Sinigaglia**
Oprichter, Ascentra B.V.

_Handtekening:_ ____________________________

---

### Colofon

Opsteller: Ascentra B.V., Oranjestraat 11, 9401 KE Assen, KvK 98227548. Document versie 1.1. Brondatum: 9 april 2026. Het document is opgesteld op basis van een code-niveau beveiligingsreview van de Astra-codebase, aangevuld met een handmatige controle van databaseschema's, authenticatie-implementatie en datastromen naar externe dienstverleners. Iedere technische uitspraak is herleidbaar tot specifieke bestanden en regels in de broncode en kan tijdens due-diligence worden gecontroleerd.
